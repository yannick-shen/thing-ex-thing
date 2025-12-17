const authManager = require('../../utils/auth.js');

Page({
  data: { 
    item: null, 
    favorited: false, 
    createTime: '', 
    currentImgIndex: 0,
    showReport: false,
    selectedReason: '',
    reportDetail: '',
    showLoginModal: false,
    loginTitle: '需要登录',
    loginContent: '登录后可以更好地使用此功能',
    reportReasons: [
      { value: 'spam', label: '垃圾广告' },
      { value: 'fake', label: '虚假信息' },
      { value: 'illegal', label: '违法违规' },
      { value: 'fraud', label: '诈骗信息' },
      { value: 'other', label: '其他' }
    ]
  },
  onLoad(query) {
    const itemId = query.id;
    if (!itemId) {
      wx.showToast({ title: '参数错误', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 1500);
      return;
    }
    this.itemId = itemId;
    console.log('页面加载，物品ID:', itemId);
    
    // 检查是否是模拟数据
    if (itemId.startsWith('mock_')) {
      console.log('这是模拟数据，使用模拟详情');
      this.loadMockDetail(itemId);
    } else {
      console.log('这是真实数据，从云函数加载');
      this.loadDetail();
    }
  },
  // 检查数据库状态
  checkDatabase() {
    wx.showLoading({ title: '检查数据库...' });
    
    wx.cloud.callFunction({ 
      name: 'check-database', 
      data: {} 
    }).then(res => {
      wx.hideLoading();
      console.log('数据库检查结果:', res);
      
      if (res.result && res.result.code === 0) {
        const data = res.result.data;
        const message = `用户: ${data.currentUser}\n用户数: ${data.users.length}\n物品数: ${data.items.length}\n收藏数: ${data.favorites.length}`;
        
        wx.showModal({
          title: '数据库状态',
          content: message,
          showCancel: false
        });
      } else {
        wx.showToast({ title: '检查失败', icon: 'none' });
      }
    }).catch(err => {
      wx.hideLoading();
      console.error('检查数据库失败:', err);
      wx.showToast({ title: '检查失败', icon: 'none' });
    });
  },

  // 加载模拟数据详情
  loadMockDetail(itemId) {
    const mockIndex = parseInt(itemId.split('_')[1]) - 1;
    const modes = ['sale', 'exchange', 'donate'];
    
    const mockItem = {
      _id: itemId,
      id: itemId,
      title: `示例物品 ${mockIndex + 1}`,
      desc: '这是一个示例物品，展示在我的发布页面中。这是物品的详细描述信息，包含了物品的各种特性和使用说明。',
      mode: modes[mockIndex % 3],
      price: mockIndex === 0 ? (99 + (mockIndex + 1) * 50) : 0,
      addressText: '示例位置',
      lat: 39.908722,
      lng: 116.397499,
      images: ['/assets/images/placeholder-empty.png'],
      counters: { 
        views: Math.floor(Math.random() * 100), 
        favorites: Math.floor(Math.random() * 20), 
        comments: Math.floor(Math.random() * 10) 
      },
      status: mockIndex <= 1 ? 'on' : 'off',
      tradeMethod: 'face',
      createdAt: Date.now() - (mockIndex + 1) * 24 * 60 * 60 * 1000
    };
    
    const createTime = this.formatTime(mockItem.createdAt);
    
    this.setData({ 
      item: mockItem, 
      createTime, 
      originalLat: mockItem.lat,
      originalLng: mockItem.lng
    });
    
    console.log('模拟详情加载完成:', mockItem);
  },

  loadDetail() {
    wx.showLoading({ title: '加载中...' });
    console.log('开始加载物品详情，ID:', this.itemId);
    
    // 先测试简单云函数
    wx.cloud.callFunction({ 
      name: 'test-simple', 
      data: {} 
    }).then(res => {
      console.log('测试云函数返回结果:', res);
      
      if (res.result && res.result.code === 0) {
        console.log('云开发环境正常，开始获取物品详情');
        return this.loadItemDetail();
      } else {
        wx.hideLoading();
        console.error('测试云函数失败:', res);
        wx.showToast({ 
          title: '云开发环境异常', 
          icon: 'none',
          duration: 3000
        });
      }
    }).catch(err => {
      wx.hideLoading();
      console.error('调用测试云函数失败:', err);
      wx.showToast({ 
        title: '云函数未部署或网络错误', 
        icon: 'none',
        duration: 3000
      });
    });
  },

  loadItemDetail() {
    wx.cloud.callFunction({ 
      name: 'get-item-detail', 
      data: { itemId: this.itemId } 
    }).then(res => {
      wx.hideLoading();
      console.log('物品详情云函数返回结果:', res);
      
      if (res.result && res.result.code === 0) {
        const item = res.result.data.item;
        const createTime = this.formatTime(item.createdAt);
        console.log('物品详情加载成功:', item);
        
        this.setData({ 
          item, 
          createTime, 
          originalLat: item.lat,  // 保存原始纬度
          originalLng: item.lng   // 保存原始经度
        });
      } else {
        console.error('云函数返回错误:', res);
        const errorMsg = res.result ? res.result.message : '加载失败';
        console.error('错误详情:', JSON.stringify(res.result, null, 2));
        
        wx.showToast({ 
          title: errorMsg, 
          icon: 'none',
          duration: 5000
        });
      }
    }).catch(err => {
      wx.hideLoading();
      console.error('调用物品详情云函数失败:', err);
      console.error('错误详情:', JSON.stringify(err));
      
      wx.showToast({ 
        title: '获取详情失败，请重试', 
        icon: 'none',
        duration: 3000
      });
    });
  },
  handleFavorite() {
    const authManager = require('../../utils/auth.js');
    if (!authManager.isLoggedIn()) {
      this.setData({ showLoginModal: true });
      return;
    }

    const { item } = this.data;
    
    wx.showLoading({ title: '处理中...' });
    wx.cloud.callFunction({
      name: 'toggle-favorite',
      data: { itemId: this.itemId }
    }).then(res => {
      wx.hideLoading();
      if (res.result.code === 0) {
        const favorited = res.result.data.favorited;
        const newFavoritesCount = favorited ? item.counters.favorites + 1 : item.counters.favorites - 1;
        
        this.setData({
          favorited,
          'item.counters.favorites': newFavoritesCount
        });
        
        wx.showToast({
          title: favorited ? '收藏成功' : '取消收藏',
          icon: 'success'
        });
      } else {
        wx.showToast({ title: res.result.message || '操作失败', icon: 'none' });
      }
    }).catch(err => {
      wx.hideLoading();
      console.error(err);
      wx.showToast({ title: '操作失败，请重试', icon: 'none' });
    });
  },
  handleShare() {
    wx.showShareMenu({
      withShareTicket: true,
      menus: ['shareAppMessage', 'shareTimeline']
    });
  },
  handleReport() {
    this.setData({ showReport: true });
  },
  closeReport() {
    this.setData({ showReport: false, selectedReason: '', reportDetail: '' });
  },
  selectReason(e) {
    this.setData({ selectedReason: e.currentTarget.dataset.reason });
  },
  onReportDetail(e) {
    this.setData({ reportDetail: e.detail.value });
  },
  submitReport() {
    const { selectedReason, reportDetail } = this.data;
    
    if (!selectedReason) {
      wx.showToast({ title: '请选择举报原因', icon: 'none' });
      return;
    }

    wx.showLoading({ title: '提交中...' });
    wx.cloud.callFunction({
      name: 'report-item',
      data: {
        itemId: this.itemId,
        reason: selectedReason,
        detail: reportDetail
      }
    }).then(res => {
      wx.hideLoading();
      if (res.result.code === 0) {
        wx.showToast({ title: '举报成功', icon: 'success' });
        this.closeReport();
      } else {
        wx.showToast({ title: res.result.message || '举报失败', icon: 'none' });
      }
    }).catch(err => {
      wx.hideLoading();
      console.error(err);
      wx.showToast({ title: '举报失败，请重试', icon: 'none' });
    });
  },
  closeLoginModal() {
    this.setData({ showLoginModal: false });
  },
  goToLogin() {
    this.setData({ showLoginModal: false });
    wx.switchTab({ url: '/pages/mine/mine' });
  },
  handleContact() {
    const authManager = require('../../utils/auth.js');
    if (!authManager.isLoggedIn()) {
      this.setData({ showLoginModal: true });
      return;
    }
    // 这里可以实现联系功能，比如跳转到聊天页面
    wx.showToast({ title: '功能开发中', icon: 'none' });
  },
  handleLocation() {
    const { item } = this.data;
    if (!item || !item.addressText) {
      wx.showToast({ title: '位置信息不完整', icon: 'none' });
      return;
    }

    wx.openLocation({
      latitude: item.lat || 39.908692,
      longitude: item.lng || 116.397477,
      name: item.addressText || '物品位置',
      address: item.addressText || '物品位置',
      scale: 16
    });
  },
  formatTime(timestamp) {
    if (!timestamp) return '';
    
    const date = new Date(timestamp);
    const now = new Date();
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    const hour = date.getHours().toString().padStart(2, '0');
    const minute = date.getMinutes().toString().padStart(2, '0');
    
    const today = new Date();
    const isToday = year === today.getFullYear() && 
                   date.getMonth() === today.getMonth() && 
                   date.getDate() === today.getDate();
    
    if (isToday) {
      return `${hour}:${minute}`;
    } else {
      return `${year}-${month}-${day}`;
    }
  },
  onShareAppMessage() {
    const { item } = this.data;
    return {
      title: item ? item.title : '闲置物品',
      path: `/pages/detail/detail?id=${this.itemId}`,
      imageUrl: item && item.images && item.images.length > 0 ? item.images[0] : ''
    };
  },
  onShareTimeline() {
    const { item } = this.data;
    return {
      title: item ? item.title : '闲置物品',
      query: `id=${this.itemId}`,
      imageUrl: item && item.images && item.images.length > 0 ? item.images[0] : ''
    };
  },
  
  // 图片轮播切换
  onSwiperChange(e) {
    this.setData({
      currentImgIndex: e.detail.current
    });
  },
  
  // 预览图片
  previewImage(e) {
    const index = e.currentTarget.dataset.index;
    const { item } = this.data;
    
    wx.previewImage({
      current: item.images[index],
      urls: item.images
    });
  },
  
  // 隐藏登录弹窗
  hideLoginModal() {
    this.setData({ showLoginModal: false });
  },
  
  // 停止事件传播
  stopPropagation() {
    // 阻止事件冒泡
  },
  
  // 阻止内容滚动
  stopContentScroll() {
    // 阻止内容滚动
  },
  
  // 隐藏举报弹窗
  hideReportDialog() {
    this.closeReport();
  },
  
  // 举报详情输入
  onReportInput(e) {
    this.setData({
      reportDetail: e.detail.value
    });
  }
});