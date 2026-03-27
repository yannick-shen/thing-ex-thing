const app = getApp();
const authManager = require('../../utils/auth.js');

Page({
  data: { 
    isLoggedIn: false,
    items: [],
    hasLoadedData: false // 添加数据加载状态标识
  },
  
  onLoad() {
    // 检查登录状态但不跳转
    this.checkLoginStatus();
  },

  onShow() {
    const needRefresh = wx.getStorageSync('refreshFavorites');

    if (this.data.isLoggedIn && (needRefresh || !this.data.hasLoadedData)) {
      this.loadFavorites();
      wx.removeStorageSync('refreshFavorites');
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


  // 获取云存储图片临时链接
  async downloadCloudImages(images) {
    const localImages = [];
    const cloudIds = [];

    for (let i = 0; i < images.length; i++) {
      const image = images[i];
      console.log('处理图片:', image);
      if (image && image.startsWith('cloud://')) {
        cloudIds.push(image);
      } else {
        localImages.push(image);
      }
    }

    // 批量获取临时链接
    if (cloudIds.length > 0) {
      try {
        const result = await wx.cloud.getTempFileURL({
          fileList: cloudIds,
          maxAge: 7200 // 2小时有效期
        });
        console.log('临时链接结果:', result);

        if (result.fileList && result.fileList.length > 0) {
          result.fileList.forEach(file => {
            if (file.status === 0 && file.tempFileURL) {
              localImages.push(file.tempFileURL);
            } else {
              console.error('获取临时链接失败:', file);
              localImages.push('/assets/images/placeholder-empty.png');
            }
          });
        }
      } catch (err) {
        console.error('获取临时链接异常:', err);
        // 失败时全部使用占位图
        cloudIds.forEach(() => {
          localImages.push('/assets/images/placeholder-empty.png');
        });
      }
    }

    return localImages;
  },

  async loadFavorites() {
    wx.cloud.callFunction({ name: 'get-my-favorites' }).then(res => {
      if (res.result && res.result.code === 0) {
        let items = res.result.data.items || [];
        this.setData({
          items: items,
          hasLoadedData: true
        });
      } else {
        wx.showToast({ title: (res.result && res.result.message) || '加载失败', icon: 'none' });
      }
    }).catch(err => {
      wx.showToast({ title: '加载失败', icon: 'none' });
    });
  },
  goDetail(e) {
    const id = e.currentTarget.dataset.id;
    
    // 查询物品状态
    const db = wx.cloud.database();
    db.collection('items').doc(id).get().then(res => {
      const item = res.data;
      if (!item || item.status !== 'on') {
        wx.showModal({
          title: '提示',
          content: '该物品已下架或删除',
          showCancel: false
        });
        return;
      }
      wx.navigateTo({ url: '/pages/detail/detail?id=' + id });
    }).catch(err => {
      wx.showModal({
        title: '提示',
        content: '该物品已下架或删除',
        showCancel: false
      });
    });
  },

  // 图片加载错误处理
  onImageError(e) {
    const index = e.currentTarget.dataset.index;
    if (index !== undefined) {
      const items = this.data.items;
      items[index].images[0] = '/assets/images/placeholder-empty.png';
      this.setData({ items });
    }
  },

});