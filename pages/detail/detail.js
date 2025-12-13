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
    this.loadDetail();
    this.checkFavorite();
  },
  loadDetail() {
    wx.showLoading({ title: '加载中...' });
    wx.cloud.callFunction({ name: 'get-item-detail', data: { itemId: this.itemId } }).then(res => {
      wx.hideLoading();
      if (res.result.code === 0) {
        const item = res.result.data.item;
        const favorited = res.result.data.favorited || false;
        const createTime = this.formatTime(item.createdAt);
        this.setData({ 
          item, 
          createTime, 
          favorited,
          originalLat: item.lat,  // 保存原始纬度
          originalLng: item.lng   // 保存原始经度
        });
      } else {
        wx.showToast({ title: res.result.message || '加载失败', icon: 'none' });
      }
    }).catch(err => {
      wx.hideLoading();
      console.error(err);
      wx.showToast({ title: '加载失败', icon: 'none' });
    });
  },
  checkFavorite() {
    const authManager = require('../../utils/auth.js');
    if (!authManager.isLoggedIn()) return;
    
    wx.cloud.callFunction({ name: 'get-item-favorite', data: { itemId: this.itemId } }).then(res => {
      if (res.result.code === 0) {
        this.setData({ favorited: res.result.data.favorited });
      }
    }).catch(err => console.error(err));
  },
  handleFavorite() {
    const authManager = require('../../utils/auth.js');
    if (!authManager.isLoggedIn()) {
      this.setData({ showLoginModal: true });
      return;
    }

    const { item, favorited } = this.data;
    
    // 立即更新UI状态，提供即时反馈
    const newState = !favorited;
    const newFavoritesCount = favorited ? item.counters.favorites - 1 : item.counters.favorites + 1;
    
    this.setData({
      favorited: newState,
      'item.counters.favorites': newFavoritesCount
    });
    
    // 异步调用云函数，不阻塞UI
    this.toggleFavoriteCloud(item._id, newState).catch(err => {
      // 如果失败，恢复原状态
      console.error('收藏操作失败，恢复原状态:', err);
      this.setData({
        favorited: favorited,
        'item.counters.favorites': item.counters.favorites
      });
      
      wx.showToast({
        title: '操作失败，请重试',
        icon: 'none'
      });
    });
  },
  
  async toggleFavoriteCloud(itemId, newState) {
    try {
      const result = await wx.cloud.callFunction({
        name: 'toggle-favorite',
        data: { itemId }
      });
      
      if (result.result.code !== 0) {
        throw new Error(result.result.message || '操作失败');
      }
    } catch (err) {
      throw err;
    }
  },
  handleContact() {
    wx.showToast({ title: '功能开发中', icon: 'none' });
  },
  previewImage(e) {
    const index = e.currentTarget.dataset.index;
    wx.previewImage({
      current: this.data.item.images[index],
      urls: this.data.item.images
    });
  },
  onSwiperChange(e) {
    this.setData({ currentImgIndex: e.detail.current });
  },
  formatTime(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return '刚刚发布';
    if (minutes < 60) return `${minutes}分钟前发布`;
    if (hours < 24) return `${hours}小时前发布`;
    if (days < 7) return `${days}天前发布`;
    return date.toLocaleDateString('zh-CN', { 
      year: 'numeric', 
      month: '2-digit', 
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  },
  hideLoginModal() {
    this.setData({ showLoginModal: false, loginTitle: '', loginContent: '' });
  },
  showLoginPrompt(title, content) {
    this.setData({ showLoginModal: true, loginTitle: title, loginContent: content });
  },
  // 举报相关
  handleReport() {
    const authManager = require('../../utils/auth.js');
    if (!authManager.isLoggedIn()) {
      this.showLoginPrompt('需要登录', '登录后才可以举报物品');
      return;
    }
    this.setData({ showReport: true });
  },
  hideReportDialog() {
    this.setData({ showReport: false, selectedReason: '', reportDetail: '' });
  },
  selectReason(e) {
    this.setData({ selectedReason: e.currentTarget.dataset.value });
  },
  onReportInput(e) {
    this.setData({ reportDetail: e.detail.value });
  },
  async submitReport() {
    const { selectedReason, reportDetail } = this.data;
    
    if (!selectedReason) {
      wx.showToast({ title: '请选择举报理由', icon: 'none' });
      return;
    }

    try {
      wx.showLoading({ title: '提交中...' });
      const result = await wx.cloud.callFunction({
        name: 'report-item',
        data: { 
          itemId: this.itemId,
          reason: selectedReason,
          detail: reportDetail
        }
      });

      wx.hideLoading();
      
      if (result.result.code === 0) {
        wx.showToast({ title: '举报成功，感谢反馈', icon: 'success' });
        this.hideReportDialog();
      } else {
        wx.showToast({ title: result.result.message || '提交失败', icon: 'none' });
      }
    } catch (err) {
      wx.hideLoading();
      console.error(err);
      wx.showToast({ title: '提交失败', icon: 'none' });
    }
  },

  // 防止内容滑动穿透
  stopContentScroll(e) {
    e.preventDefault();
    e.stopPropagation();
  }
});