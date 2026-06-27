const authManager = require('../../utils/auth.js');

// ============================================================
//  积分 & 广告功能总开关
//  获得广告资格后：ENABLE_POINTS 改 true，填入 adUnitId，mock 改 false
// ============================================================
const AD_CONFIG = {
  ENABLE_POINTS: false,  // ← 积分系统总开关（需同步修改所有云函数）
  adUnitId: '',          // TODO: 填入激励视频广告位 ID
  mock: true             // true=开发模式（跳过真实广告，直接领奖）, false=正式模式
}

Page({
  data: {
    isLoggedIn: false,
    userInfo: null,
    messageCount: 0,
    showContactModal: false,
    // 积分总开关
    enablePoints: AD_CONFIG.ENABLE_POINTS,
    // 签到相关
    signInDone: true,       // 防止未加载时误触
    signInDays: 0,
    signInRewards: [1, 2, 3, 4, 5, 5, 5],
    // 广告相关
    adMock: AD_CONFIG.mock,  // 开发模式标识
    adRewardLoading: false,  // 广告请求中
    todayAdCount: 0,
    adRemaining: 20,
    adRewardTiers: [
      { text: '第1~5次', reward: 5 },
      { text: '第6~10次', reward: 4 },
      { text: '第11~20次', reward: 3 }
    ]
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
      if (AD_CONFIG.ENABLE_POINTS) {
        this.loadSignInStatus();
        this.loadAdStatus();
      }
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
          item.status === 'on' 
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
      item.status === 'on' 
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

  goToPointsDetail() {
    if (!this.data.isLoggedIn) {
      this.redirectToLogin('/pages/points-detail/points-detail');
      return;
    }
    wx.navigateTo({
      url: '/pages/points-detail/points-detail'
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

  goToAbout() {
    wx.showModal({
      title: '关于我们',
      content: '我们致力于打造便捷的同城闲置分享空间，方便大家互通身边好物。希望让闲置物品重新发挥价值，也让邻里之间的交流更加轻松简单。',
      showCancel: false,
      confirmText: '知道了'
    });
  },



  // 联系我们
  contactService() {
    if (!this.data.isLoggedIn) {
      this.redirectToLogin('/pages/profile/profile');
      return;
    }
    this.setData({ showContactModal: true });
  },

  // 关闭联系我们弹窗
  closeContactModal() {
    this.setData({ showContactModal: false });
  },

  // 阻止冒泡（点击弹窗内容不关闭）
  preventBubble() {},

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

  // ============================================================
  //  签到相关
  // ============================================================

  // 加载签到状态（判断今日是否已签到）
  async loadSignInStatus() {
    try {
      // 用 user-auth 返回的字段判断今日签到状态
      const today = this.getTodayStr()

      // 通过 getUserInfo 获取的最新数据
      const userInfo = authManager.getCurrentUser()
      if (!userInfo) return

      const lastSignDate = userInfo.lastSignDate || ''
      const consecutiveDays = userInfo.consecutiveDays || 0
      const isTodaySigned = (lastSignDate === today)

      this.setData({
        signInDone: isTodaySigned,
        signInDays: consecutiveDays
      })
    } catch (e) {
      console.error('加载签到状态失败:', e)
    }
  },

  // 获取今日日期字符串
  getTodayStr() {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  },

  // 执行签到
  async doSignIn() {
    if (this.data.signInDone) return

    wx.showLoading({ title: '签到中...' })

    try {
      const res = await wx.cloud.callFunction({
        name: 'daily-sign-in',
        data: {}
      })

      wx.hideLoading()

      if (res.result && res.result.code === 0) {
        const { consecutiveDays, todayReward } = res.result.data

        this.setData({
          signInDone: true,
          signInDays: consecutiveDays
        })

        // 同步更新缓存，避免切 tab 后状态回退
        authManager.updatePointsCache({
          lastSignDate: this.getTodayStr(),
          consecutiveDays: consecutiveDays
        })

        wx.showToast({
          title: `签到成功！+${todayReward} 积分`,
          icon: 'success',
          duration: 2000
        })
      } else {
        const msg = res.result.message || '签到失败'
        wx.showToast({ title: msg, icon: 'none' })

        // 如果是"今日已签到"，刷新状态
        if (msg.includes('已签到')) {
          this.setData({ signInDone: true })
          // 从云函数返回的数据更新连续天数
          if (res.result.data) {
            this.setData({ signInDays: res.result.data.consecutiveDays || 0 })
          }
        }
      }
    } catch (e) {
      wx.hideLoading()
      console.error('签到失败:', e)
      wx.showToast({ title: '网络异常，请重试', icon: 'none' })
    }
  },

  // ============================================================
  //  广告奖励相关
  // ============================================================

  // 加载广告状态
  loadAdStatus() {
    const userInfo = authManager.getCurrentUser()
    if (!userInfo) return

    const today = this.getTodayStr()
    const adCountDate = userInfo.adCountDate || ''
    const todayAdCount = (adCountDate === today) ? (userInfo.todayAdCount || 0) : 0

    this.setData({
      todayAdCount: todayAdCount,
      adRemaining: 20 - todayAdCount
    })
  },

  // 获取当前次数对应的奖励
  getAdReward(count) {
    if (count < 5) return 5
    if (count < 10) return 4
    return 3
  },

  // 观看广告
  async doWatchAd() {
    if (this.data.adRewardLoading) return
    if (this.data.adRemaining <= 0) {
      wx.showToast({ title: '今日次数已用完', icon: 'none' })
      return
    }

    const isMock = AD_CONFIG.mock

    if (isMock) {
      // === 开发模式：跳过真实广告，直接请求云函数 ===
      this._callAdReward()
    } else {
      // === 正式模式：播放真实激励视频 ===
      if (!AD_CONFIG.adUnitId) {
        wx.showToast({ title: '广告位未配置', icon: 'none' })
        return
      }

      const rewardedVideoAd = wx.createRewardedVideoAd({
        adUnitId: AD_CONFIG.adUnitId
      })

      rewardedVideoAd.onLoad(() => {
        console.log('广告加载成功')
      })

      rewardedVideoAd.onError((err) => {
        console.error('广告加载失败:', err)
        wx.showToast({ title: '广告加载失败，请重试', icon: 'none' })
        this.setData({ adRewardLoading: false })
      })

      rewardedVideoAd.onClose((res) => {
        if (res && res.isEnded) {
          // 广告完整播放，请求云函数发放奖励
          this._callAdReward()
        } else {
          wx.showToast({ title: '请完整观看广告', icon: 'none' })
          this.setData({ adRewardLoading: false })
        }
      })

      this.setData({ adRewardLoading: true })
      rewardedVideoAd.show().catch(() => {
        // show 失败时重试加载
        rewardedVideoAd.load().then(() => rewardedVideoAd.show())
          .catch(() => {
            wx.showToast({ title: '广告播放失败', icon: 'none' })
            this.setData({ adRewardLoading: false })
          })
      })
    }
  },

  // 调用广告奖励云函数
  async _callAdReward() {
    this.setData({ adRewardLoading: true })

    try {
      const res = await wx.cloud.callFunction({
        name: 'ad-reward',
        data: {
          mock: AD_CONFIG.mock
        }
      })

      this.setData({ adRewardLoading: false })

      if (res.result && res.result.code === 0) {
        const { todayAdCount, remaining, reward } = res.result.data

        this.setData({
          todayAdCount: todayAdCount,
          adRemaining: remaining
        })

        // 同步缓存
        authManager.updatePointsCache({
          todayAdCount: todayAdCount,
          adCountDate: this.getTodayStr()
        })

        wx.showToast({
          title: `观看完成！+${reward} 积分`,
          icon: 'success',
          duration: 2000
        })
      } else {
        wx.showToast({
          title: res.result.message || '领取失败',
          icon: 'none'
        })
      }
    } catch (e) {
      this.setData({ adRewardLoading: false })
      console.error('广告奖励失败:', e)
      wx.showToast({ title: '网络异常，请重试', icon: 'none' })
    }
  },

  // 页面分享
  onShareAppMessage() {
    return {
      title: '闲置地图 - 个人中心',
      path: '/pages/profile/profile'
    };
  }
});