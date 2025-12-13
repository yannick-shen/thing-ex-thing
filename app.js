App({
  onLaunch() {
    if (wx.cloud) {
      console.log('初始化云开发环境...')
      wx.cloud.init({ 
        env: 'cloud1-3gsbomiw03ea5416', 
        traceUser: true 
      });
      console.log('云开发环境初始化完成')
    } else {
      console.error('当前基础库版本不支持云开发')
    }
    
    // 监听登录状态变化
    this.setupLoginListener();
    
    // 初始化用户位置
    this.initUserLocation();
  },

  setupLoginListener() {
    const authManager = require('./utils/auth.js');
    
    // 监听登录状态变化
    authManager.onLoginStatusChanged((user) => {
      if (user) {
        console.log('用户登录成功，初始化位置信息');
        // 登录成功后初始化位置信息
        this.initUserLocation();
      }
    });
  },
  
  async initUserLocation() {
    // 检查用户是否已登录和已同意协议
    const authManager = require('./utils/auth.js');
    const isLoggedIn = authManager.isLoggedIn();
    const hasAgreed = wx.getStorageSync('userAgreed') || false;
    
    if (!isLoggedIn || !hasAgreed) {
      console.log('用户未登录或未同意协议，跳过位置初始化');
      return;
    }
    
    // 使用location工具进行位置权限请求
    const locationUtil = require('./utils/location.js');
    
    try {
      console.log('开始检查位置权限...');
      const status = await locationUtil.checkLocationStatus();
      
      if (status.authorized) {
        // 已授权，获取当前位置
        this.updateUserLocation();
      } else {
        console.log('位置权限状态:', status);
        // 未授权的情况将在用户需要时由各个页面处理
      }
    } catch (error) {
      console.error('检查位置权限失败:', error);
    }
  },
  
  updateUserLocation() {
    wx.getLocation({
      type: 'gcj02',
      success: (res) => {
        this.globalData.userLocation = {
          latitude: res.latitude,
          longitude: res.longitude
        };
      },
      fail: (err) => {
        console.log('获取位置失败:', err);
      }
    });
  },
  
  globalData: {
    // 北京天安门
    defaultCenter: { latitude: 39.908722, longitude: 116.397499 },
    userLocation: null, // 用户当前位置
    feature: {
      expiryDays: 30,
      draftDeleteDays: 90,
      softDeleteGraceDays: 14,
      locationBlurMeters: 150
    }
  }
});