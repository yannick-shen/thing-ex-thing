const locationUtil = require('../../utils/location.js');

Page({
  data: {
    notificationEnabled: true,
    locationStatus: false
  },

  onLoad() {
    this.loadNotificationSetting();
    this.checkLocationStatus();
  },

  onShow() {
    // 从设置页面返回时重新检查位置状态
    this.checkLocationStatus();
  },

  // 加载通知设置
  loadNotificationSetting() {
    const enabled = wx.getStorageSync('notificationEnabled');
    this.setData({ notificationEnabled: enabled !== false });
  },

  // 检查位置权限状态
  async checkLocationStatus() {
    try {
      const status = await locationUtil.checkLocationStatus();
      this.setData({ locationStatus: status.authorized });
    } catch (error) {
      console.error('检查位置权限失败:', error);
    }
  },

  // 通知设置变更
  onNotificationChange(e) {
    const enabled = e.detail.value;
    this.setData({ notificationEnabled: enabled });
    wx.setStorageSync('notificationEnabled', enabled);
    wx.showToast({ 
      title: enabled ? '已开启通知' : '已关闭通知', 
      icon: 'success' 
    });
  },

  // 位置权限设置
  viewLocationSetting() {
    wx.navigateTo({ url: '/pages/location-settings/location-settings' });
  },

  // 联系方式设置
  goToContactSettings() {
    wx.navigateTo({ url: '/pages/contact-settings/contact-settings' });
  },

  // 查看用户协议
  viewAgreement() {
    wx.navigateTo({ url: '/pages/policy/policy?type=agreement' });
  },

  // 查看隐私政策
  viewPolicy() {
    wx.navigateTo({ url: '/pages/policy/policy?type=privacy' });
  },

  // 查看平台规则
  viewRules() {
    wx.navigateTo({ url: '/pages/policy/policy?type=rules' });
  },

  // 联系客服
  contactService() {
    wx.showModal({
      title: '联系客服',
      content: '您可以通过客服功能与我们联系',
      confirmText: '联系客服',
      success: (res) => {
        if (res.confirm) {
          wx.openCustomerServiceConversation({
            success: () => {
              console.log('打开客服会话成功');
            },
            fail: (err) => {
              console.error('打开客服会话失败', err);
              wx.showToast({ 
                title: '客服功能暂未开通', 
                icon: 'none' 
              });
            }
          });
        }
      }
    });
  },

  // 清理缓存
  clearCache() {
    wx.showModal({
      title: '清理缓存',
      content: '将清理搜索历史、图片缓存等本地数据',
      confirmText: '确认清理',
      success: (res) => {
        if (res.confirm) {
          try {
            // 清理部分缓存数据，保留重要设置
            wx.removeStorageSync('searchHistory');
            wx.removeStorageSync('myCachedItems');
            wx.removeStorageSync('myCachedFavorites');
            
            wx.showToast({
              title: '缓存清理完成',
              icon: 'success'
            });
          } catch (error) {
            console.error('清理缓存失败:', error);
            wx.showToast({
              title: '清理失败',
              icon: 'none'
            });
          }
        }
      }
    });
  },

  // 重置用户协议
  resetAgreement() {
    wx.showModal({
      title: '重置用户协议',
      content: '将清除协议同意状态，下次登录时需要重新勾选同意用户协议和隐私政策',
      confirmText: '确认重置',
      confirmColor: '#ff4757',
      success: (res) => {
        if (res.confirm) {
          wx.removeStorageSync('userAgreed');
          wx.showToast({
            title: '重置成功',
            icon: 'success'
          });
        }
      }
    });
  },

  // 页面分享
  onShareAppMessage() {
    return {
      title: '闲置地图 - 设置',
      path: '/pages/settings/settings'
    };
  }
});
