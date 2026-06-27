Page({
  data: {
    userInfoDirty: true, // 首次加载标记
    stats: {
      published: 0,
      active: 0,
      draft: 0
    },
    currentTab: 'active',
    items: [],
    loading: true,
    // 续期弹窗
    showRenewModal: false,
    renewModalData: {}
  },

  onLoad() {
    // 只做初始化，不拉数据，统一走 onShow 机制
  },

  onShow() {
    const needRefresh = this.data.userInfoDirty || wx.getStorageSync('refreshMyItems');

    if (needRefresh) {
      this.loadMyItems();
      this.setData({ userInfoDirty: false });
      wx.removeStorageSync('refreshMyItems');
    }
  },

  // 加载我的物品
  async loadMyItems() {
    this.setData({ loading: true });

    try {
      const result = await wx.cloud.callFunction({
        name: 'get-my-items',
        data: {}
      });

      if (result.result && result.result.code === 0) {
        const items = result.result.data.items || [];
        this.processItemsData(items);
      } else {
        // 如果云函数返回错误，使用模拟数据
        this.loadMockData();
      }
    } catch (error) {
      console.error('获取我的物品失败:', error);
      // 使用模拟数据
      this.loadMockData();
    }

    this.setData({ loading: false });
  },

  // 处理物品数据
  processItemsData(items) {
    // 确保items是数组
    if (!Array.isArray(items)) {
      items = [];
    }

    // 为每个物品添加格式化的时间和统一的ID字段
    items = items.map(item => ({
      ...item,
      id: item._id, // 确保有统一的id字段
      formattedTime: this.formatTime(item.createdAt)
    }));

    // 缓存处理后的数据用于 tab 切换筛选
    this.allItems = items;

    const now = Date.now();
    const activeItems = items.filter(item =>
      item.status === 'on' 
    );
    const draftItems = items.filter(item =>
      item.status === 'draft' || item.status === 'off' || item.expireAt <= now
    );

    // 更新统计
    this.setData({
      stats: {
        published: items.length,
        active: activeItems.length,
        draft: draftItems.length
      },
      items: this.getFilteredItems(items)
    });
  },

  // 获取当前标签页的物品
  getFilteredItems(allItems) {
    // 确保allItems是数组
    if (!Array.isArray(allItems)) {
      return [];
    }

    const { currentTab } = this.data;
    const now = Date.now();

    switch (currentTab) {
      case 'active':
        return allItems.filter(item => 
          item.status === 'on' && item.expireAt > now
        );
      case 'draft':
        return allItems.filter(item => 
          item.status === 'draft' || item.status === 'off' || item.expireAt <= now
        );
      default:
        return allItems;
    }
  },

  // 加载模拟数据
  loadMockData() {
    const mockItems = [];
    
    // 如果有本地缓存的物品，使用缓存数据
    const cachedItems = wx.getStorageSync('myCachedItems') || [];
    
    if (cachedItems.length > 0) {
      // 确保缓存的物品也有正确的id字段
      const processedCachedItems = cachedItems.map(item => ({
        ...item,
        id: item._id || item.id // 确保有统一的id字段
      }));
      mockItems.push(...processedCachedItems);
    } else {
      // 生成一些示例数据
      for (let i = 1; i <= 3; i++) {
        mockItems.push({
          _id: `mock_${i}`, // 数据库字段
          id: `mock_${i}`, // 显示字段
          title: `示例物品 ${i}`,
          desc: '这是一个示例物品，展示在我的发布页面中',
          mode: ['sale', 'exchange', 'donate'][i % 3],
          price: i === 1 ? (99 + i * 50) : 0,
          addressText: '示例位置',
          images: ['/assets/images/placeholder-empty.png'],
          counters: { views: Math.floor(Math.random() * 100), favorites: Math.floor(Math.random() * 20), comments: Math.floor(Math.random() * 10) },
          status: i <= 2 ? 'on' : 'off',
          expireAt: Date.now() + (i <= 2 ? 30 : -1) * 24 * 60 * 60 * 1000,
          createdAt: Date.now() - i * 24 * 60 * 60 * 1000
        });
      }
    }

    this.processItemsData(mockItems);
  },

  // 加载消息数量
  loadMessageCount() {
    // 模拟消息数量
    const messageCount = Math.floor(Math.random() * 5);
    this.setData({ messageCount });
  },

  // 切换标签页
  switchTab(e) {
    const tab = e.currentTarget.dataset.tab;
    this.setData({
      currentTab: tab
    }, () => {
      // 在 currentTab 更新完成后筛选物品
      this.setData({
        items: this.getFilteredItems(this.allItems)
      });
    });
  },

  // 导航函数
  goPublish() {
    wx.navigateTo({
      url: '/pages/publish/publish'
    });
  },

  goFavorites() {
    wx.switchTab({
      url: '/pages/favorites/favorites'
    });
  },

  goMessages() {
    wx.navigateTo({
      url: '/pages/messages/messages'
    });
  },

  goDetail(e) {
    const id = e.currentTarget.dataset.id;
    const status = e.currentTarget.dataset.status;

    // 统一跳转到详情页，通过from参数标识来源
    const from = (status === 'draft' || status === 'off') ? 'draft' : '';
    wx.navigateTo({
      url: `/pages/detail/detail?id=${id}${from ? '&from=' + from : ''}`
    });
  },

  // 物品操作

  async publishDraft(e) {
    const id = e.currentTarget.dataset.id;
    
    if (!id) {
      wx.showToast({ title: '物品信息异常', icon: 'none' });
      return;
    }

    // 模拟数据不支持云函数操作，引导用户通过详情页编辑发布
    if (id.startsWith('mock_')) {
      wx.showToast({ title: '示例数据，无法操作', icon: 'none' });
      return;
    }

    wx.showModal({
      title: '发布草稿',
      content: '是否发布此草稿？',
      success: async (res) => {
        if (res.confirm) {
          wx.showLoading({ title: '发布中...' });
          
          try {
            const result = await wx.cloud.callFunction({
              name: 'update-item-status',
              data: {
                itemId: id,
                status: 'on'
              }
            });

            if (result.result && result.result.code === 0) {
              wx.hideLoading();
              wx.showToast({
                title: '发布成功',
                icon: 'success'
              });
              wx.setStorageSync('refreshMyItems', true);
              this.loadMyItems();
            } else if (result.result && result.result.code === 402) {
              wx.hideLoading();
              const pts = result.result.data || {}
              wx.showModal({
                title: '积分不足',
                content: `发布此物品需要 ${pts.cost || 0} 积分（当前余额：${pts.balance || 0}）。\n观看广告可免费获取积分。`,
                confirmText: '前往看广告',
                cancelText: '取消',
                success: (modalRes) => {
                  if (modalRes.confirm) {
                    wx.switchTab({ url: '/pages/profile/profile' })
                  }
                }
              })
            } else {
              wx.hideLoading();
              wx.showToast({
                title: result.result?.message || '发布失败',
                icon: 'none'
              });
            }
          } catch (error) {
            wx.hideLoading();
            wx.showToast({
              title: '发布失败，请重试',
              icon: 'none'
            });
          }
        }
      }
    });
  },

  async republishItem(e) {
    const id = e.currentTarget.dataset.id;
    
    wx.showModal({
      title: '重新发布',
      content: '是否重新发布此物品？',
      success: async (res) => {
        if (res.confirm) {
          wx.showLoading({ title: '发布中...' });
          
          try {
            const result = await wx.cloud.callFunction({
              name: 'update-item-status',
              data: {
                itemId: id,
                status: 'on'
              }
            });

            wx.hideLoading();
            
            if (result.result && result.result.code === 0) {
              wx.showToast({
                title: '发布成功',
                icon: 'success'
              });
              wx.setStorageSync('refreshMyItems', true);
              this.loadMyItems();
            } else if (result.result && result.result.code === 402) {
              const pts = result.result.data || {}
              wx.showModal({
                title: '积分不足',
                content: `重新上架需要 ${pts.cost || 0} 积分（当前余额：${pts.balance || 0}）。\n观看广告可免费获取积分。`,
                confirmText: '前往看广告',
                cancelText: '取消',
                success: (modalRes) => {
                  if (modalRes.confirm) {
                    wx.switchTab({ url: '/pages/profile/profile' })
                  }
                }
              })
            } else {
              wx.showToast({
                title: '发布失败',
                icon: 'none'
              });
            }
          } catch (error) {
            wx.hideLoading();
            console.error('重新发布失败:', error);
            wx.showToast({
              title: '发布失败，请重试',
              icon: 'none'
            });
          }
        }
      }
    });
  },

  deleteItem(e) {
    const id = e.currentTarget.dataset.id;
    
    wx.showModal({
      title: '删除确认',
      content: '删除后无法恢复，是否确认删除？',
      confirmText: '删除',
      confirmColor: '#ff4757',
      success: async (res) => {
        if (res.confirm) {
          wx.showLoading({ title: '删除中...' });
          
          try {
            const result = await wx.cloud.callFunction({
              name: 'update-item-status',
              data: {
                itemId: id,
                status: 'deleted'
              }
            });

            wx.hideLoading();

            if (result.result && result.result.code === 0) {
              wx.showToast({
                title: '删除成功',
                icon: 'success'
              });

              // 标记首页需要刷新
              wx.setStorageSync('refreshMarkers', true);
              // 标记我的发布需要刷新
              wx.setStorageSync('refreshMyItems', true);

              this.loadMyItems();
            } else {
              wx.showToast({
                title: '删除失败',
                icon: 'none'
              });
            }
          } catch (error) {
            wx.hideLoading();
            console.error('删除失败:', error);
            wx.showToast({
              title: '删除失败，请重试',
              icon: 'none'
            });
          }
        }
      }
    });
  },

  // 时间格式化
  formatTime(timestamp) {
    if (!timestamp) return '';
    
    const now = Date.now();
    const diff = now - timestamp;
    
    // 少于1分钟
    if (diff < 60000) {
      return '刚刚';
    }
    
    // 少于1小时
    if (diff < 3600000) {
      const minutes = Math.floor(diff / 60000);
      return `${minutes}分钟前`;
    }
    
    // 少于1天
    if (diff < 86400000) {
      const hours = Math.floor(diff / 3600000);
      return `${hours}小时前`;
    }
    
    // 少于7天
    if (diff < 604800000) {
      const days = Math.floor(diff / 86400000);
      return `${days}天前`;
    }
    
    // 超过7天显示具体日期
    const date = new Date(timestamp);
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    
    if (year === new Date().getFullYear()) {
      return `${month}-${day}`;
    } else {
      return `${year}-${month}-${day}`;
    }
  },

  // 续期物品
  renewItem(e) {
    const id = e.currentTarget.dataset.id
    const item = (this.allItems || []).find(i => (i._id === id || i.id === id))
    if (!item) {
      wx.showToast({ title: '物品信息异常', icon: 'none' })
      return
    }

    if (id.startsWith('mock_')) {
      wx.showToast({ title: '示例数据，无法操作', icon: 'none' })
      return
    }

    // 计算续期前后到期时间
    const oldExpireAt = item.expireAt
    const newExpireAt = oldExpireAt + 30 * 24 * 60 * 60 * 1000

    const formatDate = (ts) => {
      const d = new Date(ts)
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    }

    this.setData({
      showRenewModal: true,
      renewModalData: {
        itemId: id,
        itemTitle: item.title,
        oldExpireDate: formatDate(oldExpireAt),
        newExpireDate: formatDate(newExpireAt),
        loading: false
      }
    })
  },

  // 关闭续期弹窗
  closeRenewModal() {
    this.setData({ showRenewModal: false })
  },

  // 确认续期
  async confirmRenew() {
    const { itemId } = this.data.renewModalData
    this.setData({ 'renewModalData.loading': true })

    try {
      const res = await wx.cloud.callFunction({
        name: 'renew-item',
        data: { itemId }
      })

      if (res.result && res.result.code === 0) {
        const { oldExpireAt, newExpireAt, cost } = res.result.data
        const formatDate = (ts) => {
          const d = new Date(ts)
          return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
        }

        this.setData({ showRenewModal: false })

        wx.showToast({
          title: '续期成功',
          icon: 'success',
          duration: 2000
        })

        // 气泡提示新的到期时间
        setTimeout(() => {
          wx.showModal({
            title: '续期成功',
            content: `物品已续期 30 天\n新到期时间：${formatDate(newExpireAt)}\n${cost > 0 ? '消耗 ' + cost + ' 积分' : '本次续期免费'}`,
            showCancel: false,
            confirmText: '知道了'
          })
        }, 2200)

        // 刷新列表
        wx.setStorageSync('refreshMyItems', true)
        this.loadMyItems()
      } else if (res.result && res.result.code === 402) {
        this.setData({ showRenewModal: false })
        const pts = res.result.data || {}
        wx.showModal({
          title: '积分不足',
          content: `续期需要 ${pts.cost || 0} 积分（当前余额：${pts.balance || 0}）。\n观看广告可免费获取积分。`,
          confirmText: '前往看广告',
          cancelText: '取消',
          success: (modalRes) => {
            if (modalRes.confirm) {
              wx.switchTab({ url: '/pages/profile/profile' })
            }
          }
        })
      } else {
        this.setData({ showRenewModal: false })
        wx.showToast({
          title: res.result?.message || '续期失败',
          icon: 'none'
        })
      }
    } catch (e) {
      this.setData({ showRenewModal: false })
      console.error('续期失败:', e)
      wx.showToast({ title: '续期失败，请重试', icon: 'none' })
    }
  },

  // 阻止冒泡
  preventBubble() {},

  // 页面分享
  onShareAppMessage() {
    return {
      title: '闲置地图 - 我的发布',
      path: '/pages/mine/mine'
    };
  }
});