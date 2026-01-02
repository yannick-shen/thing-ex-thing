const authManager = require('../../utils/auth.js');

Page({
  data: {
    item: null,
    favorited: null, // 使用null表示状态未确定，避免闪烁
    favoriteStatusLoaded: false, // 添加状态加载标识
    createTime: '',
    currentImgIndex: 0,
    showReport: false,
    selectedReason: '',
    reportDetail: '',
    showLoginModal: false,
    loginTitle: '需要登录',
    loginContent: '登录后可以更好地使用此功能',
    isOwnItem: false, // 是否是自己的物品
    reportReasons: [
      { value: 'spam', label: '垃圾广告' },
      { value: 'fake', label: '虚假信息' },
      { value: 'illegal', label: '违法违规' },
      { value: 'fraud', label: '诈骗信息' },
      { value: 'other', label: '其他' }
    ]
  },

  onShow() {
    // 每次显示页面时重新检查收藏状态
    if (this.data.item) {
      console.log('页面显示，重新检查收藏状态');
      this.loadFavoriteStatus();
    }
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
    
    // 检查来源页面，如果是从收藏页面进入，直接设置已收藏状态
    const pages = getCurrentPages();
    const prevPage = pages[pages.length - 2];
    const fromFavorites = prevPage && prevPage.route === 'pages/favorites/favorites';
    
    if (fromFavorites) {
      console.log('从收藏页面进入，直接设置已收藏状态');
      this.setData({
        favorited: true,
        favoriteStatusLoaded: true
      });
    }
    
    // 检查是否是模拟数据
    if (itemId.startsWith('mock_')) {
      console.log('这是模拟数据，使用模拟详情');
      this.loadMockDetail(itemId, fromFavorites);
    } else {
      console.log('这是真实数据，从云函数加载');
      this.loadDetail(fromFavorites);
    }
  },


  // 加载模拟数据详情
  loadMockDetail(itemId, fromFavorites = false) {
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
    
    // 只有在非收藏页面进入时才检查收藏状态
    if (!fromFavorites) {
      this.loadFavoriteStatus();
    }
  },

  loadDetail(fromFavorites = false) {
    wx.showLoading({ title: '加载中...' });
    console.log('开始加载物品详情，ID:', this.itemId);
    
    // 直接获取物品详情，跳过测试步骤
    this.loadItemDetail(fromFavorites);
  },

  loadItemDetail(fromFavorites = false) {
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

        // 判断是否是自己的物品
        const currentUserId = wx.getStorageSync('userId');
        const isOwnItem = currentUserId && item.authorId === currentUserId;

        this.setData({ isOwnItem });
        console.log('物品归属判断:', { isOwnItem, currentUserId, itemAuthorId: item.authorId });

        // 只有在非收藏页面进入时才需要检查收藏状态
        if (!fromFavorites && !isOwnItem) {
          this.loadFavoriteStatus();
        }
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

  // 加载收藏状态
  loadFavoriteStatus() {
    console.log('开始检查收藏状态');
    const authManager = require('../../utils/auth.js');
    if (!authManager.isLoggedIn()) {
      console.log('用户未登录，设置为未收藏');
      this.setData({ 
        favorited: false,
        favoriteStatusLoaded: true 
      });
      return;
    }

    wx.cloud.callFunction({
      name: 'get-my-favorites',
      data: {}
    }).then(res => {
      console.log('获取收藏列表结果:', res);
      if (res.result && res.result.code === 0) {
        const favorites = res.result.data.items || [];
        const isFavorited = favorites.some(fav => fav._id === this.itemId || fav.id === this.itemId);
        console.log('当前物品收藏状态:', isFavorited);
        this.setData({ 
          favorited: isFavorited,
          favoriteStatusLoaded: true 
        });
      } else {
        console.log('获取收藏列表失败，设置为未收藏');
        this.setData({ 
          favorited: false,
          favoriteStatusLoaded: true 
        });
      }
    }).catch(err => {
      console.error('检查收藏状态失败:', err);
      // 失败时默认为未收藏
      this.setData({ 
        favorited: false,
        favoriteStatusLoaded: true 
      });
    });
  },
  handleFavorite() {
    const currentStatus = this.data.favorited;
    console.log('收藏按钮被点击，当前状态:', currentStatus);
    wx.vibrateShort();
    
    const authManager = require('../../utils/auth.js');
    if (!authManager.isLoggedIn()) {
      console.log('用户未登录，显示登录弹窗');
      this.setData({ showLoginModal: true });
      return;
    }

    const { item } = this.data;
    console.log('开始收藏操作，物品ID:', this.itemId, '操作类型:', currentStatus ? '取消收藏' : '收藏');
    
    wx.showLoading({ title: '处理中...' });
    wx.cloud.callFunction({
      name: 'toggle-favorite',
      data: { itemId: this.itemId }
    }).then(res => {
      wx.hideLoading();
      console.log('收藏操作结果:', res);
      if (res.result && res.result.code === 0) {
        const newFavoritedStatus = res.result.data.favorited;
        const newFavoritesCount = newFavoritedStatus ? item.counters.favorites + 1 : item.counters.favorites - 1;
        
        // 确保状态更新正确
        this.setData({
          favorited: newFavoritedStatus,
          'item.counters.favorites': Math.max(0, newFavoritesCount) // 防止负数
        });
        
        console.log('收藏状态更新:', {
          之前: currentStatus,
          现在: newFavoritedStatus,
          收藏数量: Math.max(0, newFavoritesCount)
        });
        
        wx.showToast({
          title: newFavoritedStatus ? '收藏成功' : '取消收藏',
          icon: 'success'
        });
      } else {
        console.error('收藏操作失败:', res.result);
        wx.showToast({ title: (res.result && res.result.message) || '操作失败', icon: 'none' });
      }
    }).catch(err => {
      wx.hideLoading();
      console.error('收藏操作失败:', err);
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
    console.log('举报按钮被点击');
    wx.vibrateShort();
    this.setData({ showReport: true });
  },
  closeReport() {
    this.setData({ showReport: false, selectedReason: '', reportDetail: '' });
  },
  selectReason(e) {
    this.setData({ selectedReason: e.currentTarget.dataset.value });
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
    console.log('联系卖家按钮被点击 - 开始执行');
    wx.vibrateShort();

    // 检查是否是自己的物品
    const { item } = this.data;
    console.log('当前物品信息:', item);

    const authManager = require('../../utils/auth.js');
    const currentUserId = authManager.getUserId();
    console.log('当前用户ID:', currentUserId, '物品作者ID:', item.authorId);

    if (item.authorId === currentUserId) {
      console.log('用户点击的是自己的物品');
      wx.showToast({ title: '这是您发布的物品', icon: 'none' });
      return;
    }

    // 这里可以实现联系功能，比如跳转到聊天页面
    console.log('显示联系功能开发中提示');
    wx.showToast({ title: '联系功能开发中', icon: 'none' });
  },

  // 下架到草稿箱
  handleUnpublish() {
    const { item } = this.data;

    wx.showModal({
      title: '确认下架',
      content: '确定要将此物品下架到草稿箱吗？',
      confirmText: '确定',
      cancelText: '取消',
      success: (res) => {
        if (res.confirm) {
          wx.showLoading({ title: '处理中...' });

          wx.cloud.callFunction({
            name: 'update-item-status',
            data: {
              itemId: this.itemId,
              status: 'draft'
            }
          }).then(res => {
            wx.hideLoading();

            if (res.result && res.result.code === 0) {
              wx.showToast({
                title: '已下架到草稿箱',
                icon: 'success'
              });

              // 更新本地状态
              this.setData({
                'item.status': 'draft'
              });

              // 返回上一页
              setTimeout(() => {
                wx.navigateBack();
              }, 1500);
            } else {
              wx.showToast({
                title: res.result?.message || '下架失败',
                icon: 'none'
              });
            }
          }).catch(err => {
            wx.hideLoading();
            console.error('下架失败:', err);
            wx.showToast({
              title: '下架失败，请重试',
              icon: 'none'
            });
          });
        }
      }
    });
  },

  // 查看评论
  handleViewComments() {
    wx.navigateTo({
      url: `/pages/comment/comment?itemId=${this.itemId}`
    });
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