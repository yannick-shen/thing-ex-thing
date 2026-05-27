const app = getApp();
// 不同交易类型的图标配置
const MODE_ICONS = {
  sale: '/assets/icons/marker-sale.png',
  exchange: '/assets/icons/marker-exchange.png',
  donate: '/assets/icons/marker-donate.png',
  help: '/assets/icons/marker-help.png',
  default: '/assets/icons/marker.png'
};
// 聚合图标
const CLUSTER_ICON = '/assets/icons/marker-cluster.png';

Page({
  data: {
    center: app?.globalData?.defaultCenter || { latitude: 39.908722, longitude: 116.397499 },
    scale: 16,
    showLocation: true, // 用于强制刷新蓝色定位点
    showLocationTip: false, // 定位提示气泡
    markers: [],
    showSearch: false,
    searchKeyword: '',
    tmpKeyword: '',
    selectedMode: 'all',
    modeOptions: [
      { value: 'all', label: '全部' },
      { value: 'sale', label: '出售' },
      { value: 'exchange', label: '交换' },
      { value: 'donate', label: '赠送' },
      { value: 'help', label: '求助' }
    ],
    clusterItems: [], // 聚合点的物品列表
    showClusterList: false, // 是否显示聚合列表
    // 详情弹窗相关
    showDetailModal: false,
    detailItem: null,
    detailFavorited: false,
    detailCreateTime: '',
    detailImgIndex: 0
  },

  // 显示聚合点物品列表
  showClusterList(markerId) {
    const marker = this.data.markers[markerId];
    console.log('showClusterList:', markerId, marker);
    if (!marker || !marker.items) return;

    this.setData({
      clusterItems: marker.items,
      showClusterList: true
    });
  },

  // 关闭聚合列表
  hideClusterList() {
    this.setData({ showClusterList: false });
  },

  // 选择聚合列表中的物品
  selectClusterItem(e) {
    const itemId = e.currentTarget.dataset.id;
    this.hideClusterList();
    this.showDetailModal(itemId);
  },

  loadTimer: null, // 节流定时器
  mapCache: null, // 地图数据缓存
  cacheValidTime: 10 * 60 * 1000, // 缓存有效时间10分钟
  
  // 生成缓存key
  getCacheKey(center, radiusKm, keyword, mode) {
    const lat = center.latitude.toFixed(4);
    const lng = center.longitude.toFixed(4);
    return `map_cache_${lat}_${lng}_${radiusKm}_${keyword || ''}_${mode || ''}`;
  },

  // 检查缓存（添加1km距离阈值判断）
  getCache(center, radiusKm, keyword, mode) {
    const key = this.getCacheKey(center, radiusKm, keyword, mode);
    const cache = wx.getStorageSync(key);
    
    // 检查缓存是否存在且未过期
    if (cache && cache.timestamp) {
      const timeDiff = Date.now() - cache.timestamp;
      const isTimeValid = timeDiff < this.cacheValidTime;
      
      if (isTimeValid) {
        // 缓存未过期，检查位置匹配（1km阈值）
        if (cache.center) {
          const distance = calculateDistance(
            center.latitude, center.longitude,
            cache.center.latitude, cache.center.longitude
          );
          
          const DISTANCE_THRESHOLD = 1.0; // 1公里阈值
          
          if (distance < DISTANCE_THRESHOLD) {

            return cache.data;
          } else {
            console.log(`[缓存不匹配] 距离: ${distance.toFixed(2)}km ≥ ${DISTANCE_THRESHOLD}km`);
            return null;
          }
        } else {
          // 旧缓存没有位置信息，直接使用

          return cache.data;
        }
      } else {

        return null;
      }
    }
    
    return null;
  },

  // 设置缓存（添加位置信息）
  setCache(center, radiusKm, keyword, mode, data) {
    const key = this.getCacheKey(center, radiusKm, keyword, mode);
    wx.setStorageSync(key, {
      data,
      center, // 存储位置信息，用于距离匹配
      timestamp: Date.now()
    });
  },

  onLoad() {
    this.mapCtx = wx.createMapContext('map');
    this.initLocation();
    this.loadSearchHistory();
  },
  onShow() {
    // 只在标记为true时刷新标记点
    const refreshMarkers = wx.getStorageSync('refreshMarkers');
    
    if (refreshMarkers) {
      console.log('[index.onShow] >>> 调用 loadMarkers');
      this.loadMarkers();
      wx.removeStorageSync('refreshMarkers');
    }

  },
  initLocation() {
    const cached = wx.getStorageSync('cachedUserLocation');
    const hasCache = cached && cached.latitude && cached.longitude;

    // 步骤1：有缓存时立刻展示（零等待）
    if (hasCache) {
      this._markersLoaded = true;
      this.setData({ center: { latitude: cached.latitude, longitude: cached.longitude } });
      const app = getApp();
      if (app) {
        app.globalData.userLocation = { latitude: cached.latitude, longitude: cached.longitude };
      }
      console.log('使用缓存位置立即展示:', cached);
      this.loadMarkers();
    }

    // 步骤2：等待地图就绪后检查权限
    this._waitForMapReady(() => {
      wx.getSetting({
        success: (res) => {
          const authStatus = res.authSetting['scope.userLocation'];

          if (authStatus === true) {
            // 已授权 → 获取精确位置 + 刷新蓝点
            this.setData({ showLocationTip: false });
            this._doMoveToLocation(hasCache ? cached : null);
          } else {
            // 未授权（undefined 或 false）→ 显示气泡引导
            if (!hasCache) {
              // 无缓存：不加载物品，等用户操作
              this.setData({ showLocationTip: true });
            } else {
              // 有缓存但权限被撤销了，仍然提示用户
              this.setData({ showLocationTip: true });
            }
          }
        },
        fail: () => {
          // getSetting 失败也显示气泡
          if (!hasCache) this.setData({ showLocationTip: true });
        }
      });
    });
  },

  // 移动地图到用户位置并加载物品
  _doMoveToLocation(cached) {
    this._moveToUserLocation()
      .then(center => {
        if (center) {
          const hasCache = cached && cached.latitude && cached.longitude;
          const isSignificantMove = !hasCache ||
            Math.abs(center.latitude - cached.latitude) > 0.01 ||
            Math.abs(center.longitude - cached.longitude) > 0.01;

          if (!hasCache || isSignificantMove) {
            this.setData({ center });
            const app = getApp();
            if (app) {
              app.globalData.userLocation = center;
            }
            wx.setStorageSync('cachedUserLocation', { ...center, time: Date.now() });
            console.log('位置已更新:', center);
          }
        }
        if (!this._markersLoaded) {
          this._markersLoaded = true;
          this.loadMarkers();
        }
      })
      .catch(error => {
        console.error('定位异常:', error);
        if (!this._markersLoaded) {
          this._markersLoaded = true;
          this.loadMarkers();
        }
      });
  },

  // 等待地图组件就绪（通过bindregionchange事件或超时回退）
  _waitForMapReady(callback) {
    if (this._mapReady) {
      callback();
      return;
    }
    this._mapReadyCallback = callback;
    // 安全超时：3秒后如果 regionchange 仍未触发，强制执行回调
    // 在开发者工具中 regionchange 可能不会主动触发
    if (!this._mapReadyFallbackTimer) {
      this._mapReadyFallbackTimer = setTimeout(() => {
        if (!this._mapReady) {
          console.log('_waitForMapReady 超时回退，强制标记地图就绪');
          this._mapReady = true;
          if (this._mapReadyCallback) {
            const cb = this._mapReadyCallback;
            this._mapReadyCallback = null;
            cb();
          }
        }
      }, 3000);
    }
  },

  // 通过地图组件 moveToLocation + getCenterLocation 获取用户位置
  _moveToUserLocation() {
    return new Promise((resolve) => {
      this.mapCtx.moveToLocation();
      // 等待地图视口移动到蓝点位置
      setTimeout(() => {
        this.mapCtx.getCenterLocation({
          success: (res) => {
            resolve({ latitude: res.latitude, longitude: res.longitude });
          },
          fail: () => resolve(null)
        });
      }, 500);
    });
  },

  onRegionChange(e) {
    // 标记地图首次渲染就绪，触发待执行的回调
    if (!this._mapReady) {
      this._mapReady = true;
      // 清理超时回退定时器
      if (this._mapReadyFallbackTimer) {
        clearTimeout(this._mapReadyFallbackTimer);
        this._mapReadyFallbackTimer = null;
      }
      if (this._mapReadyCallback) {
        this._mapReadyCallback();
        this._mapReadyCallback = null;
      }
    }

    if (e.type === 'end') {
      const { center, scale, searchKeyword, selectedMode } = this.data;
      
      // 清除之前的定时器
      if (this.loadTimer) clearTimeout(this.loadTimer);
      
      const radiusKm = 2;
      const mode = selectedMode === 'all' ? '' : selectedMode;
      
      // 1. 立即检查缓存
      const cachedItems = this.getCache(center, radiusKm, searchKeyword, mode);
      
      if (cachedItems) {
        // 缓存命中，立即显示数据

        this.processItems(cachedItems, scale);
        return;
      }
      
      // 2. 缓存未命中，延迟1秒加载

      this.loadTimer = setTimeout(() => {
        this.updateCenterAndLoad();
      }, 1000);
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
    const { center, scale, searchKeyword, selectedMode } = this.data;
    const radiusKm = 2;
    const mode = selectedMode === 'all' ? '' : selectedMode;

    // 防止重复请求：如果正在加载则跳过
    if (this.isLoading) {
      return;
    }

    // 检查缓存（仅在非强制刷新时使用缓存）
    const cachedItems = this.getCache(center, radiusKm, searchKeyword, mode);
    if (cachedItems) {
      this.processItems(cachedItems, scale);
      return;
    }

    this.isLoading = true;

    // 云函数查询视野内数据（后端已根据状态/审核/过期过滤）
    wx.cloud.callFunction({ name: 'fetch-items-in-view', data: { center, radiusKm, keyword: searchKeyword, mode } }).then(res => {
      this.isLoading = false;
      const items = res.result?.data?.items || [];

      // 缓存结果
      this.setCache(center, radiusKm, searchKeyword, mode, items);

      this.processItems(items, scale);
    }).catch(err => {
      this.isLoading = false;
      console.warn('云函数调用失败，使用本地模拟数据:', err);
      const raw = mockFetchItems(center, radiusKm, searchKeyword);
      this.processItems(raw, scale);
    });
  },

  // 处理物品数据（提取为独立方法复用）
  processItems(items, scale) {
    const clustered = gridCluster(items, scale);
    // 保存原始数据用于点击跳转
    this.currentItems = {};
    clustered.forEach((c, idx) => {
      if (c.count === 1 && c.id) {
        this.currentItems[idx] = { id: c.id };
      }
    });
    this.setData({ 
      markers: clustered.map((c, idx) => {
        const marker = { id: idx, latitude: c.lat, longitude: c.lng, width: 32, height: 32 };

        // 单个标记点使用自定义图标
        if (c.count === 1) {
          const icon = MODE_ICONS[c.mode] || MODE_ICONS.default;
          marker.iconPath = icon;
        } else {
          // 聚合点使用聚合图标
          marker.iconPath = CLUSTER_ICON;
          marker.callout = { content: String(c.count), color: '#fff', fontSize: 10, borderRadius: 10, bgColor: '#1677ff', padding: 2, display: 'ALWAYS' };
          marker.items = c.items;
        }

        return marker;
      }) 
    });
  },

  onMarkerTap(e) {
    const markerId = e.markerId;
    const marker = this.data.markers[markerId];
    console.log('点击标记点:', markerId, marker);

    // 如果是聚合簇（显示数字而不是圆点），显示聚合列表
    if (marker && marker.callout && marker.callout.bgColor) {
      console.log('是聚合点，显示列表');
      this.showClusterList(markerId);
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
    
    // 如果有缓存且未过期（8分钟），先显示缓存内容
    if (cachedData && (Date.now() - cachedData.timestamp < 8 * 60 * 1000)) {
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
      // 检查登录状态
      const authManager = require('../../utils/auth.js');
      const isLoggedIn = authManager.isLoggedIn();
      
      // 获取物品详情和收藏状态
      const requests = [
        wx.cloud.callFunction({
          name: 'get-item-detail',
          data: { itemId }
        })
      ];
      
      // 只有登录用户才请求收藏状态
      let favorited = false;
      if (isLoggedIn) {
        requests.push(
          wx.cloud.callFunction({
            name: 'get-my-favorites',
            data: { itemId }
          })
        );
      }
      
      const results = await Promise.all(requests);
      const detailRes = results[0];

      if (showLoading) {
        wx.hideLoading();
      }

      if (detailRes.result.code === 0) {
        const item = detailRes.result.data.item;
        
        // 如果有收藏状态结果，解析它
        if (results.length > 1 && results[1] && results[1].result && results[1].result.code === 0) {
          favorited = results[1].result.data.favorited || false;
        }
        
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
  selectMode(e) {
    const mode = e.currentTarget.dataset.mode;
    this.setData({ selectedMode: mode }, () => this.loadMarkers());
  },
  
  // 重新定位到当前位置
  relocate() {
    console.log('开始重新定位...');
    // 开发者工具没有真实 OS 权限系统，wx.authorize 的 callback 可能不触发
    // 导致后续流程卡死。通过 platform 检测环境做兼容处理。
    const sysInfo = wx.getSystemInfoSync();
    const isDevtools = sysInfo && sysInfo.platform === 'devtools';

    wx.getSetting({
      success: (res) => {
        const authStatus = res.authSetting['scope.userLocation'];
        console.log('定位权限状态:', authStatus, isDevtools ? '(devtools)' : '');

        if (authStatus === true) {
          // 已授权：直接定位 + toggle 蓝点
          this.setData({ showLocationTip: false });
          this._doRelocateFlow();
        } else if (authStatus === undefined) {
          if (isDevtools) {
            // devtools 无真实权限系统，跳过 wx.authorize，直接定位
            console.log('devtools: 跳过 wx.authorize，直接定位');
            this.setData({ showLocationTip: false });
            this._doRelocateFlow();
          } else {
            // 真机：调用 wx.authorize 弹出系统权限窗（用户手势触发，有效）
            wx.authorize({
              scope: 'scope.userLocation',
              success: () => {
                console.log('用户同意位置授权');
                this.setData({ showLocationTip: false });
                this._doRelocateFlow();
              },
              fail: () => {
                console.log('用户拒绝位置授权');
                this._handlePermissionDenied();
              }
            });
          }
        } else {
          // 曾拒绝（false）：无法再弹系统窗，引导去设置
          this._handlePermissionDenied();
        }
      },
      fail: () => {
        // getSetting 失败，尝试直接定位
        this._doRelocateFlow();
      }
    });
  },

  // 定位流程：toggle showLocation 强制蓝点出现 → moveToLocation → 获取坐标
  _doRelocateFlow() {
    // 先 toggle showLocation 确保授权后蓝色定位点正确渲染
    this.setData({ showLocation: false }, () => {
      this.setData({ showLocation: true }, () => {
        // 短暂延迟让地图组件完成 show-location 重新绑定
        setTimeout(() => {
          this._moveToUserLocation()
            .then(center => {
              if (center) {
                this.setData({ center, scale: 16 });
                const app = getApp();
                if (app) {
                  app.globalData.userLocation = center;
                }
                wx.setStorageSync('cachedUserLocation', { ...center, time: Date.now() });
                console.log('重新定位成功:', center);
              } else {
                // devtools 中 getCenterLocation 可能返回 null，使用当前位置加载
                console.log('重新定位：getCenterLocation 返回 null，使用当前地图中心');
              }
              // 无论是否拿到精确坐标，都加载物品 + 标记已完成
              this._markersLoaded = true;
              setTimeout(() => this.loadMarkers(), 300);
            })
            .catch(error => {
              console.error('重新定位异常:', error);
              this._markersLoaded = true;
              this.loadMarkers();
            });
        }, 150);
      });
    });
  },

  // 权限被拒绝后的处理：引导去设置页
  _handlePermissionDenied() {
    wx.showModal({
      title: '需要位置权限',
      content: '获取您的位置才能显示附近的闲置物品，是否前往设置开启？',
      confirmText: '去设置',
      cancelText: '使用默认位置',
      success: (modalRes) => {
        if (modalRes.confirm) {
          // 去设置页
          wx.openSetting({
            success: (settingRes) => {
              if (settingRes.authSetting['scope.userLocation']) {
                // 用户在设置中开启了权限
                console.log('用户在设置中开启了位置权限');
                this.setData({ showLocationTip: false });
                this._doRelocateFlow();
              } else {
                // 用户未开启，加载默认位置物品
                this.setData({ showLocationTip: false });
                this._loadDefaultMarkers();
              }
            },
            fail: () => {
              this.setData({ showLocationTip: false });
              this._loadDefaultMarkers();
            }
          });
        } else {
          // 用户选择使用默认位置
          this.setData({ showLocationTip: false });
          this._loadDefaultMarkers();
        }
      }
    });
  },

  // 加载默认位置附近的物品
  _loadDefaultMarkers() {
    if (!this._markersLoaded) {
      this._markersLoaded = true;
      this.loadMarkers();
    }
  },

  // 关闭定位提示气泡
  dismissLocationTip(e) {
    if (e) e.stopPropagation && e.stopPropagation();
    this.setData({ showLocationTip: false });
    // 用户主动关闭气泡，加载默认位置物品
    this._loadDefaultMarkers();
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
    const authManager = require('../../utils/auth.js');

    if (!authManager.isLoggedIn()) {
      wx.showToast({
        title: '请先登录',
        icon: 'none'
      });
      return;
    }

    const { detailItem } = this.data;
    const currentUser = authManager.getCurrentUser();
    const currentUserId = currentUser ? currentUser.userId : null;

    if (!detailItem) {
      return;
    }

    if (detailItem.authorId === currentUserId) {
      wx.showToast({ title: '这是您发布的物品', icon: 'none' });
      return;
    }

    // 直接跳转到联系对方页面
    wx.navigateTo({
      url: `/pages/contact-seller/contact-seller?itemId=${detailItem._id}`
    });
  },

  // 跳转到评论页面
  goToComments() {
    const { detailItem } = this.data;
    if (detailItem && detailItem._id) {
      wx.navigateTo({
        url: `/pages/comment/comment?itemId=${detailItem._id}&title=${encodeURIComponent(detailItem.title)}`,
        success: (res) => {
          // 通过 eventChannel 传递物品信息，避免重复调用云函数
          res.eventChannel.emit('transferItem', detailItem);
        }
      });
    }
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

// ===== 计算两点间距离（Haversine公式，单位km）=====
function calculateDistance(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

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
    if (arr.length <= 1) {
      // 不聚合，返回原始点
      clusters.push(...arr.map(a => ({ lat: a.lat, lng: a.lng, count: 1, id: a.id, mode: a.mode })));
    } else {
      // 聚合为簇：用平均位置
      const lat = arr.reduce((s, a) => s + a.lat, 0) / arr.length;
      const lng = arr.reduce((s, a) => s + a.lng, 0) / arr.length;
      clusters.push({ lat, lng, count: arr.length, items: arr });
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
