Page({
  data: {
    // 账户摘要
    balance: 0,
    totalEarned: 0,
    totalSpent: 0,

    // 交易列表
    list: [],
    page: 1,
    pageSize: 20,
    total: 0,
    hasMore: false,
    loading: true,
    loadingMore: false
  },

  onLoad() {
    this.loadBalance()
    this.loadHistory(1)
  },

  // 加载积分余额
  async loadBalance() {
    try {
      const res = await wx.cloud.callFunction({
        name: 'points-service',
        data: { action: 'getBalance' }
      })
      if (res.result && res.result.code === 0) {
        const d = res.result.data
        this.setData({
          balance: d.balance || 0,
          totalEarned: d.totalEarned || 0,
          totalSpent: d.totalSpent || 0
        })
      }
    } catch (e) {
      console.error('加载余额失败:', e)
    }
  },

  // 加载积分明细
  async loadHistory(page) {
    if (page === 1) {
      this.setData({ loading: true })
    } else {
      this.setData({ loadingMore: true })
    }

    try {
      const res = await wx.cloud.callFunction({
        name: 'points-service',
        data: {
          action: 'getHistory',
          params: { page, pageSize: this.data.pageSize }
        }
      })

      if (res.result && res.result.code === 0) {
        const { list, total } = res.result.data
        const oldList = page === 1 ? [] : this.data.list
        this.setData({
          list: oldList.concat(list),
          total,
          page,
          hasMore: oldList.length + list.length < total,
          loading: false,
          loadingMore: false
        })
      } else {
        this.setData({ loading: false, loadingMore: false })
      }
    } catch (e) {
      console.error('加载积分明细失败:', e)
      this.setData({ loading: false, loadingMore: false })
      wx.showToast({ title: '加载失败', icon: 'none' })
    }
  },

  // 加载更多
  loadMore() {
    if (!this.data.hasMore || this.data.loadingMore) return
    this.loadHistory(this.data.page + 1)
  },

  // 下拉刷新
  async onPullDownRefresh() {
    this.setData({ page: 1, list: [] })
    await this.loadBalance()
    await this.loadHistory(1)
    wx.stopPullDownRefresh()
  },

  // 页面分享
  onShareAppMessage() {
    return {
      title: '闲置地图 - 积分明细',
      path: '/pages/points-detail/points-detail'
    }
  }
})
