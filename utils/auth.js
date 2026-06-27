// 用户认证管理工具
class AuthManager {
  constructor() {
    this.currentUser = null
    this.loginCallbacks = []
    this._loginStatusCache = null  // 缓存登录状态，避免频繁读Storage
    this._loginCacheTime = 0       // 缓存时间
  }

  // 检查登录状态
  isLoggedIn() {
    const now = Date.now()
    // 10秒内使用缓存结果，避免频繁读Storage和重复日志
    if (this._loginStatusCache !== null && (now - this._loginCacheTime) < 10000) {
      return this._loginStatusCache
    }

    const userId = wx.getStorageSync('userId')
    const userInfo = wx.getStorageSync('userInfo')

    // 基本检查
    if (!userId || !userInfo) {
      this._updateCache(false)
      return false
    }

    // 检查登录时间,超过24小时需要重新登录
    const lastLoginTime = wx.getStorageSync('lastLoginTime')
    if (!lastLoginTime) {
      this._updateCache(false)
      return false
    }

    const timeDiff = now - lastLoginTime
    const maxAge = 24 * 60 * 60 * 1000  // 24小时

    if (timeDiff > maxAge) {
      console.log('登录已超过24小时,需要重新登录')
      this._updateCache(false)
      return false
    }

    // 用户活跃时自动续期，避免正在使用中被踢出
    wx.setStorageSync('lastLoginTime', now)

    this._updateCache(true)
    return true
  }

  // 更新登录状态缓存
  _updateCache(status) {
    this._loginStatusCache = status
    this._loginCacheTime = Date.now()
  }

  // 清除登录状态缓存（登录/退出时调用）
  clearCache() {
    this._loginStatusCache = null
    this._loginCacheTime = 0
  }

  // 获取当前用户
  getCurrentUser() {
    if (this.currentUser) {
      return this.currentUser
    }
    
    const userId = wx.getStorageSync('userId')
    const userInfo = wx.getStorageSync('userInfo')
    
    if (userId && userInfo) {
      this.currentUser = {
        userId: userId,
        ...userInfo
      }
      return this.currentUser
    }
    
    return null
  }

  // 登录
  async login(loginCode, userProfile = null) {
    try {
      console.log('开始调用云函数 user-auth 进行登录...')
      
      // 先检查一下云环境状态
      console.log('当前云环境状态检查...')
      console.log('wx.cloud 对象存在:', !!wx.cloud)
      
      const callData = {
        action: 'login'
      }
      
      // 如果传入了登录凭证，添加到调用参数中
      if (loginCode) {
        callData.code = loginCode
        console.log('包含登录凭证:', loginCode)
      }
      
      // 如果传入了用户信息，添加到调用参数中
      if (userProfile) {
        callData.userProfile = userProfile
        console.log('包含用户信息:', userProfile)
      }
      
      console.log('调用参数:', callData)
      console.log('准备调用云函数...')
      
      const result = await wx.cloud.callFunction({
        name: 'user-auth',
        data: callData
      })
      
      console.log('云函数调用返回，result对象结构:')
      console.log('- result存在:', !!result)
      console.log('- result.result存在:', !!(result && result.result))

      console.log('云函数调用完成，完整结果:', result)
      console.log('云函数返回的result对象:', result.result)

      // 检查返回结果的结构
      if (!result || !result.result) {
        console.error('云函数返回格式异常，缺少result字段')
        return { 
          success: false, 
          error: { message: '云函数返回格式异常' } 
        }
      }

      const cloudResult = result.result
      console.log('解析后的云函数结果:', cloudResult)

      if (cloudResult.code === 0) {
        console.log('云函数返回成功，解析数据...')
        
        if (!cloudResult.data) {
          console.error('云函数返回缺少data字段')
          return { 
            success: false, 
            error: { message: '云函数返回缺少用户数据' } 
          }
        }

        const { userId, profile, stats, isNewUser, lastSignDate, consecutiveDays, todayAdCount, todayContactCount, adCountDate, contactCountDate } = cloudResult.data
        
        console.log('登录成功解析用户数据:')
        console.log('- userId:', userId)
        console.log('- profile:', profile)
        console.log('- stats:', stats)
        console.log('- isNewUser:', isNewUser)
        console.log('- lastSignDate:', lastSignDate, 'consecutiveDays:', consecutiveDays)
        
        // 保存用户信息到本地（包含积分字段）
        wx.setStorageSync('userId', userId)
        wx.setStorageSync('userInfo', { 
          profile, 
          stats,
          lastSignDate: lastSignDate || '',
          consecutiveDays: consecutiveDays || 0,
          todayAdCount: todayAdCount || 0,
          todayContactCount: todayContactCount || 0,
          adCountDate: adCountDate || '',
          contactCountDate: contactCountDate || ''
        })
        wx.setStorageSync('lastLoginTime', Date.now())
        
        this.currentUser = {
          userId: userId,
          profile: profile,
          stats: stats,
          lastSignDate: lastSignDate || '',
          consecutiveDays: consecutiveDays || 0,
          todayAdCount: todayAdCount || 0,
          todayContactCount: todayContactCount || 0,
          adCountDate: adCountDate || '',
          contactCountDate: contactCountDate || ''
        }

        console.log('用户信息已保存到本地存储')

        // 通知所有登录回调
        this.loginCallbacks.forEach(callback => callback(this.currentUser))
        this.clearCache()

        console.log('登录流程完成')

        return {
          success: true,
          isNewUser: isNewUser,
          user: this.currentUser
        }
      } else {
        console.error('云函数返回业务错误:', cloudResult)
        const errorMsg = cloudResult.message || '云函数处理失败'
        
        // 不要在这里显示toast，让调用层处理
        return { 
          success: false, 
          error: { 
            code: cloudResult.code,
            message: errorMsg,
            from: 'cloud_function'
          } 
        }
      }
    } catch (error) {
      console.error('登录过程异常:', error)
      console.error('异常详细信息:')
      console.error('- errCode:', error.errCode)
      console.error('- errMsg:', error.errMsg)
      
      // 不要在这里显示toast，让调用层处理
      return { 
        success: false, 
        error: {
          errCode: error.errCode,
          errMsg: error.errMsg,
          from: 'exception'
        }
      }
    }
  }

