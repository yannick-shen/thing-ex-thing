const app = getApp();
const authManager = require('../../utils/auth.js');

Page({
  data: { 
    isLoggedIn: false,
    items: [],
    hasLoadedData: false // 添加数据加载状态标识
  },
  
  onLoad() {
    console.log('收藏页面加载');
    // 检查登录状态但不跳转
    this.checkLoginStatus();
  },

  onShow() {
    console.log('收藏页面显示');
    // 每次显示页面时检查登录状态
    this.checkLoginStatus();
    
    // 只有在数据未加载时才加载
    if (!this.data.hasLoadedData && this.data.isLoggedIn) {
      this.loadFavorites();
    }
  },

  // 检查登录状态但不跳转
  checkLoginStatus() {
    const isLoggedIn = authManager.isLoggedIn();
    
    this.setData({
      isLoggedIn: isLoggedIn
    });

    // 如果已登录且数据未加载，加载数据
    if (isLoggedIn && !this.data.hasLoadedData) {
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
    console.log('开始加载收藏数据');
    
    // 只有在数据为空时才显示加载提示
    if (this.data.items.length === 0) {
      wx.showLoading({ title: '加载中...' });
    }
    
    wx.cloud.callFunction({ name: 'get-my-favorites' }).then(res => {
      console.log('收藏数据返回:', res);
      wx.hideLoading();
      if (res.result && res.result.code === 0) {
        this.setData({ 
          items: res.result.data.items,
          hasLoadedData: true // 标记数据已加载
        });
        console.log('收藏数据加载成功:', res.result.data.items);
      } else {
        console.error('收藏数据加载失败:', res);
        wx.showToast({ title: (res.result && res.result.message) || '加载失败', icon: 'none' });
      }
    }).catch(err => {
      wx.hideLoading();
      console.error('收藏数据加载异常:', err);
      wx.showToast({ title: '加载失败', icon: 'none' });
    });
  },
  goDetail(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: '/pages/detail/detail?id=' + id });
  },

});