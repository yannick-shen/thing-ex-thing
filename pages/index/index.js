const app = getApp();

// 不同交易类型的颜色配置
const MODE_COLORS = {
  sale: '#FF4757',     // 出售 - 红色
  exchange: '#3742FA', // 交换 - 蓝色  
  donate: '#2ED573',   // 赠送 - 绿色
  help: '#FFA502'      // 求助 - 橙色
};

Page({
  data: {
    center: app?.globalData?.defaultCenter || { latitude: 39.908722, longitude: 116.397499 },
    scale: 16,
    markers: [],
    showSearch: false,
    searchKeyword: '',
    tmpKeyword: '',
    // 详情弹窗相关
    showDetailModal: false,
    detailItem: null,
    detailFavorited: false,
    detailCreateTime: '',
    detailImgIndex: 0
  },
  loadTimer: null, // 节流定时器
  onLoad() {
    this.mapCtx = wx.createMapContext('map');
    this.initLocation();
    this.loadSearchHistory();
  },
  onShow() { },
  initLocation() {
    // 使用location工具管理位置权限
    const locationUtil = require('../../utils/location.js');
    
    // 请求位置权限并获取位置
    locationUtil.requestLocationPermission().then(result => {
      if (result.success && result.location) {
        // 成功获取位置，更新地图中心
        this.setData({ 
          center: { 
            latitude: result.location.latitude, 
            longitude: result.location.longitude 
          } 
        });
        
        // 更新全局位置
        const app = getApp();
        if (app) {
          app.globalData.userLocation = {
            latitude: result.location.latitude,
            longitude: result.location.longitude
          };
        }
        
        console.log('成功获取用户位置:', result.location);
      } else {
        // 未授权或获取失败，使用默认位置
        console.log('未获取到位置权限，使用默认位置:', result.message || '无权限');
      }
      
      // 无论是否获取到位置，都加载标记点
      this.loadMarkers();
    }).catch(error => {
      console.error('位置权限请求异常:', error);
      // 异常情况也加载标记点
      this.loadMarkers();
    });
  },
  onRegionChange(e) {
    if (e.type === 'end') {
      // 节流：避免频繁调用
      if (this.loadTimer) clearTimeout(this.loadTimer);
      this.loadTimer = setTimeout(() => {
        this.updateCenterAndLoad();
      }, 500); // 500ms 内只触发一次
    }
  },
  updateCenterAndLoad() {
    this.mapCtx.getCenterLocation({
      success: (res) => {
        this.setData({ center: { latitude: res.latitude, longitude: res.longitude } });
        this.loadMarkers();
      }
    });
  },
  // 模拟数据加载与轻量聚合（按网格）
  loadMarkers() {
    const { center, scale, searchKeyword } = this.data;
    const radiusKm = 2;
    
    // 防止重复请求：如果正在加载则跳过
    if (this.isLoading) {
      console.log('正在加载中，跳过本次请求');
      return;
    }
    this.isLoading = true;
    
    // 云函数查询视野内数据（后端已根据状态/审核/过期过滤）
    wx.cloud.callFunction({ name: 'fetch-items-in-view', data: { center, radiusKm, keyword: searchKeyword } }).then(res => {
      this.isLoading = false;
      const items = res.result?.data?.items || [];
      const clustered = gridCluster(items, scale);
      // 保存原始数据用于点击跳转
      this.currentItems = {};
      clustered.forEach((c, idx) => {
        if (c.count === 1 && c.id) {
          this.currentItems[idx] = { id: c.id };
        }
      });
      this.setData({ markers: clustered.map((c, idx) => {
        const marker = { id: idx, latitude: c.lat, longitude: c.lng, width: 24, height: 24 };
        
        // 单个标记点根据交易类型设置颜色
        if (c.count === 1) {
          const color = MODE_COLORS[c.mode] || MODE_COLORS.sale;
          // 使用不同颜色的圆点作为标记
          marker.callout = { 
            content: '●', 
            color: color, 
            fontSize: 16, 
            display: 'ALWAYS',
            textAlign: 'center',
            anchorX: 0,
            anchorY: 0
          };
        } else {
          // 聚合点显示数量，使用默认颜色
          marker.callout = { content: String(c.count), color: '#fff', fontSize: 12, borderRadius: 12, bgColor: '#1677ff', padding: 4, display: 'ALWAYS' };
        }
        
        return marker;
      }) });
    }).catch(err => {
      this.isLoading = false;
      console.warn('云函数调用失败，使用本地模拟数据:', err);
      const raw = mockFetchItems(center, radiusKm, searchKeyword);
      const clustered = gridCluster(raw, scale);
      this.setData({ markers: clustered.map((c, idx) => {
        const marker = { id: idx, latitude: c.lat, longitude: c.lng, width: 24, height: 24 };
        
        // 单个标记点根据交易类型设置颜色
        if (c.count === 1) {
          const color = MODE_COLORS[c.mode] || MODE_COLORS.sale;
          // 使用不同颜色的圆点作为标记
          marker.callout = { 
            content: '●', 
            color: color, 
            fontSize: 16, 
            display: 'ALWAYS',
            textAlign: 'center',
            anchorX: 0,
            anchorY: 0
          };
        } else {
          // 聚合点显示数量，使用默认颜色
          marker.callout = { content: String(c.count), color: '#fff', fontSize: 12, borderRadius: 12, bgColor: '#1677ff', padding: 4, display: 'ALWAYS' };
        }
        
        return marker;
      }) });
    });
  },
  onMarkerTap(e) {
    const markerId = e.markerId;
    const marker = this.data.markers[markerId];
    
    // 如果是聚合簇（显示数字而不是圆点），不跳转
    if (marker && marker.callout && marker.callout.bgColor) {
      wx.showToast({ title: '请放大地图查看', icon: 'none' });
      return;
    }
    
    // 显示详情弹窗
    if (this.currentItems && this.currentItems[markerId]) {
      const itemId = this.currentItems[markerId].id;
      this.showDetailModal(itemId);
    }
  },

  // 显示详情弹窗
  async showDetailModal(itemId) {
    // 检查本地缓存
    const cacheKey = `item_detail_${itemId}`;
    const cachedData = wx.getStorageSync(cacheKey);
    
    // 如果有缓存且未过期（5分钟），先显示缓存内容
    if (cachedData && (Date.now() - cachedData.timestamp < 5 * 60 * 1000)) {
      this.setData({
        showDetailModal: true,
        detailItem: cachedData.item,
        detailFavorited: cachedData.favorited,
        detailCreateTime: this.formatTime(cachedData.item.createdAt),
        detailImgIndex: 0,
        originalLat: cachedData.item.lat,
        originalLng: cachedData.item.lng
      });
      
      // 后台更新数据（静默刷新）
      this.refreshItemDetail(itemId, false);
    } else {
      // 无缓存或已过期，显示加载提示
      wx.showLoading({ title: '加载中...' });
      await this.refreshItemDetail(itemId, true);
    }
  },

  // 刷新物品详情
  async refreshItemDetail(itemId, showLoading = false) {
    try {
      // 获取物品详情
      const res = await wx.cloud.callFunction({ 
        name: 'get-item-detail', 
        data: { itemId } 
      });
      
      if (showLoading) {
        wx.hideLoading();
      }
      
      if (res.result.code === 0) {
        const item = res.result.data.item;
        const favorited = res.result.data.favorited || false;
        const createTime = this.formatTime(item.createdAt);
        
        // 缓存数据
        const cacheKey = `item_detail_${itemId}`;
        wx.setStorageSync(cacheKey, {
          item,
          favorited,
          timestamp: Date.now()
        });
        
        // 更新界面
        this.setData({
          showDetailModal: true,
          detailItem: item,
          detailFavorited: favorited,
          detailCreateTime: createTime,
          detailImgIndex: 0,
          originalLat: item.lat,
          originalLng: item.lng
        });
        

      } else {
        if (showLoading) {
          wx.showToast({ title: res.result.message || '加载失败', icon: 'none' });
        }
      }
    } catch (err) {
      if (showLoading) {
        wx.hideLoading();
        console.error(err);
        wx.showToast({ title: '加载失败', icon: 'none' });
      }
    }
  },

  // 隐藏详情弹窗
  hideDetailModal() {
    this.setData({
      showDetailModal: false,
      detailItem: null,
      detailFavorited: false,
      detailCreateTime: '',
      detailImgIndex: 0
    });
  },

  // 阻止事件冒泡
  stopPropagation(e) {
    if (e && e.stopPropagation) {
      e.stopPropagation();
    }
  },

  // 增加浏览量
  async incrementViews(itemId) {
    try {
      const result = await wx.cloud.callFunction({
        name: 'increment-views',
        data: { itemId }
      });
      
      if (result.result && result.result.code !== 0) {
        console.warn('浏览量更新失败:', result.result.message);
      }
    } catch (err) {
      console.warn('浏览量更新失败:', err);
      // 不抛出错误，不影响用户查看详情
    }
  },

  // 格式化时间
  formatTime(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;
    const days = Math.floor(diff / (24 * 60 * 60 * 1000));
    
    if (days === 0) {
      return '今天';
    } else if (days === 1) {
      return '昨天';
    } else if (days < 7) {
      return `${days}天前`;
    } else {
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    }
  },
  openSearch() { this.setData({ showSearch: true, tmpKeyword: this.data.searchKeyword }); },
  closeSearch() { this.setData({ showSearch: false }); },
  onInput(e) { this.setData({ tmpKeyword: e.detail.value }); },
  applySearch() {
    const keyword = this.data.tmpKeyword.trim();
    if (keyword) {
      this.saveSearchHistory(keyword);
    }
    this.setData({ showSearch: false, searchKeyword: keyword }, () => this.loadMarkers());
  },
  clearSearch() { this.setData({ searchKeyword: '' }, () => this.loadMarkers()); },
  
  // 重新定位到当前位置
  relocate() {
    console.log('开始重新定位...');
    
    // 使用location工具进行定位，静默操作
    const locationUtil = require('../../utils/location.js');
    
    locationUtil.requestLocationPermission().then(result => {
      if (result.success && result.location) {
        // 定位成功，更新地图中心点和缩放级别
        this.setData({
          center: {
            latitude: result.location.latitude,
            longitude: result.location.longitude
          },
          scale: 16 // 设置合适的缩放级别
        });
        
        // 更新全局位置
        const app = getApp();
        if (app) {
          app.globalData.userLocation = {
            latitude: result.location.latitude,
            longitude: result.location.longitude
          };
        }
        
        console.log('重新定位成功:', result.location);
        
        // 延迟加载标记点，避免卡顿
        setTimeout(() => this.loadMarkers(), 300);
        
      } else {
        // 静默处理失败，不显示提示
        console.log('重新定位失败:', result.message);
      }
    }).catch(error => {
      // 静默处理异常，不显示提示
      console.error('重新定位异常:', error);
    });
  },

  goPublish() {
    wx.navigateTo({ url: '/pages/publish/publish' });
  },

  // 弹窗内的图片切换
  onDetailSwiperChange(e) {
    this.setData({
      detailImgIndex: e.detail.current
    });
  },

  // 弹窗内预览图片
  previewDetailImage(e) {
    const index = e.currentTarget.dataset.index;
    wx.previewImage({
      current: this.data.detailItem.images[index],
      urls: this.data.detailItem.images,
      showmenu: true,
      enableLongPress: true
    });
  },

  // 弹窗内收藏
  async handleDetailFavorite() {
    const authManager = require('../../utils/auth.js');
    
    if (!authManager.isLoggedIn()) {
      wx.showToast({
        title: '请先登录',
        icon: 'none'
      });
      return;
    }

    const { detailItem, detailFavorited } = this.data;
    
    // 立即更新UI状态，提供即时反馈
    const newState = !detailFavorited;
    const newFavoritesCount = detailFavorited 
      ? detailItem.counters.favorites - 1 
      : detailItem.counters.favorites + 1;
    
    this.setData({
      detailFavorited: newState,
      'detailItem.counters.favorites': newFavoritesCount
    });
    
    // 异步调用云函数，不阻塞UI
    this.toggleFavoriteCloud(detailItem._id, newState).catch(err => {
      // 如果失败，恢复原状态
      console.error('收藏操作失败，恢复原状态:', err);
      this.setData({
        detailFavorited: detailFavorited,
        'detailItem.counters.favorites': detailItem.counters.favorites
      });
      
      wx.showToast({
        title: '操作失败，请重试',
        icon: 'none'
      });
    });
  },

  // 云函数收藏操作
  async toggleFavoriteCloud(itemId, newState) {
    try {
      const result = await wx.cloud.callFunction({
        name: 'toggle-favorite',
        data: { itemId }
      });
      
      if (result.result.code !== 0) {
        throw new Error(result.result.message || '操作失败');
      }
    } catch (err) {
      throw err;
    }
  },

  // 弹窗内联系卖家
  handleDetailContact() {
    wx.showToast({
      title: '功能开发中',
      icon: 'none'
    });
  },

  // 查找丢失的物品
  async findMissingItems() {
    wx.showLoading({ title: '查询中...' });
    
    try {
      // 查询所有上架中的物品
      const result = await wx.cloud.callFunction({
        name: 'find-item',
        data: { 
          status: 'on',
          limit: 50 
        }
      });
      
      wx.hideLoading();
      
      if (result.result.code === 0) {
        const items = result.result.data.items;
        
        // 统计各类型数量
        const stats = {};
        items.forEach(item => {
          stats[item.mode] = (stats[item.mode] || 0) + 1;
        });
        
        const message = `上架中物品: ${items.length}个\n` +
          `出售: ${stats.sale || 0}个\n` +
          `交换: ${stats.exchange || 0}个\n` +
          `赠送: ${stats.donate || 0}个\n` +
          `求助: ${stats.help || 0}个`;
        
        wx.showModal({
          title: '物品统计',
          content: message,
          showCancel: false
        });
      }
    } catch (err) {
      wx.hideLoading();
      console.error('查询失败:', err);
      wx.showToast({
        title: '查询失败',
        icon: 'none'
      });
    }
  },

  // 打开调试控制台
    openDebugConsole() {
    wx.showModal({
      title: '调试选项',
      content: '1. 部署 increment-views 云函数\n2. 部署 find-item 云函数\n3. 清除缓存重新编译',
      showCancel: false
    });
  },

  // 阻止详情内容滑动穿透到地图
  stopDetailScroll(e) {
    // 只在移动事件时阻止传播，点击事件不阻止
    if (e.type && (e.type === 'touchmove' || e.type === 'touchend')) {
      if (e.stopPropagation) {
        e.stopPropagation();
      }
    }
  },




  loadSearchHistory() {
    const history = wx.getStorageSync('searchHistory') || [];
    this.setData({ searchHistory: history.slice(0, 10) });
  },
  saveSearchHistory(keyword) {
    let history = wx.getStorageSync('searchHistory') || [];
    history = history.filter(item => item !== keyword);
    history.unshift(keyword);
    history = history.slice(0, 10);
    wx.setStorageSync('searchHistory', history);
    this.setData({ searchHistory: history });
  },
  selectHistory(e) {
    const keyword = e.currentTarget.dataset.keyword;
    this.setData({ tmpKeyword: keyword, showSearch: false, searchKeyword: keyword }, () => this.loadMarkers());
  },
  clearHistory() {
    wx.showModal({
      title: '确认清空',
      content: '是否清空所有搜索历史？',
      success: (res) => {
        if (res.confirm) {
          wx.removeStorageSync('searchHistory');
          this.setData({ searchHistory: [] });
          wx.showToast({ title: '已清空', icon: 'success' });
        }
      }
    });
  },

  noop() {}
});

