const authManager = require('../../utils/auth.js');

Page({
  data: {
    isLoggedIn: false,
    userInfo: null,
    messageCount: 0
  },

  onLoad() {
    // 检查登录状态但不自动跳转，只显示状态
    this.checkLoginStatus();
    
    // 监听登录状态变化
    authManager.onLoginStatusChanged(this.onLoginStatusChanged.bind(this));
  },

  onShow() {
    // 每次显示页面时刷新登录状态，但不自动跳转
    this.checkLoginStatus();
  },

  // 检查登录状态（不自动跳转）
  checkLoginStatus() {
    const isLoggedIn = this.isActuallyLoggedIn();
    const userInfo = authManager.getCurrentUser();
    const skipLoginCheck = wx.getStorageSync('skipLoginCheck') || false;
    
    // 如果用户选择了跳过登录，强制显示未登录状态
    const shouldShowLoggedIn = isLoggedIn && !skipLoginCheck;
    
    this.setData({
      isLoggedIn: shouldShowLoggedIn,
      userInfo: shouldShowLoggedIn ? userInfo : null,
      // 如果跳过登录，重置相关数据
      messageCount: 0
    });

    // 只有在真正已登录且未跳过时才加载消息
    if (shouldShowLoggedIn) {
      this.loadMessageCount();
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

  // 登录状态变化回调
  onLoginStatusChanged(user) {
    this.setData({
      isLoggedIn: !!user,
      userInfo: user
    });
  },

  // 跳转登录页面
  goToLogin() {
    wx.navigateTo({
      url: '/pages/login/login?redirect=' + encodeURIComponent('/pages/profile/profile')
    });
  },

  // 更换头像
  changeAvatar() {
    if (!this.data.isLoggedIn) {
      this.redirectToLogin('/pages/profile/profile');
      return;
    }

    wx.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const tempFilePath = res.tempFilePaths[0];

        wx.showLoading({ title: '上传中...' });

        wx.cloud.uploadFile({
          cloudPath: `avatars/${this.data.userInfo.userId}.jpg`,
          filePath: tempFilePath,
          success: async (uploadRes) => {
            const fileID = uploadRes.fileID;

            try {
              const updateRes = await wx.cloud.callFunction({
                name: 'update-user-profile',
                data: {
                  avatarUrl: fileID
                }
              });

              if (updateRes.result && updateRes.result.code === 0) {
                this.setData({
                  'userInfo.profile.avatarUrl': fileID
                });

                wx.hideLoading();
                wx.showToast({
                  title: '头像更新成功',
                  icon: 'success'
                });
              } else {
                throw new Error(updateRes.result?.message || '更新失败');
              }
            } catch (error) {
              wx.hideLoading();
              wx.showToast({
                title: error.message || '更新失败，请重试',
                icon: 'none',
                duration: 3000
              });
            }
          },
          fail: () => {
            wx.hideLoading();
            wx.showToast({
              title: '上传失败，请重试',
              icon: 'none'
            });
          }
        });
      }
    });
  },

  // 编辑昵称
  editNickname() {
    if (!this.data.isLoggedIn) {
      this.redirectToLogin('/pages/profile/profile');
      return;
    }

    const currentNickname = this.data.userInfo.profile.nickname || '';

    wx.showModal({
      title: '修改昵称',
      editable: true,
      placeholderText: '请输入昵称(4-20字符)',
      content: currentNickname,
      confirmText: '确定',
      cancelText: '取消',
      success: async (res) => {
        if (res.confirm && res.content) {
          const nickname = res.content.trim();

          const validationResult = this.validateNickname(nickname);
          if (!validationResult.valid) {
            wx.showToast({
              title: validationResult.message,
              icon: 'none',
              duration: 2000
            });
            return;
          }

          wx.showLoading({ title: '保存中...' });

          try {
            const updateRes = await wx.cloud.callFunction({
              name: 'update-user-profile',
              data: {
                nickname: nickname
              }
            });

            if (updateRes.result && updateRes.result.code === 0) {
              this.setData({
                'userInfo.profile.nickname': nickname
              });

              wx.hideLoading();
              wx.showToast({
                title: '昵称修改成功',
                icon: 'success'
              });
            } else {
              throw new Error(updateRes.result?.message || '修改失败');
            }
          } catch (error) {
            wx.hideLoading();
            wx.showToast({
              title: error.message || '修改失败，请重试',
              icon: 'none',
              duration: 3000
            });
          }
        }
      }
    });
  },

  // 验证昵称
  validateNickname(nickname) {
    // 计算字符长度(中文算2,其他算1)
    let length = 0;
    for (let i = 0; i < nickname.length; i++) {
      const char = nickname[i];
      if (char.match(/[\u4e00-\u9fa5]/)) {
        length += 2;
      } else {
        length += 1;
      }
    }

    if (length < 4 || length > 20) {
      return {
        valid: false,
        message: '昵称长度应为4-20个字符'
      };
    }

    // 检查字符类型
    const validPattern = /^[\u4e00-\u9fa5a-zA-Z0-9_]+$/;
    if (!validPattern.test(nickname)) {
      return {
        valid: false,
        message: '昵称只能包含中文、英文、数字和下划线'
      };
    }

    // 简单敏感词过滤
    const sensitiveWords = ['官方', '客服', '管理员', '管理', '系统', '客服'];
    for (const word of sensitiveWords) {
      if (nickname.includes(word)) {
        return {
          valid: false,
          message: '昵称不能包含敏感词汇'
        };
      }
    }

    return { valid: true };
  },

  // 统一的登录跳转方法
  redirectToLogin(targetUrl) {
    wx.navigateTo({
      url: '/pages/login/login?redirect=' + encodeURIComponent(targetUrl)
    });
  },

  // 加载统计数据
  async loadStats() {
    try {
      // 获取我的物品数量
      const itemsResult = await wx.cloud.callFunction({
        name: 'get-my-items',
        data: {}
      });

      if (itemsResult.result && itemsResult.result.code === 0) {
        const items = itemsResult.result.data.items || [];
        const now = Date.now();
        const activeItems = items.filter(item =>
          item.status === 'on' && item.expireAt > now
        );

        this.setData({
          'stats.published': items.length,
          'stats.active': activeItems.length
        });
      }

      // 获取收藏数量
      const favoritesResult = await wx.cloud.callFunction({
        name: 'get-my-favorites',
        data: {}
      });

      if (favoritesResult.result && favoritesResult.result.code === 0) {
        const favorites = favoritesResult.result.data.favorites || [];
        this.setData({
          'stats.favorited': favorites.length
        });
      }
    } catch (error) {
      // 使用本地缓存的统计
      this.loadCachedStats();
    }
  },

  // 加载缓存统计
  loadCachedStats() {
    const cachedItems = wx.getStorageSync('myCachedItems') || [];
    const cachedFavorites = wx.getStorageSync('myCachedFavorites') || [];
    const now = Date.now();
    
    const activeItems = cachedItems.filter(item => 
      item.status === 'on' && item.expireAt > now
    );

    this.setData({
      stats: {
        published: cachedItems.length,
        active: activeItems.length,
        favorited: cachedFavorites.length
      }
    });
  },

  // 加载消息数量
  async loadMessageCount() {
    try {
      const result = await wx.cloud.callFunction({
        name: 'get-unread-messages-count',
        data: {}
      });

      if (result.result && result.result.success) {
        const unreadCount = result.result.data.unreadCount || 0;
        this.setData({ messageCount: unreadCount });
      } else {
        this.setData({ messageCount: 0 });
      }
    } catch (error) {
      this.setData({ messageCount: 0 });
    }
  },

  // 导航函数
  goToMyItems() {
    if (!this.data.isLoggedIn) {
      this.redirectToLogin('/pages/mine/mine');
      return;
    }
    wx.navigateTo({
      url: '/pages/mine/mine'
    });
  },

  goToFavorites() {
    if (!this.data.isLoggedIn) {
      this.redirectToLogin('/pages/favorites/favorites');
      return;
    }
    wx.navigateTo({
      url: '/pages/favorites/favorites'
    });
  },

  goToMessages() {
    if (!this.data.isLoggedIn) {
      this.redirectToLogin('/pages/messages/messages');
      return;
    }
    wx.navigateTo({
      url: '/pages/messages/messages'
    });
  },

  goToSettings() {
    wx.navigateTo({
      url: '/pages/settings/settings'
    });
  },

  goToPolicy() {
    wx.navigateTo({
      url: '/pages/policy/policy'
    });
  },



  // 联系客服
  contactService() {
    if (!this.data.isLoggedIn) {
      this.redirectToLogin('/pages/profile/profile');
      return;
    }

    wx.showModal({
      title: '联系客服',
      content: '您可以通过客服功能与我们联系',
      confirmText: '联系客服',
      success: (res) => {
        if (res.confirm) {
          // 使用客服消息功能
          wx.openCustomerServiceConversation({
            success: () => {},
            fail: () => {
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

  // 退出登录
  logout() {
    wx.showModal({
      title: '退出登录',
      content: '确定要退出登录吗？退出后需要重新登录才能使用完整功能。',
      confirmText: '确定退出',
      cancelText: '取消',
      confirmColor: '#ff4d4f',
      success: (res) => {
        if (res.confirm) {
          // 显示loading
          wx.showLoading({
            title: '正在退出...'
          });

          try {
            // 清除用户信息
            authManager.logout();

            // 更新页面状态
            this.setData({
              isLoggedIn: false,
              userInfo: null,
              stats: {
                published: 0,
                active: 0,
                favorited: 0
              },
              messageCount: 0
            });

            // 隐藏loading
            wx.hideLoading();

            // 显示成功提示
            wx.showToast({
              title: '已退出登录',
              icon: 'success',
              duration: 1500
            });

            // 可选：跳转到登录页面或首页
            setTimeout(() => {
              wx.switchTab({
                url: '/pages/index/index'
              });
            }, 1000);

          } catch (error) {
            wx.hideLoading();
            wx.showToast({
              title: '退出失败，请重试',
              icon: 'none'
            });
          }
        }
      }
    });
  },

  // 页面分享
  onShareAppMessage() {
    return {
      title: '闲置地图 - 个人中心',
      path: '/pages/profile/profile'
    };
  }
});