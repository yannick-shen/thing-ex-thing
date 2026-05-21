Page({
  data: {
    requestId: '',
    request: null,
    sellerQrCode: '',
    sellerName: '',
    loading: true
  },

  onLoad(options) {
    const { requestId } = options;

    if (!requestId) {
      wx.showToast({
        title: '参数错误',
        icon: 'none'
      });
      setTimeout(() => wx.navigateBack(), 1500);
      return;
    }

    this.setData({ requestId });
    this.loadRequestDetail();
  },

  async loadRequestDetail() {
    try {
      const result = await wx.cloud.callFunction({
        name: 'get-contact-request-detail',
        data: { requestId: this.data.requestId }
      });

      if (result.result && result.result.code === 0) {
        const { request, sellerQrCode, sellerName } = result.result.data;

        if (request.status !== 'accepted') {
          wx.showModal({
            title: '提示',
            content: '该联系申请尚未被同意',
            showCancel: false,
            success: () => {
              wx.navigateBack();
            }
          });
          return;
        }

        this.setData({
          request: request,
          sellerQrCode: sellerQrCode,
          sellerName: sellerName,
          loading: false
        });
      } else {
        throw new Error(result.result?.message || '加载失败');
      }
    } catch (error) {
      this.setData({ loading: false });
      wx.showToast({
        title: '加载失败',
        icon: 'none'
      });
    }
  },

  async saveQrCode() {
    const qrCode = this.data.sellerQrCode;
    if (!qrCode) return;

    wx.showLoading({ title: '保存中...' });

    try {
      const res = await wx.cloud.downloadFile({ fileID: qrCode });

      if (res.statusCode === 200) {
        await wx.saveImageToPhotosAlbum({ filePath: res.tempFilePath });
        wx.hideLoading();
        wx.showToast({ title: '已保存到相册', icon: 'success' });
      } else {
        throw new Error('下载失败');
      }
    } catch (err) {
      wx.hideLoading();
      const msg = err.errMsg || '';
      if (msg.includes('auth deny')) {
        wx.showToast({ title: '请授权相册权限后重试', icon: 'none' });
      } else {
        wx.showToast({ title: '保存失败，请重试', icon: 'none' });
      }
    }
  },

  previewQrCode() {
    if (this.data.sellerQrCode) {
      wx.previewImage({
        current: this.data.sellerQrCode,
        urls: [this.data.sellerQrCode]
      });
    }
  },

  goBack() {
    wx.navigateBack();
  }
});