  // 更新用户资料
  async updateProfile(profile) {
    try {
      const result = await wx.cloud.callFunction({
        name: 'user-auth',
        data: {
          action: 'updateProfile',
          profile: profile
        }
      })

      if (result.result.code === 0) {
        // 更新本地用户信息
        const currentUser = this.getCurrentUser()
        if (currentUser) {
          currentUser.profile = { ...currentUser.profile, ...profile }
          const existingInfo = wx.getStorageSync('userInfo') || {}
          wx.setStorageSync('userInfo', { 
            ...existingInfo,
            profile: currentUser.profile, 
            stats: currentUser.stats 
          })
          this.currentUser = currentUser
        }
        
        return { success: true }
      } else {
        wx.showToast({
          title: result.result.message || '更新失败',
          icon: 'none'
        })
        return { success: false }
      }
    } catch (error) {
      console.error('更新资料失败:', error)
      wx.showToast({
        title: '更新失败，请重试',
        icon: 'none'
      })
      return { success: false }
    }
  }

  // 退出登录
  logout() {
    wx.removeStorageSync('userId')
    wx.removeStorageSync('userInfo')
    wx.removeStorageSync('lastLoginTime')
    this.currentUser = null
    this.clearCache()
  }

  // 检查登录并处理
  requireLogin(options = {}) {
    const { title = '请先登录', showModal = true } = options
    
    if (this.isLoggedIn()) {
      return { isLoggedIn: true, user: this.getCurrentUser() }
    }

    if (showModal) {
      wx.showModal({
        title: title,
        content: '请先登录后再进行操作',
        confirmText: '去登录',
        cancelText: '取消',
        success: (res) => {
          if (res.confirm) {
            wx.navigateTo({
              url: '/pages/login/login'
            })
          }
        }
      })
    }

    return { isLoggedIn: false }
  }

  // 添加登录状态监听
  onLoginStatusChanged(callback) {
    this.loginCallbacks.push(callback)
    
    // 如果已经登录，立即调用回调
    if (this.isLoggedIn()) {
      callback(this.getCurrentUser())
    }
  }

  // 移除登录状态监听
  removeLoginCallback(callback) {
    const index = this.loginCallbacks.indexOf(callback)
    if (index > -1) {
      this.loginCallbacks.splice(index, 1)
    }
  }

  // 更新积分相关缓存（签到/广告后调用）
  updatePointsCache(fields) {
    const user = this.getCurrentUser()
    if (!user) return

    Object.assign(user, fields)
    this.currentUser = user

    const userInfo = wx.getStorageSync('userInfo') || {}
    Object.assign(userInfo, fields)
    wx.setStorageSync('userInfo', userInfo)
  }
}

// 创建全局实例
const authManager = new AuthManager()

module.exports = authManager