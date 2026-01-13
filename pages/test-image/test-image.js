Page({
  data: {
    itemId: '',
    testResult: null,
    loading: false
  },

  onLoad(options) {
    if (options.itemId) {
      this.setData({ itemId: options.itemId });
    }
  },

  onItemIdInput(e) {
    this.setData({ itemId: e.detail.value });
  },

  async runTest() {
    const { itemId } = this.data;
    if (!itemId) {
      wx.showToast({
        title: '请输入物品ID',
        icon: 'none'
      });
      return;
    }

    this.setData({ loading: true, testResult: null });

    try {
      console.log('开始测试，itemId:', itemId);

      const res = await wx.cloud.callFunction({
        name: 'test-image-temp-url',
        data: { itemId }
      });

      console.log('云函数返回:', res);

      if (res.result && res.result.code === 0) {
        this.setData({
          testResult: res.result.data,
          loading: false
        });

        // 如果有临时链接，尝试加载图片
        if (res.result.data.tempFileURL) {
          console.log('尝试加载临时链接图片:', res.result.data.tempFileURL);

          // 尝试下载图片
          wx.downloadFile({
            url: res.result.data.tempFileURL,
            success: (downloadRes) => {
              console.log('临时链接下载成功:', downloadRes.tempFilePath);
              wx.showToast({
                title: '临时链接图片可下载',
                icon: 'success'
              });
            },
            fail: (err) => {
              console.error('临时链接下载失败:', err);
              wx.showToast({
                title: '临时链接图片下载失败: ' + (err.errMsg || '未知错误'),
                icon: 'none',
                duration: 5000
              });
            }
          });
        }

        wx.showToast({
          title: '测试成功',
          icon: 'success'
        });
      } else {
        this.setData({
          testResult: res.result,
          loading: false
        });
        wx.showToast({
          title: res.result.message || '测试失败',
          icon: 'none',
          duration: 5000
        });
      }
    } catch (err) {
      console.error('测试失败:', err);
      console.error('错误详情:', JSON.stringify(err, null, 2));
      this.setData({
        testResult: {
          error: err.message || '未知错误',
          errorDetail: err
        },
        loading: false
      });
      wx.showToast({
        title: '测试失败: ' + (err.message || '未知错误'),
        icon: 'none',
        duration: 5000
      });
    }
  },

  copyResult() {
    const { testResult } = this.data;
    if (!testResult) return;

    wx.setClipboardData({
      data: JSON.stringify(testResult, null, 2),
      success: () => {
        wx.showToast({
          title: '已复制到剪贴板',
          icon: 'success'
        });
      }
    });
  }
});
