const authManager = require('../../utils/auth.js');

Page({
  data: {
    isLoggedIn: false,
    currentTab: 'comments',
    comments: [],
    contactRequests: [],
    contactApprovedMessages: [],
    systemMessages: [],
    commentsUnreadCount: 0,
    requestsUnreadCount: 0,
    approvedUnreadCount: 0,
    systemUnreadCount: 0
  },

  onLoad() {
    // 检查登录状态但不跳转
    this.checkLoginStatus();
  },

  onShow() {
    // 每次显示页面时检查登录状态
    this.checkLoginStatus();
  },

  // 检查登录状态但不跳转
  checkLoginStatus() {
    const isLoggedIn = this.isActuallyLoggedIn();
    
    this.setData({
      isLoggedIn: isLoggedIn
    });

    // 如果已登录，加载数据
    if (isLoggedIn) {
      this.loadComments();
      this.loadSystemMessages();
    }
  },

  // 更严格的登录验证
  isActuallyLoggedIn() {
    const isLoggedIn = authManager.isLoggedIn();
    const user = authManager.getCurrentUser();
    
    // 检查用户数据完整性
    if (!isLoggedIn || !user) {
      return false;
    }
    
    // 检查必要字段
    if (!user.userId || !user.profile) {
      console.log('用户数据不完整，清除无效数据');
      this.clearInvalidLoginData();
      return false;
    }
    
    return true;
  },

  // 清除无效的登录数据
  clearInvalidLoginData() {
    wx.removeStorageSync('userId');
    wx.removeStorageSync('userInfo');
    authManager.currentUser = null;
  },

  // 跳转到登录页面
  goToLogin() {
    wx.navigateTo({
      url: '/pages/login/login?redirect=' + encodeURIComponent('/pages/messages/messages')
    });
  },



  switchTab(e) {
    const tab = e.currentTarget.dataset.tab;
    this.setData({ currentTab: tab });
    if (tab === 'comments') {
      this.loadComments();
    } else if (tab === 'requests') {
      this.loadContactRequests();
    } else if (tab === 'approved') {
      this.loadContactApprovedMessages();
    } else {
      this.loadSystemMessages();
    }
  },

  async loadComments() {
    try {
      const result = await wx.cloud.callFunction({
        name: 'get-comment-messages',
        data: { page: 1, pageSize: 20 }
      });

      if (result.result && result.result.success) {
        const messages = result.result.data.messages;

        const processedMessages = messages.map(msg => ({
          id: msg._id,
          username: msg.fromUserName || '匿名用户',
          avatar: msg.fromUserAvatar || '',
          content: msg.content,
          itemTitle: msg.content.includes('《') ?
            msg.content.match(/《([^》]+)》/)?.[1] || '物品' : '物品',
          itemImage: '/assets/images/placeholder-item.png',
          itemId: msg.itemId,
          createdAt: msg.createdAt,
          read: msg.isRead,
          jumpPath: msg.jumpPath,
          type: msg.type
        }));

        // 计算未读数量
        const unreadCount = processedMessages.filter(msg => !msg.read).length;

        this.setData({
          comments: processedMessages,
          commentsUnreadCount: unreadCount
        });
      }
    } catch (error) {
      console.error('加载评论消息失败:', error);
      this.setData({ comments: [], commentsUnreadCount: 0 });
    }
  },

  loadSystemMessages() {
    // 模拟系统消息（暂时屏蔽）
    const mockMessages = [
      // {
      //   id: '1',
      //   title: '系统通知',
      //   content: '您的物品"iPhone 12"已成功发布，将在地图上展示30天',
      //   actionText: '查看详情',
      //   actionType: 'view_item',
      //   createdAt: Date.now() - 86400000,
      //   read: false
      // },
      // {
      //   id: '2',
      //   title: '活动通知',
      //   content: '新版本已发布，修复了若干问题并优化了用户体验',
      //   actionText: '立即更新',
      //   actionType: 'update_app',
      //   createdAt: Date.now() - 172800000,
      //   read: true
      // }
    ];
    // 计算未读数量
    const unreadCount = mockMessages.filter(msg => !msg.read).length;

    this.setData({
      systemMessages: mockMessages,
      systemUnreadCount: unreadCount
    });
  },

  async loadContactRequests() {
    try {
      const result = await wx.cloud.callFunction({
        name: 'get-contact-requests',
        data: { page: 1, pageSize: 20 }
      });

      if (result.result && result.result.code === 0) {
        const requests = result.result.data.requests;
        // 计算未处理数量（pending 状态）
        const unreadCount = requests.filter(req => req.status === 'pending').length;

        this.setData({
          contactRequests: requests,
          requestsUnreadCount: unreadCount
        });
      } else {
        this.setData({
          contactRequests: [],
          requestsUnreadCount: 0
        });
      }
    } catch (error) {
      console.error('加载联系申请失败:', error);
      this.setData({
        contactRequests: [],
        requestsUnreadCount: 0
      });
    }
  },

  async loadContactApprovedMessages() {
    try {
      const result = await wx.cloud.callFunction({
        name: 'get-contact-approved-messages',
        data: { page: 1, pageSize: 20 }
      });

      if (result.result && result.result.code === 0) {
        const messages = result.result.data.messages;

        this.setData({
          contactApprovedMessages: messages
        });
      } else {
        this.setData({
          contactApprovedMessages: []
        });
      }
    } catch (error) {
      console.error('加载联系成功消息失败:', error);
      this.setData({
        contactApprovedMessages: []
      });
    }
  },

  formatTime(timestamp) {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (diff < 0) {
      // 未来时间，显示具体日期
      return date.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
    }
    if (minutes < 1) return '刚刚';
    if (minutes < 60) return `${minutes}分钟前`;
    if (hours < 24) return `${hours}小时前`;
    if (days < 7) return `${days}天前`;
    return date.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' });
  },

  async goToDetail(e) {
    const { id, jumpPath, messageId } = e.currentTarget.dataset;

    if (messageId) {
      // 更新本地消息为已读
      const comments = this.data.comments.map(msg => {
        if (msg.id === messageId) {
          return { ...msg, read: true };
        }
        return msg;
      });

      // 减少未读计数
      const msg = this.data.comments.find(m => m.id === messageId);
      if (msg && !msg.read) {
        this.setData({
          comments,
          commentsUnreadCount: Math.max(0, this.data.commentsUnreadCount - 1)
        });
      } else {
        this.setData({ comments });
      }

      // 异步调用云函数标记数据库中的消息为已读
      wx.cloud.callFunction({
        name: 'mark-message-read',
        data: { messageId }
      }).catch(error => {
        console.error('标记消息已读失败:', error);
      });

      this.updateGlobalMessageCount();
    }

    if (jumpPath) {
      // 如果有跳转路径，直接跳转到评论页面
      wx.navigateTo({ url: jumpPath });
    } else if (id) {
      // 否则跳转到物品详情页（兼容旧版本）
      wx.navigateTo({ url: `/pages/detail/detail?id=${id}` });
    }
  },

  // 更新全局消息数量
  updateGlobalMessageCount() {
    // 获取当前页面栈中的profile页面
    const pages = getCurrentPages();
    const profilePage = pages.find(page => page.route === 'pages/profile/profile');

    if (profilePage && profilePage.loadMessageCount) {
      profilePage.loadMessageCount();
    }
  },

  handleMessageAction(e) {
    const { type, id } = e.currentTarget.dataset;

    switch (type) {
      case 'view_item':
        // 跳转到物品详情
        wx.navigateTo({ url: '/pages/mine/mine' });
        break;
      case 'update_app':
        wx.showToast({ title: '已是最新版本', icon: 'success' });
        break;
      default:
        console.log('Unknown action type:', type);
    }
  },

  async acceptContactRequest(e) {
    const requestId = e.currentTarget.dataset.id;

    wx.showModal({
      title: '同意联系',
      content: '同意后，买家可以查看您的微信二维码',
      confirmText: '同意',
      cancelText: '取消',
      success: async (res) => {
        if (res.confirm) {
          wx.showLoading({ title: '处理中...' });

          try {
            const result = await wx.cloud.callFunction({
              name: 'accept-contact-request',
              data: { requestId }
            });

            wx.hideLoading();

            if (result.result && result.result.code === 0) {
              wx.showToast({
                title: '已同意',
                icon: 'success'
              });
              this.loadContactRequests();
            } else if (result.result?.message && result.result.message.includes('请先设置联系方式')) {
              wx.showModal({
                title: '提示',
                content: '您还未设置联系方式，是否前往设置？',
                confirmText: '前往设置',
                cancelText: '取消',
                success: (modalRes) => {
                  if (modalRes.confirm) {
                    wx.navigateTo({
                      url: '/pages/contact-settings/contact-settings'
                    });
                  }
                }
              });
            } else {
              wx.showToast({
                title: result.result?.message || '操作失败',
                icon: 'none'
              });
            }
          } catch (error) {
            wx.hideLoading();
            wx.showToast({
              title: '操作失败',
              icon: 'none'
            });
          }
        }
      }
    });
  },

  async rejectContactRequest(e) {
    const requestId = e.currentTarget.dataset.id;

    wx.showModal({
      title: '拒绝联系',
      content: '确定要拒绝这个联系申请吗？',
      confirmText: '拒绝',
      cancelText: '取消',
      confirmColor: '#ff4d4f',
      success: async (res) => {
        if (res.confirm) {
          wx.showLoading({ title: '处理中...' });

          try {
            const result = await wx.cloud.callFunction({
              name: 'reject-contact-request',
              data: { requestId }
            });

            wx.hideLoading();

            if (result.result && result.result.code === 0) {
              wx.showToast({
                title: '已拒绝',
                icon: 'success'
              });
              this.loadContactRequests();
            } else {
              wx.showToast({
                title: result.result?.message || '操作失败',
                icon: 'none'
              });
            }
          } catch (error) {
            wx.hideLoading();
            wx.showToast({
              title: '操作失败',
              icon: 'none'
            });
          }
        }
      }
    });
  },

  goToContactSuccess(e) {
    const messageId = e.currentTarget.dataset.id;

    wx.navigateTo({
      url: `/pages/contact-success/contact-success?requestId=${messageId}`
    });
  },



  // 页面分享
  onShareAppMessage() {
    return {
      title: '闲置地图 - 消息中心',
      path: '/pages/messages/messages'
    };
  }
});
