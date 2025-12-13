Page({
  data: {
    stats: {
      published: 0,
      active: 0,
      expired: 0
    },
    currentTab: 'all',
    items: [],
    loading: true,
    messageCount: 0
  },

  onLoad() {
    this.loadMyItems();
    this.loadMessageCount();
  },

  onShow() {
    // 每次显示页面时刷新数据
    this.loadMyItems();
    this.loadMessageCount();
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

    const now = Date.now();
    const activeItems = items.filter(item => 
      item.status === 'on' && item.expireAt > now
    );
    const expiredItems = items.filter(item => 
      item.status === 'off' || item.expireAt <= now
    );

    // 更新统计
    this.setData({
      stats: {
        published: items.length,
        active: activeItems.length,
        expired: expiredItems.length
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
      case 'expired':
        return allItems.filter(item => 
          item.status === 'off' || item.expireAt <= now
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
      mockItems.push(...cachedItems);
    } else {
      // 生成一些示例数据
      for (let i = 1; i <= 3; i++) {
        mockItems.push({
          id: `mock_${i}`,
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
    this.setData({ currentTab: tab });
    
    // 重新筛选物品
    // 这里需要重新获取所有物品，然后根据当前标签筛选
    this.loadMyItems();
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
    wx.navigateTo({
      url: `/pages/detail/detail?id=${id}`
    });
  },

  // 物品操作
  editItem(e) {
    const id = e.currentTarget.dataset.id;
    wx.showToast({
      title: '编辑功能开发中',
      icon: 'none'
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
              this.loadMyItems();
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

  // 页面分享
  onShareAppMessage() {
    return {
      title: '闲置地图 - 我的发布',
      path: '/pages/mine/mine'
    };
  }
});