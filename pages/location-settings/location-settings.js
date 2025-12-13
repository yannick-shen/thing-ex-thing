const locationUtil = require('../../utils/location.js');

Page({
  data: {
    locationStatus: {
      authorized: false,
      denied: false,
      neverAsked: false
    },
    currentLocation: null,
    locationUpdateTime: '',
    showGuide: false
  },

  onLoad() {
    this.checkLocationStatus();
    this.getCurrentLocation();
  },

  onShow() {
    // 从设置页面返回时重新检查状态
    this.checkLocationStatus();
  },

  // 检查位置权限状态
  async checkLocationStatus() {
    const status = await locationUtil.checkLocationStatus();
    this.setData({
      locationStatus: status
    });
  },

  // 获取当前位置
  async getCurrentLocation() {
    const status = await locationUtil.checkLocationStatus();
    if (status.authorized) {
      try {
        const location = await locationUtil.getCurrentLocation();
        this.setData({
          currentLocation: location,
          locationUpdateTime: this.formatTime(new Date())
        });
      } catch (error) {
        console.log('获取位置失败:', error);
      }
    }
  },

  // 测试位置获取
  async testLocation() {
    wx.showLoading({ title: '获取位置中...' });
    
    try {
      const result = await locationUtil.requestLocationPermission();
      wx.hideLoading();
      
      if (result.success) {
        this.setData({
          currentLocation: result.location,
          locationUpdateTime: this.formatTime(new Date())
        });
        
        wx.showToast({
          title: '位置获取成功',
          icon: 'success'
        });
      } else {
        wx.showToast({
          title: result.message || '获取位置失败',
          icon: 'none'
        });
      }
    } catch (error) {
      wx.hideLoading();
      wx.showToast({
        title: '获取位置失败',
        icon: 'none'
      });
    }
  },

  // 撤销授权（实际上是跳转到设置让用户关闭）
  revokeLocation() {
    wx.showModal({
      title: '撤销授权',
      content: '将在设置页面中关闭位置权限，您可以随时重新开启',
      confirmText: '去设置',
      success: (res) => {
        if (res.confirm) {
          wx.openSetting({
            success: (settingRes) => {
              this.checkLocationStatus();
              if (!settingRes.authSetting['scope.userLocation']) {
                this.setData({
                  currentLocation: null
                });
                wx.showToast({
                  title: '已撤销位置授权',
                  icon: 'success'
                });
              }
            }
          });
        }
      }
    });
  },

  // 开启位置权限
  async grantLocation() {
    wx.showLoading({ title: '申请权限中...' });
    
    try {
      const result = await locationUtil.requestLocationPermission();
      wx.hideLoading();
      
      if (result.success) {
        this.setData({
          locationStatus: {
            authorized: true,
            denied: false,
            neverAsked: false
          },
          currentLocation: result.location,
          locationUpdateTime: this.formatTime(new Date())
        });
        
        wx.showToast({
          title: '位置权限已开启',
          icon: 'success'
        });
      } else {
        wx.showModal({
          title: '申请失败',
          content: result.message || '位置权限申请失败，您可以在设置中手动开启',
          confirmText: '去设置',
          success: (modalRes) => {
            if (modalRes.confirm) {
              wx.openSetting({
                success: () => {
                  this.checkLocationStatus();
                }
              });
            }
          }
        });
      }
    } catch (error) {
      wx.hideLoading();
      wx.showToast({
        title: '申请失败',
        icon: 'none'
      });
    }
  },

  // 申请位置权限
  async requestLocation() {
    await this.grantLocation();
  },

  // 刷新位置
  async refreshLocation() {
    await this.testLocation();
  },

  // 显示设置指南
  showGuide() {
    this.setData({
      showGuide: true
    });
  },

  // 隐藏设置指南
  hideGuide() {
    this.setData({
      showGuide: false
    });
  },

  // 返回上一页
  goBack() {
    wx.navigateBack();
  },

  // 格式化时间
  formatTime(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
  },

  // 页面分享
  onShareAppMessage() {
    return {
      title: '闲置地图 - 位置权限设置',
      path: '/pages/location-settings/location-settings'
    };
  }
});