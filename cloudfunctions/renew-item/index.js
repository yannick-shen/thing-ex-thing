// 续期物品云函数
// 职责：独立于 update-item-status，专注于物品续期逻辑
// 入参：{ itemId }
// 出参：{ oldExpireAt, newExpireAt, cost }

const cloud = require('wx-server-sdk')
cloud.init({ env: 'cloud1-3gsbomiw03ea5416' })
const db = cloud.database()

// ===== 功能开关 =====
const ENABLE_POINTS = false  // 积分系统：获得广告资格后改为 true

function getRenewCost(n) {
  if (n <= 3) return 0
  if (n === 4) return 7
  if (n === 5) return 15
  if (n === 6) return 25
  return 45
}

exports.main = async (event) => {
  const { itemId } = event || {}
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  if (!itemId || !openid) {
    return { code: 400, message: '参数缺失' }
  }

  try {
    // 1. 验证物品存在及所有权
    const itemRes = await db.collection('items').doc(itemId).get()
    if (!itemRes.data) {
      return { code: 404, message: '物品不存在' }
    }
    const item = itemRes.data

    // 获取用户
    const userRes = await db.collection('users').where({ openid }).limit(1).get()
    if (userRes.data.length === 0) {
      return { code: 403, message: '用户不存在' }
    }
    const user = userRes.data[0]

    if (item.authorId !== user._id) {
      return { code: 403, message: '无权操作此物品' }
    }

    // 2. 已过期物品不可续期，必须走新发布流程
    const now = Date.now()
    if (item.expireAt && item.expireAt <= now) {
      return { code: 400, message: '物品已过期，请重新发布' }
    }

    // 3. 统计用户当前上架物品数量（排除本物品）
    const onCountRes = await db.collection('items')
      .where({ authorId: user._id, status: 'on', _id: db.command.neq(itemId) })
      .count()
    const currentOnCount = onCountRes.total

    // 4. 确定续期费用
    const cost = getRenewCost(currentOnCount)

    // 5. 消耗积分（ENABLE_POINTS 为 false 时跳过）
    if (ENABLE_POINTS && cost > 0) {
      try {
        const consumeRes = await cloud.callFunction({
          name: 'points-service',
          data: {
            action: 'consume',
            params: { type: 'renew', amount: cost, relatedItemId: itemId }
          }
        })
        const cr = consumeRes.result
        if (cr.code !== 0) {
          return {
            code: 402,
            message: '积分不足',
            data: {
              cost,
              balance: cr.data ? cr.data.balance : 0,
              required: cost
            }
          }
        }
      } catch (e) {
        console.error('续期积分扣减失败:', e)
        return { code: 500, message: '积分系统异常，请稍后重试' }
      }
    }

    // 6. 续期：expireAt 向后递延 30 天
    const oldExpireAt = item.expireAt
    const newExpireAt = oldExpireAt + 30 * 24 * 60 * 60 * 1000

    await db.collection('items').doc(itemId).update({
      data: {
        expireAt: newExpireAt,
        updatedAt: now
      }
    })

    console.log('续期成功:', itemId, 'old:', oldExpireAt, 'new:', newExpireAt, 'cost:', cost)

    return {
      code: 0,
      message: '续期成功',
      data: {
        oldExpireAt,
        newExpireAt,
        cost
      }
    }

  } catch (e) {
    console.error('renew-item error:', e)
    return { code: 500, message: '服务异常，请重试' }
  }
}
