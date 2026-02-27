const authManager = require('../../utils/auth.js');

Page({
  data: {
    isLogging: false,
    privacyAgreed: true,  // 修改：默认同意协议，按钮启用
    canLogin: false
  },

  onLoad(options) {
    console.log('登录页面加载，参数:', options);

    // 使用新API获取系统信息
    const appBaseInfo = wx.getAppBaseInfo();
    const deviceInfo = wx.getDeviceInfo();

    console.log('当前环境检查:', {
      platform: appBaseInfo.platform,
      version: appBaseInfo.version,
      SDKVersion: appBaseInfo.SDKVersion
    });

    // 在手机端预览时强制清理可能的问题数据
    const platform = appBaseInfo.platform;
    if (platform !== 'devtools') {
      console.log('手机端环境，检查并清理可能的问题数据');
      this.performPhoneEnvironmentCleanup();
    }

    // 初始化跳转标志
    this.navigateToTargetCalled = false;

    // 检查是否已经登录（更严格的验证）
    if (this.isActuallyLoggedIn()) {
      console.log('用户已登录，直接跳转');

      // 延迟一点时间，确保页面完全加载
      setTimeout(() => {
        this.navigateToTarget();
      }, 100);
      return;
    }

    // 保存重定向地址，并设置来源页面标志
    if (options.redirect) {
      wx.setStorageSync('loginRedirect', options.redirect);
      wx.setStorageSync('fromProtectedPage', true); // 标记来自需要登录的页面
    } else {
      wx.setStorageSync('fromProtectedPage', false);
    }
  },

  // 手机端环境数据清理
  performPhoneEnvironmentCleanup() {
    try {
      const userId = wx.getStorageSync('userId');
      const userInfo = wx.getStorageSync('userInfo');
      
      console.log('检查存储的用户数据:', { userId, userInfo });
      
      // 检查数据是否存在明显问题
      if (userId && typeof userId !== 'string') {
        console.log('userId类型异常，清理');
        wx.removeStorageSync('userId');
      }
      
      if (userInfo && (!userInfo.profile || !userInfo.stats)) {
        console.log('userInfo结构不完整，清理');
        wx.removeStorageSync('userInfo');
      }
      
      // 清理可能的过期数据
      const lastLoginTime = wx.getStorageSync('lastLoginTime');
      if (lastLoginTime && (Date.now() - lastLoginTime > 24 * 60 * 60 * 1000)) {
        console.log('登录数据可能过期，清理');
        wx.removeStorageSync('userId');
        wx.removeStorageSync('userInfo');
        wx.removeStorageSync('lastLoginTime');
      }
    } catch (error) {
      console.error('清理过程中出错:', error);
    }
  },

  // 更严格的登录验证
  isActuallyLoggedIn() {
    const isLoggedIn = authManager.isLoggedIn();
    const user = authManager.getCurrentUser();
    
    // 检查用户数据完整性
    if (!isLoggedIn || !user) {
      return false;
    }
    
    // 检查必要字段
    if (!user.userId || !user.profile) {
      console.log('用户数据不完整，清除无效数据');
      this.clearInvalidLoginData();
      return false;
    }
    
    return true;
  },

  // 清除无效的登录数据
  clearInvalidLoginData() {
    wx.removeStorageSync('userId');
    wx.removeStorageSync('userInfo');
    authManager.currentUser = null;
  },
  onUnload() {
    // 页面卸载时检查处理
    console.log('登录页面卸载');
    this.handlePageLeave();
  },
  onHide() {
    // 页面隐藏时检查处理
    console.log('登录页面隐藏');
    this.handlePageLeave();
  },
  // 处理页面离开的逻辑
  handlePageLeave() {
    const fromProtectedPage = wx.getStorageSync('fromProtectedPage') || false;
   
    // 如果来自受保护页面且用户没有成功登录，说明用户点击了返回按钮
    if (fromProtectedPage && !this.navigateToTargetCalled) {
      console.log('用户从受保护页面返回且未登录，跳转到首页');
     
      // 立即跳转到首页，避免看到中间页面
      wx.switchTab({
        url: '/pages/index/index',
        success: () => {
          console.log('成功跳转到首页');
        },
        fail: (err) => {
          console.error('跳转到首页失败:', err);
        }
      });
    }
   
    // 清除临时状态
    wx.removeStorageSync('loginRedirect');
    wx.removeStorageSync('fromProtectedPage');
    this.navigateToTargetCalled = false;
  },
  // 协议勾选状态变更
  onAgreementChange(e) {
    const agreed = e.detail.value.includes('agree');
    this.setData({
      privacyAgreed: agreed,
      canLogin: agreed
    });
  },
  // 处理微信登录
  async handleWechatLogin(e) {
    console.log('开始微信登录');
   
    if (this.data.isLogging) {
      console.log('正在登录中，忽略重复点击');
      return;
    }
    if (!this.data.privacyAgreed) {
      wx.showToast({
        title: '请先同意相关协议',
        icon: 'none'
      });
      return;
    }
    this.setData({ isLogging: true });
   
    try {
      wx.showLoading({ title: '正在登录...' });
     
      // 第一步：获取微信登录凭证
      console.log('获取微信登录凭证...');
      const loginRes = await this.getWxLoginCode();
      if (!loginRes.code) {
        throw new Error('获取微信登录凭证失败');
      }
      console.log('微信登录凭证获取成功:', loginRes.code);
     
      // 第二步：调用云函数登录（不传用户信息，让后端自动处理）
      console.log('调用 authManager.login()...');
      const loginResult = await authManager.login(loginRes.code, null);
      console.log('登录结果:', loginResult);
      if (loginResult.success) {
        console.log('登录成功，用户信息:', loginResult.user);
       
        // 保存用户协议同意状态
        wx.setStorageSync('userAgreed', true);
       
        // 立即隐藏loading，根据是否为新用户显示不同的成功提示
        wx.hideLoading();
       
        let successMessage = '登录成功';
        if (loginResult.isNewUser) {
          successMessage = '欢迎加入！账户已自动创建';
        }
       
        wx.showToast({
          title: successMessage,
          icon: 'success',
          duration: 1500 // 稍微延长显示时间，让用户看到不同的提示
        });
        // 立即跳转，不等toast结束
        setTimeout(() => {
          this.navigateToTarget();
        }, 100);
      } else {
        console.error('登录失败，详细信息:', loginResult);
       
        // 显示具体的错误信息
        let errorMsg = '登录失败，请重试';
        if (loginResult.error && loginResult.error.errMsg) {
          console.log('云函数错误详情:', loginResult.error);
          errorMsg = `登录失败: ${loginResult.error.errMsg}`;
        } else if (loginResult.error && loginResult.error.message) {
          errorMsg = `登录失败: ${loginResult.error.message}`;
        }
       
        wx.showToast({
          title: errorMsg,
          icon: 'none',
          duration: 3000
        });
      }
     
    } catch (error) {
      console.error('登录过程异常:', error);
      console.error('异常详情:', error.errCode, error.errMsg);
     
      let errorMsg = '登录失败，请重试';
      if (error.errMsg) {
        errorMsg = `登录异常: ${error.errMsg}`;
      } else if (error.message) {
        errorMsg = `登录异常: ${error.message}`;
      }
     
      wx.showToast({
        title: errorMsg,
        icon: 'none',
        duration: 3000
      });
    } finally {
      this.setData({ isLogging: false });
      wx.hideLoading();
    }
  },
  // 获取用户信息
  getUserProfile() {
    return new Promise((resolve, reject) => {
      // 首先尝试获取用户信息，看是否已经授权
      wx.getUserInfo({
        success: (res) => {
          console.log('getUserInfo 成功:', res);
          console.log('用户信息:', res.userInfo);
          resolve(res.userInfo);
        },
        fail: (err) => {
          console.log('getUserInfo 失败，尝试 getUserProfile:', err);
         
          // 如果 getUserInfo 失败，使用 getUserProfile
          wx.getUserProfile({
            desc: '用于完善用户资料，显示您的昵称和头像',
            success: (profileRes) => {
              console.log('getUserProfile 成功:', profileRes);
              console.log('用户信息:', profileRes.userInfo);
              resolve(profileRes.userInfo);
            },
            fail: (profileErr) => {
              console.error('getUserProfile 也失败:', profileErr);
             
              // 检查具体的错误信息
              const errMsg = profileErr.errMsg || '';
              console.log('详细错误信息:', errMsg);
             
              if (errMsg.includes('cancel') || errMsg.includes('拒绝')) {
                wx.showModal({
                  title: '需要授权',
                  content: '为了更好的体验，需要获取您的微信昵称和头像。您可以随时在设置中修改。',
                  confirmText: '重新授权',
                  cancelText: '跳过',
                  success: (modalRes) => {
                    if (modalRes.confirm) {
                      console.log('用户选择重新授权');
                      this.getUserProfile().then(resolve).catch(reject);
                    } else {
                      console.log('用户选择跳过授权');
                      resolve({
                        nickName: '匿名用户',
                        avatarUrl: ''
                      });
                    }
                  }
                });
              } else {
                // 其他错误，直接拒绝
                reject(profileErr);
              }
            }
          });
        }
      });
    });
  },
  // 获取微信登录凭证
  getWxLoginCode() {
    return new Promise((resolve, reject) => {
      wx.login({
        success: (res) => {
          console.log('wx.login 成功:', res);
          resolve(res);
        },
        fail: (err) => {
          console.error('wx.login 失败:', err);
          reject(err);
        }
      });
    });
  },
  // 跳转到目标页面
  navigateToTarget() {
    // 防止重复跳转
    if (this.navigateToTargetCalled) {
      console.log('跳转已在进行中，忽略重复调用');
      return;
    }
    this.navigateToTargetCalled = true;
    const redirect = wx.getStorageSync('loginRedirect');
    wx.removeStorageSync('loginRedirect');
    console.log('准备跳转，目标:', redirect);
    if (redirect) {
      // 有重定向地址，跳转到指定页面
      const url = decodeURIComponent(redirect);
      console.log('重定向到:', url);
     
      // 延迟50ms确保状态清理完成
      setTimeout(() => {
        if (url.includes('/pages/')) {
          console.log('执行页面跳转:', url);
         
          // 判断是否为 tabBar 页面
          const tabPages = [
            '/pages/index/index',
            '/pages/publish/publish',
            '/pages/messages/messages',
            '/pages/profile/profile'
          ];
         
          if (tabPages.includes(url)) {
            // tabBar 页面使用 switchTab
            wx.switchTab({
              url,
              success: () => {
                console.log('✅ 跳转到 tabBar 页面成功');
              },
              fail: (err) => {
                console.error('❌ 跳转到 tabBar 页面失败:', err);
              }
            });
          } else {
            // 非 tabBar 页面使用 redirectTo
            wx.redirectTo({
              url,
              success: () => {
                console.log('✅ 重定向成功');
              },
              fail: (err) => {
                console.error('❌ 重定向失败:', err);
              }
            });
          }
        } else {
          console.log('执行 switchTab:', url);
          wx.switchTab({
            url,
            success: () => {
              console.log('✅ 切换Tab成功');
            },
            fail: (err) => {
              console.error('❌ 切换Tab失败:', err);
            }
          });
        }
      }, 50);
    } else {
      // 没有重定向地址，跳转到首页
      console.log('跳转到首页');
     
      setTimeout(() => {
        console.log('执行 跳转首页');
        wx.switchTab({
          url: '/pages/index/index',
          success: () => {
            console.log('✅ 跳转首页成功');
          },
          fail: (err) => {
            console.error('❌ 跳转首页失败:', err);
          }
        });
      }, 50);
    }
  },
  // 显示用户协议
  showUserAgreement() {
    wx.showModal({
      title: '用户协议',
      content: '欢迎使用闲置地图！本协议是您与闲置地图之间关于使用闲置地图服务的法律协议。\n\n1. 用户注册\n2. 服务使用规范\n3. 隐私保护\n4. 免责声明',
      showCancel: false,
      confirmText: '我知道了'
    });
  },
  // 显示隐私政策
  showPrivacyPolicy() {
    wx.showModal({
      title: '隐私政策',
      content: '我们重视您的隐私保护，以下是我们如何收集、使用和保护您的个人信息：\n\n1. 信息收集范围\n2. 信息使用方式\n3. 信息保护措施\n4. 用户权利',
      showCancel: false,
      confirmText: '我知道了'
    });
  },
});