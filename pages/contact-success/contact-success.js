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

  saveQrCode() {
    if (this.data.sellerQrCode) {
      wx.showLoading({ title: '保存中...' });

      wx.downloadFile({
        url: this.data.sellerQrCode,
        success: (res) => {
          wx.saveImageToPhotosAlbum({
            filePath: res.tempFilePath,
            success: () => {
              wx.hideLoading();
              wx.showToast({
                title: '已保存到相册',
                icon: 'success'
              });
            },
            fail: () => {
              wx.hideLoading();
              wx.showToast({
                title: '保存失败，请检查相册权限',
                icon: 'none'
              });
            }
          });
        },
        fail: () => {
          wx.hideLoading();
          wx.showToast({
            title: '下载失败',
            icon: 'none'
          });
        }
      });
    }
  },

  previewQrCode() {
    if (this.data.sellerQrCode) {
      wx.previewImage({
        current: this.data.sellerQrCode,
        urls: [this.data.sellerQrCode]
      });
    }
  }
});