// ===== 轻量聚合（示例）=====
function gridCluster(items, scale) {
  // 根据缩放级别选择网格大小（越小越细）
  const gridDeg = scale >= 16 ? 0.002 : scale >= 14 ? 0.005 : 0.01; // 约等于 200m/500m/1km
  const buckets = new Map();
  for (const it of items) {
    const keyLat = Math.floor(it.lat / gridDeg) * gridDeg;
    const keyLng = Math.floor(it.lng / gridDeg) * gridDeg;
    const key = keyLat + ',' + keyLng;
    const arr = buckets.get(key) || [];
    arr.push(it);
    buckets.set(key, arr);
  }
  const clusters = [];
  buckets.forEach((arr, key) => {
    if (arr.length <= 50) {
      // 不聚合，返回原始点
      clusters.push(...arr.map(a => ({ lat: a.lat, lng: a.lng, count: 1, id: a.id, mode: a.mode })));
    } else {
      // 聚合为簇：用平均位置
      const lat = arr.reduce((s, a) => s + a.lat, 0) / arr.length;
      const lng = arr.reduce((s, a) => s + a.lng, 0) / arr.length;
      clusters.push({ lat, lng, count: arr.length });
    }
  });
  return clusters;
}

// ===== 模拟后端数据 =====
function mockFetchItems(center, radiusKm, keyword) {
  // 生成随机点（真实环境中改为云函数查询），过滤关键词
  const N = 120; // 演示用
  const items = [];
  for (let i = 0; i < N; i++) {
    const dLat = (Math.random() - 0.5) * (radiusKm / 111); // 约 1度纬度=111km
    const dLng = (Math.random() - 0.5) * (radiusKm / (111 * Math.cos(center.latitude * Math.PI / 180)));
    const title = '物品' + (i + 1);
    const desc = '这是一个示例描述' + (i + 1);
    const modes = ['sale', 'exchange', 'donate', 'help'];
    const mode = modes[i % 4]; // 循环分配不同类型
    if (keyword && !((title + desc).includes(keyword))) continue;
    items.push({ id: i + 1, lat: center.latitude + dLat, lng: center.longitude + dLng, title, desc, mode });
  }
  return items;
}