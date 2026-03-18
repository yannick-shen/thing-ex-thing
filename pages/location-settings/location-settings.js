const locationUtil = require('../../utils/location.js');

Page({
  data: {
    locationStatus: {
      authorized: false,
      denied: false,
      neverAsked: false
    }
  },

  onLoad() {
    this.checkLocationStatus();
  },

  onShow() {
    this.checkLocationStatus();
  },

  // 检查位置权限状态
  async checkLocationStatus() {
    const status = await locationUtil.checkLocationStatus();
    this.setData({
      locationStatus: status
    });
  },

  // 打开微信设置页面
  openSetting() {
    wx.openSetting({
      success: () => {
        this.checkLocationStatus();
      }
    });
  }
});
