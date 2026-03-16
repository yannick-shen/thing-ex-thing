const app = getApp();
const authManager = require('../../utils/auth.js');

Page({
  data: {
    itemId: '',
    itemInfo: null,
    comments: [],
    commentText: '',
    hasContent: false,
    replyingTo: null,
    inputFocused: false,
    loading: false,
    submitting: false,
    hasMore: true,
    page: 1,
    pageSize: 20,
    inputPlaceholder: '写下你的留言...',
    targetCommentId: null,
    highlightedCommentId: null,
    isLoggedIn: false
  },

  onLoad(options) {
    const { itemId, title, commentId } = options;
    
    // 检查登录状态
    const isLoggedIn = authManager.isLoggedIn();
    this.setData({
      itemId,
      targetCommentId: commentId || null,
      isLoggedIn
    });
    
    // 无论是否登录都可以查看评论和物品信息
    if (itemId) {
      // 监听 eventChannel，获取传递的物品信息
      const eventChannel = this.getOpenerEventChannel();
      if (eventChannel) {
        eventChannel.on ('transferItem', (item) => {
          // 使用传递的物品信息，避免重复调用云函数
          this.setData({ itemInfo: item });
        });
      }
      
      this.loadComments();
    } else {
      wx.showToast({
        title: '参数错误',
        icon: 'none'
      });
    }
  },

  onShow() {
    // 页面显示时刷新评论列表和登录状态
    const isLoggedIn = authManager.isLoggedIn();
    this.setData({ isLoggedIn });
    
    if (this.data.itemId) {
      this.loadComments(true);
    }
  },

  // 加载评论列表
  async loadComments(refresh = false) {
    if (this.data.loading) return;

    this.setData({ loading: true });

    try {
      const { page, pageSize, itemId } = this.data;
      const currentPage = refresh ? 1 : page;

      const result = await wx.cloud.callFunction({
        name: 'get-comments',
        data: {
          itemId,
          page: currentPage,
          pageSize,
          refresh
        }
      });

      if (result.result && result.result.success) {
        const { comments, hasMore, total } = result.result.data;
        
        const newComments = refresh ? comments : [...this.data.comments, ...comments];
        
        this.setData({
          comments: newComments,
          hasMore,
          page: refresh ? 2 : page + 1,
          total
        });

        // 如果有目标评论ID，在第一次加载时滚动到该评论
        if (this.data.targetCommentId && refresh) {
          this.scrollToComment(this.data.targetCommentId);
        }
      }
    } catch (error) {
      console.error('加载评论失败:', error);
      wx.showToast({
        title: '加载失败',
        icon: 'none'
      });
    } finally {
      this.setData({ loading: false });
    }
  },

  // 加载更多评论
  loadMoreComments() {
    if (this.data.hasMore && !this.data.loading) {
      this.loadComments();
    }
  },

  // 评论输入
  onCommentInput(e) {
    const newValue = e.detail.value;
    const hasContent = newValue && newValue.trim().length > 0;
    
    this.setData({
      commentText: newValue,
      hasContent: hasContent
    });
  },

  // 输入框聚焦
  onInputFocus() {
    this.setData({ inputFocused: true });
  },

  // 输入框失焦
  onInputBlur() {
    // 延迟失焦，避免点击回复按钮时输入框先失焦
    setTimeout(() => {
      this.setData({ inputFocused: false });
    }, 200);
  },

  // 回复评论
  onReply(e) {
    const comment = e.currentTarget.dataset.comment;
    this.setData({
      replyingTo: comment,
      commentText: '',
      inputFocused: true,
      inputPlaceholder: `回复 @${comment.userName}：写下你的留言...`
    });
  },

  // 取消回复
  cancelReply() {
    this.setData({
      replyingTo: null,
      commentText: '',
      hasContent: false,
      inputPlaceholder: '写下你的留言...'
    });
  },

  // 提交评论
  async submitComment() {
    const { commentText, replyingTo, itemId, itemInfo } = this.data;
    
    if (!commentText.trim()) {
      return;
    }

    // 检查登录状态
    if (!authManager.isLoggedIn()) {
      wx.showModal({
        title: '提示',
        content: '请先登录后再发表评论',
        showCancel: false,
        success: () => {
          wx.switchTab({
            url: '/pages/profile/profile'
          });
        }
      });
      return;
    }

    const user = authManager.getCurrentUser();
    if (!user || !user.userId) {
      wx.showModal({
        title: '提示',
        content: '请先登录后再发表评论',
        showCancel: false,
        success: () => {
          wx.switchTab({
            url: '/pages/profile/profile'
          });
        }
      });
      return;
    }

    this.setData({ submitting: true });

    try {
      const result = await wx.cloud.callFunction({
        name: 'add-comment',
        data: {
          itemId,
          content: commentText.trim(),
          replyToUserId: replyingTo ? replyingTo.userId : null,
          replyToCommentId: replyingTo ? replyingTo._id : null
        }
      });

      if (result.result && result.result.success) {
        // 清空输入框
        this.setData({
          commentText: '',
          hasContent: false,
          replyingTo: null,
          inputFocused: false,
          inputPlaceholder: '写下你的留言...'
        });

        // 刷新评论列表
        this.loadComments(true);

        // 显示成功提示
        wx.showToast({
          title: '发送成功',
          icon: 'success'
        });

        // 如果是评论物品，给物品发布者发送消息
        if (!replyingTo && itemInfo && itemInfo.authorId !== user.userId) {
          this.createCommentMessage(result.result.data.comment, itemInfo);
        }
        // 如果是回复评论，给被回复的人发送消息
        else if (replyingTo && replyingTo.userId !== user.userId) {
          this.createReplyMessage(result.result.data.comment, replyingTo, itemInfo);
        }
      } else {
        throw new Error(result.result?.message || '发送失败');
      }
    } catch (error) {
      console.error('发送评论失败:', error);
      wx.showToast({
        title: error.message || '发送失败',
        icon: 'none'
      });
    } finally {
      this.setData({ submitting: false });
    }
  },

  // 创建评论消息
  async createCommentMessage(comment, itemInfo) {
    try {
      await wx.cloud.callFunction({
        name: 'create-comment-message',
        data: {
          itemId: this.data.itemId,
          commentId: comment._id,
          commenterId: comment.userId,
          commenterName: comment.userName,
          itemTitle: itemInfo.title
        }
      });
    } catch (error) {
      console.error('创建评论消息失败:', error);
    }
  },

  // 创建回复消息
  async createReplyMessage(comment, repliedComment, itemInfo) {
    try {
      await wx.cloud.callFunction({
        name: 'create-reply-message',
        data: {
          itemId: this.data.itemId,
          commentId: comment._id,
          replyToUserId: repliedComment.userId,
          replyToUserName: repliedComment.userName,
          replierId: comment.userId,
          replierName: comment.userName,
          itemTitle: itemInfo.title
        }
      });
    } catch (error) {
      console.error('创建回复消息失败:', error);
    }
  },

  // 点击评论项
  onCommentTap(e) {
    const comment = e.currentTarget.dataset.comment;
    // 可以在这里实现点击评论的扩展功能
  },

  // 滚动到指定评论
  scrollToComment(targetCommentId) {
    // 查找目标评论在列表中的位置
    const commentIndex = this.data.comments.findIndex(comment => comment._id === targetCommentId);
    
    if (commentIndex !== -1) {
      // 使用微信小程序的节点查询API
      const query = wx.createSelectorQuery();
      query.select(`.comment-item:nth-child(${commentIndex + 1})`).boundingClientRect();
      query.selectViewport().scrollOffset();
      query.exec((res) => {
        if (res[0]) {
          const { top } = res[0];
          const scrollTop = top - 100; // 留出一些顶部空间
          
          wx.pageScrollTo({
            scrollTop,
            duration: 300
          });

          // 高亮目标评论
          this.setData({
            highlightedCommentId: targetCommentId
          });

          // 3秒后取消高亮
          setTimeout(() => {
            this.setData({
              highlightedCommentId: null
            });
          }, 3000);
        }
      });
    }
  },

  // 跳转到登录页面
  goToLogin() {
    wx.navigateTo({
      url: '/pages/login/login?redirect=' + encodeURIComponent('/pages/comment/comment?itemId=' + this.data.itemId)
    });
  },

  // 返回上一页
  goBack() {
    wx.navigateBack();
  },

  // 格式化评论时间
  formatCommentTime(timestamp) {
    const now = Date.now();
    const diff = now - timestamp;
    const minute = 60 * 1000;
    const hour = 60 * minute;
    const day = 24 * hour;

    if (diff < minute) {
      return '刚刚';
    } else if (diff < hour) {
      return `${Math.floor(diff / minute)}分钟前`;
    } else if (diff < day) {
      return `${Math.floor(diff / hour)}小时前`;
    } else if (diff < 7 * day) {
      return `${Math.floor(diff / day)}天前`;
    } else {
      const date = new Date(timestamp);
      return `${date.getMonth() + 1}-${date.getDate()}`;
    }
  },

  // 格式化创建时间
  formatCreateTime(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;
    const day = 24 * 60 * 60 * 1000;

    if (diff < day) {
      return '今天';
    } else if (diff < 2 * day) {
      return '昨天';
    } else if (diff < 7 * day) {
      return `${Math.floor(diff / day)}天前`;
    } else {
      return `${date.getMonth() + 1}-${date.getDate()}`;
    }
  }
});