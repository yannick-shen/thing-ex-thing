// 位置权限管理工具
class LocationManager {
  constructor() {
    this.isRequesting = false;
  }

  // 检查位置权限状态
  checkLocationStatus() {
    return new Promise((resolve) => {
      wx.getSetting({
        success: (res) => {
          const status = res.authSetting['scope.userLocation'];
          resolve({
            authorized: status === true,
            denied: status === false,
            neverAsked: status === undefined
          });
        },
        fail: () => resolve({ authorized: false, denied: false, neverAsked: true })
      });
    });
  }

  // 弹窗申请位置权限
  async requestLocationPermission() {
    if (this.isRequesting) {
      return { success: false, message: '正在申请权限中...' };
    }

    this.isRequesting = true;

    try {
      const status = await this.checkLocationStatus();

      // 已经授权，直接获取位置
      if (status.authorized) {
        const location = await this.getCurrentLocation();
        this.isRequesting = false;
        return { success: true, location };
      }

      // 用户拒绝过，显示引导弹窗
      if (status.denied) {
        this.isRequesting = false;
        return await this.showLocationGuide();
      }

      // 从未授权过，直接申请
      if (status.neverAsked) {
        const result = await this.authorizeLocation();
        this.isRequesting = false;
        return result;
      }

    } catch (error) {
      this.isRequesting = false;
      return { success: false, message: '申请权限失败' };
    }
  }

  // 显示位置权限引导弹窗
  async showLocationGuide() {
    return new Promise((resolve) => {
      wx.showModal({
        title: '位置权限说明',
        content: '为了更好地为您展示附近物品和设置发布位置，请允许获取您的位置信息。我们会对您的位置信息进行模糊处理保护隐私。',
        confirmText: '同意授权',
        cancelText: '暂不授权',
        success: (res) => {
          if (res.confirm) {
            // 跳转到设置页面
            wx.openSetting({
              success: (settingRes) => {
                if (settingRes.authSetting['scope.userLocation']) {
                  // 用户开启权限，获取位置
                  this.getCurrentLocation().then(location => {
                    resolve({ success: true, location });
                  }).catch(() => {
                    resolve({ success: false, message: '获取位置失败' });
                  });
                } else {
                  resolve({ success: false, message: '您拒绝了位置权限' });
                }
              },
              fail: () => resolve({ success: false, message: '打开设置失败' })
            });
          } else {
            resolve({ success: false, message: '您暂未授权位置权限' });
          }
        }
      });
    });
  }

  // 申请位置权限
  async authorizeLocation() {
    return new Promise((resolve) => {
      wx.authorize({
        scope: 'scope.userLocation',
        success: async () => {
          try {
            const location = await this.getCurrentLocation();
            resolve({ success: true, location });
          } catch (error) {
            resolve({ success: false, message: '获取位置失败' });
          }
        },
        fail: () => {
          resolve({ success: false, message: '您拒绝了位置权限' });
        }
      });
    });
  }

  // 获取当前位置
  getCurrentLocation() {
    return new Promise((resolve, reject) => {
      wx.getLocation({
        type: 'gcj02',
        success: (res) => {
          resolve({
            latitude: res.latitude,
            longitude: res.longitude
          });
        },
        fail: reject
      });
    });
  }

  // 打开位置选择器
  async openLocationSelector() {
    const status = await this.checkLocationStatus();

    if (!status.authorized) {
      const result = await this.requestLocationPermission();
      if (!result.success) {
        return result;
      }
    }

    return new Promise((resolve) => {
      wx.chooseLocation({
        success: (res) => {
          // 检测是否使用了默认坐标（方案C）
          const isDefaultLocation = res.name === '选中位置' && res.address;

          resolve({
            success: true,
            location: {
              latitude: res.latitude,
              longitude: res.longitude,
              name: res.name || '选中位置',
              address: res.address,
              isDefaultLocation: isDefaultLocation  // 标记是否使用默认坐标
            }
          });
        },
        fail: (err) => {
          const errMsg = err.errMsg || '';
          if (errMsg.includes('cancel')) {
            resolve({ success: false, message: '用户取消选择' });
          } else {
            resolve({ success: false, message: '选择位置失败' });
          }
        }
      });
    });
  }
}

// 导出单例（适配小程序）
module.exports = new LocationManager();