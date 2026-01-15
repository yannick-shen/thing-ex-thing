const authManager = require('../../utils/auth.js');

Page({
  data: {
    itemId: '',
    item: null,
    loading: true,
    submitting: false,
    remark: ''
  },

  onLoad(options) {
    const { itemId } = options;

    if (!itemId) {
      wx.showToast({
        title: '参数错误',
        icon: 'none'
      });
      setTimeout(() => wx.navigateBack(), 1500);
      return;
    }

    this.setData({ itemId });
    this.loadItemInfo();
  },

  async loadItemInfo() {
    try {
      const result = await wx.cloud.callFunction({
        name: 'get-item-detail',
        data: { itemId: this.data.itemId }
      });

      if (result.result && result.result.code === 0) {
        const item = result.result.data.item;

        // 检查是否是自己的物品
        const currentUser = authManager.getCurrentUser();
        if (currentUser && item.authorId === currentUser.userId) {
          wx.showModal({
            title: '提示',
            content: '这是您发布的物品，无需联系自己',
            showCancel: false,
            success: () => {
              wx.navigateBack();
            }
          });
          return;
        }

        this.setData({
          item: item,
          loading: false
        });
      } else {
        throw new Error(result.result?.message || '加载失败');
      }
    } catch (error) {
      console.error('加载物品信息失败:', error);
      this.setData({ loading: false });
      wx.showToast({
        title: '加载失败',
        icon: 'none'
      });
      setTimeout(() => wx.navigateBack(), 1500);
    }
  },

  onRemarkInput(e) {
    this.setData({ remark: e.detail.value });
  },

  async submitContactRequest() {
    const { remark, itemId } = this.data;

    if (!remark.trim()) {
      wx.showToast({
        title: '请填写留言',
        icon: 'none'
      });
      return;
    }

    this.setData({ submitting: true });

    try {
      const result = await wx.cloud.callFunction({
        name: 'create-contact-request',
        data: {
          itemId: itemId,
          remark: remark.trim()
        }
      });

      if (result.result && result.result.code === 0) {
        wx.showModal({
          title: '发送成功',
          content: '已向卖家发送联系申请，请耐心等待卖家回复',
          showCancel: false,
          success: () => {
            wx.navigateBack();
          }
        });
      } else {
        throw new Error(result.result?.message || '发送失败');
      }
    } catch (error) {
      console.error('发送联系申请失败:', error);
      wx.showToast({
        title: error.message || '发送失败，请重试',
        icon: 'none'
      });
    } finally {
      this.setData({ submitting: false });
    }
  },

  cancel() {
    wx.navigateBack();
  },

  // 预览物品图片
  previewImage(e) {
    const { index } = e.currentTarget.dataset;
    const { item } = this.data;

    if (item && item.images && item.images.length > 0) {
      wx.previewImage({
        current: item.images[index],
        urls: item.images
      });
    }
  }
});
