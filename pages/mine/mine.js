Page({
  data: {
    stats: {
      published: 0,
      active: 0,
      draft: 0
    },
    currentTab: 'active',
    items: [],
    loading: true
  },

  onLoad() {
    this.loadMyItems();
  },

  onShow() {
    // 每次显示页面时刷新数据
    this.loadMyItems();
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
      formattedTime: this.formatTime(item.updatedAt || item.createdAt)
    }));

    const now = Date.now();
    const activeItems = items.filter(item => 
      item.status === 'on' && item.expireAt > now
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
    const status = e.currentTarget.dataset.status;

    // 草稿状态的物品，跳转到编辑页面
    if (status === 'draft' || status === 'off') {
      // publish是tabBar页面，需要先缓存编辑参数
      wx.setStorageSync('editItemId', id);
      wx.setStorageSync('editMode', 'edit');
      wx.switchTab({
        url: '/pages/publish/publish'
      });
    } else {
      // 正常上架物品，跳转到详情页
      wx.navigateTo({
        url: `/pages/detail/detail?id=${id}`
      });
    }
  },

  // 物品操作

  async publishDraft(e) {
    const id = e.currentTarget.dataset.id;
    
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
              this.loadMyItems();
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

  // 页面分享
  onShareAppMessage() {
    return {
      title: '闲置地图 - 我的发布',
      path: '/pages/mine/mine'
    };
  }
});