// 每日签到云函数
const cloud = require('wx-server-sdk')

cloud.init({
  env: 'cloud1-3gsbomiw03ea5416'
})

const db = cloud.database()
const _ = db.command

// ===== 功能开关 =====
const ENABLE_POINTS = false  // 积分系统：获得广告资格后改为 true

// 连续签到奖励阶梯：第1~7天
const REWARDS = [1, 2, 3, 4, 5, 5, 5]

exports.main = async (event, context) => {
  const openid = cloud.getWXContext().OPENID
  const userColl = db.collection('users')

  // 1. 查用户签到状态
  const userRes = await userColl.where({ openid: openid }).limit(1).get()
  if (userRes.data.length === 0) {
    return { code: -1, message: '用户不存在，请先登录' }
  }

  const user = userRes.data[0]

  // 2. 获取今日日期
  const now = new Date()
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`

  // 3. 判断是否已签到
  if (user.lastSignDate === today) {
    return {
      code: -1,
      message: '今日已签到',
      data: {
        consecutiveDays: user.consecutiveDays || 0,
        todayReward: 0
      }
    }
  }

  // 4. 计算昨日日期
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000)
  const yesterdayStr = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`

  // 5. 判断连续签到
  let newConsecutiveDays
  if (user.lastSignDate === yesterdayStr) {
    // 连续签到
    newConsecutiveDays = (user.consecutiveDays || 0) + 1
    // 超过7天，保持在最大阶梯
    if (newConsecutiveDays > 7) {
      newConsecutiveDays = 7
    }
  } else {
    // 断签，重置
    newConsecutiveDays = 1
  }

  // 6. 查奖励
  const reward = REWARDS[newConsecutiveDays - 1]

  // 7. 调 points-service 入账（ENABLE_POINTS 为 false 时跳过）
  let balance = 0
  if (ENABLE_POINTS) {
    const earnResult = await cloud.callFunction({
      name: 'points-service',
      data: {
        action: 'earn',
        params: { type: 'sign_in', amount: reward }
      }
    })

    if (earnResult.result && earnResult.result.code !== 0) {
      return { code: -1, message: '积分入账失败: ' + (earnResult.result.message || '未知错误') }
    }
    balance = earnResult.result.data ? earnResult.result.data.balance : 0
  }

  // 8. 更新用户签到字段
  await userColl.doc(user._id).update({
    data: {
      lastSignDate: today,
      consecutiveDays: newConsecutiveDays,
      updateTime: Date.now()
    }
  })

  return {
    code: 0,
    message: '签到成功',
    data: {
      consecutiveDays: newConsecutiveDays,
      todayReward: reward,
      balance
    }
  }
}
