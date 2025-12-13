Page({
  data: {
    privacyAgreed: false
  },

  onLoad(options) {
    console.log('=== auth页面被加载 ===');
    console.log('调用栈信息:', new Error().stack);
    console.log('参数:', options);
    
    // 获取页面栈信息
    const pages = getCurrentPages();
    console.log('当前页面栈:', pages.map(p => p.route));
    
    // 立即重定向到首页，防止用户看到这个页面
    wx.reLaunch({
      url: '/pages/index/index',
      success: () => {
        console.log('auth页面重定向到首页成功');
      },
      fail: (err) => {
        console.error('auth页面重定向失败:', err);
      }
    });
  },

  onPrivacyChange(e) {
    const value = e.detail.value;
    this.setData({
      privacyAgreed: value.includes('agree')
    });
  },

  openPolicy(e) {
    const type = e.currentTarget.dataset.type;
    wx.navigateTo({
      url: `/pages/policy/policy?type=${type}`
    });
  },

  async handleAuth() {
    if (!this.data.privacyAgreed) {
      wx.showToast({
        title: '请先同意相关协议',
        icon: 'none'
      });
      return;
    }

    wx.showLoading({
      title: '正在授权...'
    });

    try {
      // 保存用户同意状态
      wx.setStorageSync('userAgreed', true);
      
      // 请求位置权限
      const authResult = await this.requestLocationPermission();
      
      wx.hideLoading();
      
      if (authResult) {
        // 位置权限获取成功，跳转到首页
        this.redirectToHome();
      } else {
        // 位置权限获取失败，但仍允许使用（使用默认位置）
        wx.showModal({
          title: '位置权限',
          content: '未获取到位置权限，将使用默认位置。您可以在设置中重新授权。',
          showCancel: false,
          success: () => {
            this.redirectToHome();
          }
        });
      }
    } catch (error) {
      wx.hideLoading();
      wx.showToast({
        title: '授权失败，请重试',
        icon: 'none'
      });
    }
  },

  async requestLocationPermission() {
    return new Promise((resolve) => {
      // 首先检查位置权限状态
      wx.getSetting({
        success: (settingRes) => {
          const locationAuth = settingRes.authSetting['scope.userLocation'];
          
          if (locationAuth === true) {
            // 已经授权，直接获取位置
            this.getCurrentLocation(resolve);
          } else if (locationAuth === false) {
            // 用户拒绝过，引导用户去设置页面开启
            wx.showModal({
              title: '位置权限',
              content: '需要位置权限来展示附近的物品，请在设置中开启位置权限',
              confirmText: '去设置',
              success: (modalRes) => {
                if (modalRes.confirm) {
                  wx.openSetting({
                    success: (openRes) => {
                      if (openRes.authSetting['scope.userLocation']) {
                        this.getCurrentLocation(resolve);
                      } else {
                        resolve(false);
                      }
                    },
                    fail: () => resolve(false)
                  });
                } else {
                  resolve(false);
                }
              }
            });
          } else {
            // 从未授权过，请求授权
            wx.authorize({
              scope: 'scope.userLocation',
              success: () => {
                this.getCurrentLocation(resolve);
              },
              fail: () => {
                resolve(false);
              }
            });
          }
        },
        fail: () => resolve(false)
      });
    });
  },

  getCurrentLocation(resolve) {
    wx.getLocation({
      type: 'gcj02',
      success: (res) => {
        // 保存当前位置到全局数据
        const app = getApp();
        if (app) {
          app.globalData.userLocation = {
            latitude: res.latitude,
            longitude: res.longitude
          };
        }
        resolve(true);
      },
      fail: () => resolve(false)
    });
  },

  redirectToHome() {
    wx.reLaunch({
      url: '/pages/index/index'
    });
  }
});