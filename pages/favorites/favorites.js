const app = getApp();
const authManager = require('../../utils/auth.js');

Page({
  data: { 
    isLoggedIn: false,
    items: [] 
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
    const isLoggedIn = authManager.isLoggedIn();
    
    this.setData({
      isLoggedIn: isLoggedIn
    });

    // 如果已登录，加载数据
    if (isLoggedIn) {
      this.loadFavorites();
    }
  },

  // 跳转到登录页面
  goToLogin() {
    wx.navigateTo({
      url: '/pages/login/login?redirect=' + encodeURIComponent('/pages/favorites/favorites')
    });
  },


  loadFavorites() {
    wx.showLoading({ title: '加载中...' });
    wx.cloud.callFunction({ name: 'get-my-favorites' }).then(res => {
      wx.hideLoading();
      if (res.result.code === 0) {
        this.setData({ items: res.result.data.items });
      } else {
        wx.showToast({ title: res.result.message || '加载失败', icon: 'none' });
      }
    }).catch(err => {
      wx.hideLoading();
      console.error(err);
      wx.showToast({ title: '加载失败', icon: 'none' });
    });
  },
  goDetail(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: '/pages/detail/detail?id=' + id });
  },

});