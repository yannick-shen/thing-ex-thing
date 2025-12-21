const authManager = require('../../utils/auth.js');

Page({
  data: {
    isLoggedIn: false,
    currentTab: 'comments',
    comments: [],
    systemMessages: []
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
        const messages = result.result.data.messages.map(msg => ({
          id: msg._id,
          username: msg.fromUserName || '匿名用户',
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
        
        this.setData({ comments: messages });
      }
    } catch (error) {
      console.error('加载评论消息失败:', error);
      // 如果加载失败，使用空数组
      this.setData({ comments: [] });
    }
  },

  loadSystemMessages() {
    // 模拟系统消息
    const mockMessages = [
      {
        id: '1',
        title: '系统通知',
        content: '您的物品"iPhone 12"已成功发布，将在地图上展示30天',
        actionText: '查看详情',
        actionType: 'view_item',
        createdAt: Date.now() - 86400000,
        read: false
      },
      {
        id: '2',
        title: '活动通知',
        content: '新版本已发布，修复了若干问题并优化了用户体验',
        actionText: '立即更新',
        actionType: 'update_app',
        createdAt: Date.now() - 172800000,
        read: true
      }
    ];
    this.setData({ systemMessages: mockMessages });
  },

  formatTime(timestamp) {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return '刚刚';
    if (minutes < 60) return `${minutes}分钟前`;
    if (hours < 24) return `${hours}小时前`;
    if (days < 7) return `${days}天前`;
    return date.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' });
  },

  goToDetail(e) {
    const { id, jumpPath } = e.currentTarget.dataset;
    
    if (jumpPath) {
      // 如果有跳转路径，直接跳转到评论页面
      wx.navigateTo({ url: jumpPath });
    } else if (id) {
      // 否则跳转到物品详情页（兼容旧版本）
      wx.navigateTo({ url: `/pages/detail/detail?id=${id}` });
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



  // 页面分享
  onShareAppMessage() {
    return {
      title: '闲置地图 - 消息中心',
      path: '/pages/messages/messages'
    };
  }
});
