const authManager = require('../../utils/auth.js');

Page({
  data: {
    isLoggedIn: false,
    qrCode: '',
    uploading: false
  },

  onLoad() {
    this.checkLoginStatus();
  },

  onShow() {
    this.checkLoginStatus();
  },

  checkLoginStatus() {
    const isLoggedIn = authManager.isLoggedIn();

    if (!isLoggedIn) {
      this.setData({ isLoggedIn: false });
      return;
    }

    this.setData({ isLoggedIn: true });
    this.loadContactInfo();
  },

  async loadContactInfo() {
    try {
      const result = await wx.cloud.callFunction({
        name: 'get-user-profile',
        data: {}
      });

      if (result.result && result.result.code === 0) {
        const user = result.result.data.user;
        // 直接使用cloud://路径
        const qrCode = user.contactInfo && user.contactInfo.qrCode || '';

        this.setData({ qrCode });
      }
    } catch (error) {
      console.error('加载联系方式失败:', error);
    }
  },

  chooseQrCode() {
    wx.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const tempFilePath = res.tempFilePaths[0];
        this.uploadQrCode(tempFilePath);
      }
    });
  },

  async uploadQrCode(filePath) {
    this.setData({ uploading: true });

    try {
      const currentUser = authManager.getCurrentUser();
      const userId = currentUser ? currentUser.userId : null;

      if (!userId) {
        throw new Error('用户未登录');
      }

      // 使用带时间戳的文件名，避免缓存
      const timestamp = Date.now();
      const uploadRes = await wx.cloud.uploadFile({
        cloudPath: `contact-qr/${userId}_${timestamp}.jpg`,
        filePath: filePath
      });

      const fileID = uploadRes.fileID;

      // 直接使用cloud://路径
      const updateRes = await wx.cloud.callFunction({
        name: 'update-contact-info',
        data: {
          qrCode: fileID
        }
      });

      if (updateRes.result && updateRes.result.code === 0) {
        this.setData({ qrCode: fileID });
        wx.showToast({
          title: '上传成功',
          icon: 'success'
        });
      } else {
        throw new Error(updateRes.result?.message || '更新失败');
      }
    } catch (error) {
      console.error('上传二维码失败:', error);
      wx.showToast({
        title: '上传失败，请重试',
        icon: 'none'
      });
    } finally {
      this.setData({ uploading: false });
    }
  },

  previewQrCode() {
    if (this.data.qrCode) {
      wx.previewImage({
        current: this.data.qrCode,
        urls: [this.data.qrCode]
      });
    }
  },

  deleteQrCode() {
    wx.showModal({
      title: '删除二维码',
      content: '确定要删除微信二维码吗？删除后将无法接收联系申请。',
      confirmText: '删除',
      cancelText: '取消',
      confirmColor: '#ff4d4f',
      success: async (res) => {
        if (res.confirm) {
          try {
            await wx.cloud.callFunction({
              name: 'update-contact-info',
              data: {
                qrCode: ''
              }
            });

            this.setData({ qrCode: '' });
            wx.showToast({
              title: '已删除',
              icon: 'success'
            });
          } catch (error) {
            wx.showToast({
              title: '删除失败',
              icon: 'none'
            });
          }
        }
      }
    });
  }
});
