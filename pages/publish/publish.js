const locationUtil = require('../../utils/location.js');
const authManager = require('../../utils/auth.js');

Page({
  data: {
    isLoggedIn: false,
    isEditMode: false,
    editItemId: null,
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

  onLoad(options) {
    // 检查登录状态但不跳转
    this.checkLoginStatus();

    // 检查是否是编辑模式（从URL参数）
    if (options.id && options.mode === 'edit') {
      this.editItemId = options.id;
      this.setData({ isEditMode: true, editItemId: options.id });
      this.loadItemForEdit(options.id);
    }
  },

  onShow() {
    // 检查是否有缓存的编辑参数（从switchTab跳转过来）
    const editItemId = wx.getStorageSync('editItemId');
    const editMode = wx.getStorageSync('editMode');

    if (editItemId && editMode === 'edit') {
      // 重置编辑模式状态
      this.editItemId = null;
      this.setData({ isEditMode: false, editItemId: null, formData: { title: '', desc: '', mode: 'sale', price: '' }, images: [], location: null });

      // 设置新的编辑模式
      this.editItemId = editItemId;
      this.setData({ isEditMode: true, editItemId });

      // 清除缓存
      wx.removeStorageSync('editItemId');
      wx.removeStorageSync('editMode');

      // 加载物品数据
      this.loadItemForEdit(editItemId);
    }

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

  // 加载物品数据用于编辑
  async loadItemForEdit(itemId) {
    wx.showLoading({ title: '加载中...' });

    try {
      const result = await wx.cloud.callFunction({
        name: 'get-item-detail',
        data: { itemId }
      });

      if (result.result && result.result.code === 0) {
        const item = result.result.data.item;

        if (!item) {
          wx.hideLoading();
          wx.showToast({
            title: '物品不存在',
            icon: 'none'
          });
          setTimeout(() => wx.navigateBack(), 1500);
          return;
        }

        // 填充表单数据
        this.setData({
          'formData.title': item.title || '',
          'formData.desc': item.desc || '',
          'formData.mode': item.mode || 'sale',
          'formData.price': item.price ? String(item.price) : '',
          images: item.images || [],
          location: {
            latitude: item.lat,
            longitude: item.lng,
            name: item.addressText
          }
        });

        wx.hideLoading();
      } else {
        wx.hideLoading();
        wx.showToast({
          title: result.result?.message || '加载失败',
          icon: 'none'
        });
        setTimeout(() => wx.navigateBack(), 1500);
      }
    } catch (error) {
      wx.hideLoading();
      console.error('加载物品失败:', error);
      wx.showToast({
        title: '加载失败，请重试',
        icon: 'none'
      });
      setTimeout(() => wx.navigateBack(), 1500);
    }
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
    wx.showLoading({ title: this.data.isEditMode ? '保存中...' : '发布中...' });

    try {
      // 上传图片到云存储
      const uploadResults = await this.uploadImages();

      // 根据是编辑还是新建调用不同方法
      const result = this.data.isEditMode
        ? await this.updateItem(uploadResults)
        : await this.publishItem(uploadResults);

      wx.hideLoading();

      if (result.code === 0) {
        wx.showToast({
          title: this.data.isEditMode ? '保存成功' : '发布成功',
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
          title: result.message || (this.data.isEditMode ? '保存失败' : '发布失败'),
          icon: 'none'
        });
      }
    } catch (error) {
      wx.hideLoading();
      console.error('操作失败:', error);
      wx.showToast({
        title: this.data.isEditMode ? '保存失败，请重试' : '发布失败，请重试',
        icon: 'none'
      });
    } finally {
      this.setData({ isSubmitting: false });
    }
  },

  // 上传图片
  uploadImages() {
    return new Promise((resolve, reject) => {
      const images = this.data.images || [];

      if (images.length === 0) {
        resolve([]);
        return;
      }

      // 区分云存储路径和需要上传的路径
      const cloudImages = images.filter(path => path && path.startsWith('cloud://'));
      const imagesToUpload = images.filter(path => path && !path.startsWith('cloud://'));

      // 如果没有需要上传的图片，直接返回云存储图片
      if (imagesToUpload.length === 0) {
        resolve(cloudImages);
        return;
      }

      // 上传非云存储图片
      const uploadPromises = imagesToUpload.map((path, index) => {
        const ext = path.split('.').pop() || 'jpg';
        const cloudPath = `items/${Date.now()}_${index}_${Math.random().toString(36).slice(2)}.${ext}`;
        return wx.cloud.uploadFile({ cloudPath, filePath: path });
      });

      Promise.all(uploadPromises)
        .then(results => {
          const uploadedFileIDs = results.map(r => r.fileID);
          // 合并云存储图片和新上传的图片
          const allFileIDs = [...cloudImages, ...uploadedFileIDs];
          resolve(allFileIDs);
        })
        .catch(reject);
    });
  },

  // 调用发布云函数
  publishItem(imageFileIDs, isDraft = false) {
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
        addressText: location.name || '当前位置',
        status: isDraft ? 'draft' : 'on'
      }
    }).then(res => res.result);
  },

  // 更新物品
  updateItem(imageFileIDs) {
    const { formData, location, editItemId } = this.data;

    return wx.cloud.callFunction({
      name: 'update-item',
      data: {
        itemId: editItemId,
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

  // 重新上架（先保存修改，然后上架）
  async handlePublishAndOnline() {
    const { editItemId } = this.data;

    if (!editItemId) return;

    wx.showModal({
      title: '确认重新上架',
      content: '确定要保存修改并将此物品重新上架吗？',
      confirmText: '确定',
      cancelText: '取消',
      success: (res) => {
        if (res.confirm) {
          this.setData({ isSubmitting: true });
          wx.showLoading({ title: '处理中...' });

          // 先保存修改
          const formValues = this.data.formData;
          const { formData, location } = this.data;

          // 上传图片
          this.uploadImages().then(uploadResults => {
            // 更新物品
            return this.updateItem(uploadResults);
          }).then(result => {
            if (result.code === 0) {
              // 保存成功后上架
              return wx.cloud.callFunction({
                name: 'update-item-status',
                data: {
                  itemId: editItemId,
                  status: 'on'
                }
              });
            } else {
              throw new Error(result.message || '保存失败');
            }
          }).then(res => {
            wx.hideLoading();
            this.setData({ isSubmitting: false });

            if (res.result && res.result.code === 0) {
              wx.showToast({
                title: '重新上架成功',
                icon: 'success'
              });

              // 清空表单数据
              this.resetForm();
              this.setData({
                isEditMode: false,
                editItemId: null
              });

              setTimeout(() => {
                wx.navigateBack();
              }, 1500);
            } else {
              wx.showToast({
                title: res.result?.message || '上架失败',
                icon: 'none'
              });
            }
          }).catch(err => {
            wx.hideLoading();
            this.setData({ isSubmitting: false });
            console.error('操作失败:', err);
            wx.showToast({
              title: '操作失败，请重试',
              icon: 'none'
            });
          });
        }
      }
    });
  },

  // 保存到草稿箱
  async handleSaveAsDraft() {
    if (this.data.isSubmitting) return;

    const { formData, location, images } = this.data;

    // 基本验证
    if (!formData.title.trim()) {
      wx.showToast({
        title: '请填写物品标题',
        icon: 'none'
      });
      return;
    }

    if (!formData.desc.trim()) {
      wx.showToast({
        title: '请填写物品描述',
        icon: 'none'
      });
      return;
    }

    this.setData({ isSubmitting: true });
    wx.showLoading({ title: '保存中...' });

    try {
      // 上传图片
      const uploadResults = await this.uploadImages();

      // 根据是编辑还是新建调用不同方法
      const result = this.data.isEditMode
        ? await this.updateItem(uploadResults)
        : await this.publishItem(uploadResults, true);

      wx.hideLoading();

      if (result.code === 0) {
        wx.showToast({
          title: '已保存到草稿箱',
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
          title: result.message || '保存失败',
          icon: 'none'
        });
      }
    } catch (error) {
      wx.hideLoading();
      console.error('保存草稿失败:', error);
      wx.showToast({
        title: '保存失败，请重试',
        icon: 'none'
      });
    } finally {
      this.setData({ isSubmitting: false });
    }
  },

  // 页面分享
  onShareAppMessage() {
    return {
      title: '闲置地图 - 发布你的闲置物品',
      path: '/pages/publish/publish'
    };
  }
});