// 云函数入口文件
const cloud = require('wx-server-sdk')

cloud.init({
  env: 'cloud1-3gsbomiw03ea5416'
})

const db = cloud.database()

// 简单的用户缓存（减少重复数据库查询）
const userCache = new Map()

// 处理登录的核心逻辑
async function processLogin(openid, appid) {
  try {
    console.log('✅ openid获取成功:', openid)
    console.log('✅ appid:', appid)
    
    // 检查用户是否已存在（优化查询性能）
    const userCollection = db.collection('users')
    console.log('🔍 查询用户数据库...')
    
    // 添加limit限制查询数量，提高性能
    const userResult = await userCollection.where({
      openid: openid
    }).limit(1).get()

    console.log('✅ 数据库查询成功，找到', userResult.data.length, '条记录')

    let user
    
    // 检查缓存
    if (userCache.has(openid)) {
      console.log('🚀 从缓存获取用户信息')
      user = userCache.get(openid)
      
      // 异步更新登录时间（不影响响应速度）
      userCollection.doc(user._id).update({
        data: {
          updateTime: db.serverDate()
        }
      }).catch(err => {
        console.error('更新登录时间失败:', err)
      })
    } else if (userResult.data.length === 0) {
      console.log('👤 创建新用户...')
      // 新用户，创建用户记录（自动激活）
      const newUser = {
        openid: openid,
        appid: appid,
        createTime: db.serverDate(),
        updateTime: db.serverDate(),
        profile: {
          nickname: '新用户',
          avatarUrl: '',
          phone: '',
          isPhoneBound: false
        },
        stats: {
          publishedCount: 0,
          favoritesCount: 0,
          soldCount: 0
        },
        status: 'active'
      }

      console.log('💾 添加用户到数据库...')
      const addResult = await userCollection.add({
        data: newUser
      })
      
      console.log('✅ 用户创建成功，ID:', addResult._id)
      
      user = {
        _id: addResult._id,
        ...newUser
      }
      
      // 添加到缓存
      userCache.set(openid, user)
    } else {
      console.log('🔄 用户已存在，更新登录时间...')
      // 已存在用户，更新最后登录时间
      user = userResult.data[0]
      
      await userCollection.doc(user._id).update({
        data: {
          updateTime: db.serverDate()
        }
      })
      console.log('✅ 登录时间更新成功')
      
      // 添加到缓存
      userCache.set(openid, user)
    }

    console.log('=== 登录处理完成 ===')
    const responseData = {
      userId: user._id,
      openid: user.openid,
      profile: user.profile,
      stats: user.stats,
      isNewUser: userResult.data.length === 0
    }
    console.log('返回数据:', responseData)
    
    return {
      code: 0,
      message: '登录成功',
      data: responseData
    }
      
  } catch (dbError) {
    console.error('❌ 数据库操作失败:', dbError)
    return {
      code: -1,
      message: '数据库操作失败: ' + dbError.message
    }
  }
}

// 云函数入口函数
exports.main = async (event, context) => {
  console.log('=== 云函数被调用 ===')
  console.log('event:', event)
  console.log('context:', context)
  
  const wxContext = cloud.getWXContext()
  console.log('=== 获取到的wxContext ===')
  console.log('wxContext:', wxContext)
  console.log('wxContext.OPENID:', wxContext.OPENID)
  console.log('wxContext.APPID:', wxContext.APPID)
  
  const { action } = event
  console.log('action:', action)

  switch (action) {
    case 'test':
      console.log('处理 test action')
      return {
        code: 0,
        message: '云函数测试成功',
        data: {
          wxContext: {
            OPENID: wxContext.OPENID || '未获取到OPENID',
            APPID: wxContext.APPID || '未获取到APPID',
            UNIONID: wxContext.UNIONID || '未获取到UNIONID',
            ENV: wxContext.ENV || '未获取到ENV'
          },
          timestamp: new Date().toISOString()
        }
      }
    case 'login':
      console.log('处理 login action，检查是否有传入的code')
      console.log('event.code:', event.code)
      
      // 先尝试获取wxContext
      const loginWxContext = cloud.getWXContext()
      console.log('登录获取的 wxContext:', loginWxContext)
      
      let { openid, appid } = loginWxContext
      
      // 如果没有openid，但传入了code，尝试重新获取wxContext
      if (!openid && event.code) {
        console.log('❌ 没有openid，但有code。等待几秒后重新获取wxContext...')
        
        // 等待一下，让云环境有时间初始化
        await new Promise(resolve => setTimeout(resolve, 1000))
        
        // 重新获取wxContext
        const retryWxContext = cloud.getWXContext()
        console.log('重新获取的 wxContext:', retryWxContext)
        
        openid = retryWxContext.OPENID
        appid = retryWxContext.APPID
      }
      
      if (!openid) {
        console.error('❌ 仍然无法获取openid')
        console.error('最后一次尝试的wxContext详情:')
        console.error('- OPENID:', loginWxContext.OPENID)
        console.error('- APPID:', loginWxContext.APPID)
        console.error('- ENV:', loginWxContext.ENV)
        
        return {
          code: -1,
          message: '获取用户身份失败 - 请检查小程序授权配置'
        }
      }
      
      console.log('✅ 获取到openid，继续登录流程')
      // 有openid，直接处理登录
      return await processLogin(openid, appid)
    case 'getUserInfo':
      return await getUserInfo(wxContext)
    case 'updateProfile':
      return await updateProfile(event, wxContext)
    default:
      console.log('未知 action:', action)
      return {
        code: -1,
        message: '未知操作'
      }
  }
}

// 获取用户信息
async function getUserInfo(wxContext) {
  try {
    const { openid } = wxContext
    
    const userResult = await db.collection('users').where({
      openid: openid
    }).get()

    if (userResult.data.length === 0) {
      return {
        code: -1,
        message: '用户不存在'
      }
    }

    const user = userResult.data[0]
    
    return {
      code: 0,
      message: '获取成功',
      data: {
        userId: user._id,
        profile: user.profile,
        stats: user.stats
      }
    }
  } catch (error) {
    console.error('获取用户信息失败:', error)
    return {
      code: -1,
      message: '获取用户信息失败'
    }
  }
}

// 更新用户资料
async function updateProfile(event, wxContext) {
  try {
    const { openid } = wxContext
    const { profile } = event

    const userResult = await db.collection('users').where({
      openid: openid
    }).get()

    if (userResult.data.length === 0) {
      return {
        code: -1,
        message: '用户不存在'
      }
    }

    const updateData = {
      'profile.nickname': profile.nickname,
      'profile.avatarUrl': profile.avatarUrl,
      updateTime: db.serverDate()
    }

    // 如果更新手机号
    if (profile.phone !== undefined) {
      updateData['profile.phone'] = profile.phone
      updateData['profile.isPhoneBound'] = !!profile.phone
    }

    await db.collection('users').doc(userResult.data[0]._id).update({
      data: updateData
    })

    return {
      code: 0,
      message: '更新成功'
    }
  } catch (error) {
    console.error('更新用户资料失败:', error)
    return {
      code: -1,
      message: '更新失败，请重试'
    }
  }
}