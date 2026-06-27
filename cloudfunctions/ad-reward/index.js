// 激励视频广告奖励云函数
// 职责：防刷校验 + 阶梯奖励计算 + 调用 points-service 入账
const cloud = require('wx-server-sdk')

cloud.init({ env: 'cloud1-3gsbomiw03ea5416' })
const db = cloud.database()

// ===== 功能开关 =====
const ENABLE_POINTS = false  // 积分系统：获得广告资格后改为 true

// 阶梯奖励规则：按今日已看次数（0-based）判定
// todayAdCount=0~4 → 第1~5次=5积分  |  todayAdCount=5~9 → 第6~10次=4  |  todayAdCount=10~19 → 第11~20次=3
const REWARD_TIERS = [
  { max: 4,  reward: 5 },
  { max: 9,  reward: 4 },
  { max: 19, reward: 3 }
]
const DAILY_LIMIT = 20
const MIN_INTERVAL_MS = 30 * 1000  // 最小间隔30秒防刷

function getTodayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function getReward(count) {
  for (const tier of REWARD_TIERS) {
    if (count <= tier.max) return tier.reward
  }
  return 3 // 兜底
}

exports.main = async (event) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  if (!openid) {
    return { code: -1, message: '获取用户身份失败' }
  }

  const { mock } = event  // 开发模式：跳过防刷审核
  const today = getTodayStr()
  const now = Date.now()

  try {
    // 1. 查询用户
    const userRes = await db.collection('users').where({ openid }).limit(1).get()
    if (userRes.data.length === 0) {
      return { code: -1, message: '用户不存在' }
    }

    const user = userRes.data[0]

    // 2. 跨天重置
    let todayAdCount = user.todayAdCount || 0
    let lastAdWatchTime = user.lastAdWatchTime || 0

    if ((user.adCountDate || '') !== today) {
      todayAdCount = 0
      lastAdWatchTime = 0
    }

    // 3. 每日上限检查
    if (todayAdCount >= DAILY_LIMIT) {
      return { code: -1, message: '今日观看次数已达上限（20次）' }
    }

    // 4. 防刷：30秒间隔校验（mock 模式跳过）
    if (!mock && lastAdWatchTime > 0) {
      const elapsed = now - lastAdWatchTime
      if (elapsed < MIN_INTERVAL_MS) {
        return { code: -1, message: '操作过于频繁，请稍后再试' }
      }
    }

    // 5. 计算奖励
    const reward = getReward(todayAdCount)

    // 6. 调用 points-service 入账（ENABLE_POINTS 为 false 时跳过）
    if (ENABLE_POINTS) {
      const earnResult = await cloud.callFunction({
        name: 'points-service',
        data: {
          action: 'earn',
          type: 'ad_reward',
          amount: reward,
          remark: `广告奖励 第${todayAdCount + 1}次`
        }
      })

      if (!earnResult.result || earnResult.result.code !== 0) {
        return {
          code: -1,
          message: earnResult.result?.message || '积分入账失败'
        }
      }
    }

    // 7. 更新用户广告计数
    const newCount = todayAdCount + 1
    await db.collection('users').doc(user._id).update({
      data: {
        todayAdCount: newCount,
        adCountDate: today,
        lastAdWatchTime: now,
        updateTime: db.serverDate()
      }
    })

    return {
      code: 0,
      message: '领取成功',
      data: {
        todayAdCount: newCount,
        remaining: DAILY_LIMIT - newCount,
        reward: reward
      }
    }

  } catch (e) {
    console.error('ad-reward error:', e)
    return { code: -1, message: '服务异常，请重试' }
  }
}
