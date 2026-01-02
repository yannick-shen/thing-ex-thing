const authManager = require('../../utils/auth.js');

Page({
  data: {
    isLoggedIn: false,
    userInfo: null,
    messageCount: 0
  },

  onLoad() {
    // 检查登录状态但不自动跳转，只显示状态
    this.checkLoginStatus();
    
    // 监听登录状态变化
    authManager.onLoginStatusChanged(this.onLoginStatusChanged.bind(this));
  },

  onShow() {
    // 每次显示页面时刷新登录状态，但不自动跳转
    this.checkLoginStatus();
  },

  // 检查登录状态（不自动跳转）
  checkLoginStatus() {
    const isLoggedIn = this.isActuallyLoggedIn();
    const userInfo = authManager.getCurrentUser();
    const skipLoginCheck = wx.getStorageSync('skipLoginCheck') || false;
    
    // 如果用户选择了跳过登录，强制显示未登录状态
    const shouldShowLoggedIn = isLoggedIn && !skipLoginCheck;
    
    this.setData({
      isLoggedIn: shouldShowLoggedIn,
      userInfo: shouldShowLoggedIn ? userInfo : null,
      // 如果跳过登录，重置相关数据
      messageCount: 0
    });

    // 只有在真正已登录且未跳过时才加载消息
    if (shouldShowLoggedIn) {
      this.loadMessageCount();
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

  // 登录状态变化回调
  onLoginStatusChanged(user) {
    this.setData({
      isLoggedIn: !!user,
      userInfo: user
    });
  },

  // 跳转登录页面
  goToLogin() {
    wx.navigateTo({
      url: '/pages/login/login?redirect=' + encodeURIComponent('/pages/profile/profile')
    });
  },

  // 统一的登录跳转方法
  redirectToLogin(targetUrl) {
    wx.navigateTo({
      url: '/pages/login/login?redirect=' + encodeURIComponent(targetUrl)
    });
  },

  // 加载统计数据
  async loadStats() {
    try {
      // 获取我的物品数量
      const itemsResult = await wx.cloud.callFunction({
        name: 'get-my-items',
        data: {}
      });

      if (itemsResult.result && itemsResult.result.code === 0) {
        const items = itemsResult.result.data.items || [];
        const now = Date.now();
        const activeItems = items.filter(item => 
          item.status === 'on' && item.expireAt > now
        );

        this.setData({
          'stats.published': items.length,
          'stats.active': activeItems.length
        });
      }

      // 获取收藏数量
      const favoritesResult = await wx.cloud.callFunction({
        name: 'get-my-favorites',
        data: {}
      });

      if (favoritesResult.result && favoritesResult.result.code === 0) {
        const favorites = favoritesResult.result.data.favorites || [];
        this.setData({
          'stats.favorited': favorites.length
        });
      }
    } catch (error) {
      console.error('获取统计数据失败:', error);
      // 使用本地缓存的统计
      this.loadCachedStats();
    }
  },

  // 加载缓存统计
  loadCachedStats() {
    const cachedItems = wx.getStorageSync('myCachedItems') || [];
    const cachedFavorites = wx.getStorageSync('myCachedFavorites') || [];
    const now = Date.now();
    
    const activeItems = cachedItems.filter(item => 
      item.status === 'on' && item.expireAt > now
    );

    this.setData({
      stats: {
        published: cachedItems.length,
        active: activeItems.length,
        favorited: cachedFavorites.length
      }
    });
  },

  // 加载消息数量
  async loadMessageCount() {
    try {
      const result = await wx.cloud.callFunction({
        name: 'get-unread-messages-count',
        data: {}
      });

      if (result.result && result.result.success) {
        const unreadCount = result.result.data.unreadCount || 0;
        this.setData({ messageCount: unreadCount });
      } else {
        this.setData({ messageCount: 0 });
      }
    } catch (error) {
      console.error('加载消息数量失败:', error);
      this.setData({ messageCount: 0 });
    }
  },

  // 导航函数
  goToMyItems() {
    if (!this.data.isLoggedIn) {
      this.redirectToLogin('/pages/mine/mine');
      return;
    }
    wx.navigateTo({
      url: '/pages/mine/mine'
    });
  },

  goToFavorites() {
    console.log('点击了收藏按钮');
    if (!this.data.isLoggedIn) {
      console.log('用户未登录，跳转到登录页');
      this.redirectToLogin('/pages/favorites/favorites');
      return;
    }
    console.log('用户已登录，跳转到收藏页面');
    wx.navigateTo({
      url: '/pages/favorites/favorites'
    });
  },

  goToMessages() {
    if (!this.data.isLoggedIn) {
      this.redirectToLogin('/pages/messages/messages');
      return;
    }
    wx.navigateTo({
      url: '/pages/messages/messages'
    });
  },

  goToSettings() {
    wx.navigateTo({
      url: '/pages/settings/settings'
    });
  },

  goToPolicy() {
    wx.navigateTo({
      url: '/pages/policy/policy'
    });
  },



  // 联系客服
  contactService() {
    if (!this.data.isLoggedIn) {
      this.redirectToLogin('/pages/profile/profile');
      return;
    }
    
    wx.showModal({
      title: '联系客服',
      content: '您可以通过客服功能与我们联系',
      confirmText: '联系客服',
      success: (res) => {
        if (res.confirm) {
          // 使用客服消息功能
          wx.openCustomerServiceConversation({
            success: () => {
              console.log('打开客服会话成功');
            },
            fail: (err) => {
              console.error('打开客服会话失败', err);
              wx.showToast({ 
                title: '客服功能暂未开通', 
                icon: 'none' 
              });
            }
          });
        }
      }
    });
  },

  // 退出登录
  logout() {
    wx.showModal({
      title: '退出登录',
      content: '确定要退出登录吗？退出后需要重新登录才能使用完整功能。',
      confirmText: '确定退出',
      cancelText: '取消',
      confirmColor: '#ff4d4f',
      success: (res) => {
        if (res.confirm) {
          console.log('用户确认退出登录');
          
          // 显示loading
          wx.showLoading({
            title: '正在退出...'
          });
          
          try {
            // 清除用户信息
            authManager.logout();
            
            // 更新页面状态
            this.setData({
              isLoggedIn: false,
              userInfo: null,
              stats: {
                published: 0,
                active: 0,
                favorited: 0
              },
              messageCount: 0
            });
            
            // 隐藏loading
            wx.hideLoading();
            
            // 显示成功提示
            wx.showToast({
              title: '已退出登录',
              icon: 'success',
              duration: 1500
            });
            
            // 可选：跳转到登录页面或首页
            setTimeout(() => {
              wx.switchTab({
                url: '/pages/index/index'
              });
            }, 1000);
            
          } catch (error) {
            console.error('退出登录失败:', error);
            wx.hideLoading();
            wx.showToast({
              title: '退出失败，请重试',
              icon: 'none'
            });
          }
        }
      }
    });
  },

  // 页面分享
  onShareAppMessage() {
    return {
      title: '闲置地图 - 个人中心',
      path: '/pages/profile/profile'
    };
  }
});