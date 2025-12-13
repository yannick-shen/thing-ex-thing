const locationUtil = require('../../utils/location.js');
const authManager = require('../../utils/auth.js');

Page({
  data: {
    isLoggedIn: false,
    formData: {
      title: '',
      desc: '',
      mode: 'sale',
      price: ''
    },
    images: [],
    location: null,
    isSubmitting: false
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

    // 如果已登录且是首次加载，获取当前位置
    if (isLoggedIn && !this.data.location) {
      this.autoGetCurrentLocation();
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
      url: '/pages/login/login?redirect=' + encodeURIComponent('/pages/publish/publish')
    });
  },

  // 自动获取当前位置
  async autoGetCurrentLocation() {
    const result = await locationUtil.requestLocationPermission();
    if (result.success && result.location) {
      this.setData({
        location: {
          latitude: result.location.latitude,
          longitude: result.location.longitude,
          name: '当前位置'
        }
      });
    }
  },

  // 表单输入处理
  onTitleInput(e) {
    this.setData({
      'formData.title': e.detail.value
    });
  },

  onDescInput(e) {
    this.setData({
      'formData.desc': e.detail.value
    });
  },

  onPriceInput(e) {
    this.setData({
      'formData.price': e.detail.value
    });
  },

  onModeChange(e) {
    const mode = e.detail.value;
    this.setData({
      'formData.mode': mode,
      'formData.price': mode === 'sale' ? this.data.formData.price : ''
    });
  },



  // 位置相关
  async chooseLocation() {
    const result = await locationUtil.openLocationSelector();
    if (result.success) {
      this.setData({
        location: result.location
      });
    }
  },





  // 图片处理
  chooseImages() {
    const current = this.data.images.length;
    const remain = 6 - current;
    if (remain <= 0) {
      wx.showToast({
        title: '最多上传6张图片',
        icon: 'none'
      });
      return;
    }

    wx.chooseMedia({
      count: remain,
      mediaType: ['image'],
      sizeType: ['compressed'],
      sourceType: ['album', 'camera']
    }).then(res => {
      const newImages = res.tempFiles.map(f => f.tempFilePath);
      this.setData({
        images: [...this.data.images, ...newImages]
      });
    }).catch(err => {
      console.log('选择图片失败:', err);
      if (err.errMsg && !err.errMsg.includes('cancel')) {
        wx.showToast({
          title: '选择图片失败',
          icon: 'none'
        });
      }
    });
  },

  removeImage(e) {
    const index = e.currentTarget.dataset.index;
    const images = this.data.images.filter((_, i) => i !== index);
    this.setData({ images });
  },

  // 表单验证
  validateForm() {
    const { formData, images, location } = this.data;

    if (!formData.title.trim()) {
      wx.showToast({
        title: '请填写物品标题',
        icon: 'none'
      });
      return false;
    }

    if (!formData.desc.trim()) {
      wx.showToast({
        title: '请填写物品描述',
        icon: 'none'
      });
      return false;
    }

    if (!formData.mode) {
      wx.showToast({
        title: '请选择交易形态',
        icon: 'none'
      });
      return false;
    }

    if (formData.mode === 'sale' && !formData.price.trim()) {
      wx.showToast({
        title: '出售物品请填写价格',
        icon: 'none'
      });
      return false;
    }



    if (!location) {
      wx.showToast({
        title: '请选择交易位置',
        icon: 'none'
      });
      return false;
    }

    if (images.length === 0) {
      wx.showToast({
        title: '请至少上传1张图片',
        icon: 'none'
      });
      return false;
    }

    return true;
  },

  // 提交发布
  async onSubmit(e) {
    if (this.data.isSubmitting) return;

    const formValues = e.detail.value;

    // 更新表单数据
    this.setData({
      'formData.title': formValues.title,
      'formData.desc': formValues.desc,
      'formData.mode': formValues.mode,
      'formData.price': formValues.price
    });

    // 验证表单
    if (!this.validateForm()) return;

    this.setData({ isSubmitting: true });
    wx.showLoading({ title: '发布中...' });

    try {
      // 上传图片到云存储
      const uploadResults = await this.uploadImages();
      
      // 调用云函数发布物品
      const publishResult = await this.publishItem(uploadResults);
      
      wx.hideLoading();
      
      if (publishResult.code === 0) {
        wx.showToast({
          title: '发布成功',
          icon: 'success'
        });
        
        // 清空表单
        this.resetForm();
        
        // 延迟返回
        setTimeout(() => {
          wx.navigateBack();
        }, 1500);
      } else {
        wx.showToast({
          title: publishResult.message || '发布失败',
          icon: 'none'
        });
      }
    } catch (error) {
      wx.hideLoading();
      console.error('发布失败:', error);
      wx.showToast({
        title: '发布失败，请重试',
        icon: 'none'
      });
    } finally {
      this.setData({ isSubmitting: false });
    }
  },

  // 上传图片
  uploadImages() {
    return new Promise((resolve, reject) => {
      const uploadPromises = this.data.images.map((path, index) => {
        const ext = path.split('.').pop() || 'jpg';
        const cloudPath = `items/${Date.now()}_${index}_${Math.random().toString(36).slice(2)}.${ext}`;
        return wx.cloud.uploadFile({ cloudPath, filePath: path });
      });

      Promise.all(uploadPromises)
        .then(results => {
          const fileIDs = results.map(r => r.fileID);
          resolve(fileIDs);
        })
        .catch(reject);
    });
  },

  // 调用发布云函数
  publishItem(imageFileIDs) {
    const { formData, location } = this.data;
    
    return wx.cloud.callFunction({
      name: 'publish-item',
      data: {
        title: formData.title.trim(),
        desc: formData.desc.trim(),
        mode: formData.mode,
        price: formData.mode === 'sale' ? Number(formData.price || 0) : 0,
        images: imageFileIDs,
        location: {
          latitude: location.latitude,
          longitude: location.longitude
        },
        addressText: location.name || '当前位置'
      }
    }).then(res => res.result);
  },

  // 重置表单
  resetForm() {
    this.setData({
      formData: {
        title: '',
        desc: '',
        mode: 'sale',
        price: ''
      },
      images: [],
      location: null
    });
  },

  // 页面分享
  onShareAppMessage() {
    return {
      title: '闲置地图 - 发布你的闲置物品',
      path: '/pages/publish/publish'
    };
  }
});