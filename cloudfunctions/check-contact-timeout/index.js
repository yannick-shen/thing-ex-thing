// 检查 48 小时未处理的联系申请，退还积分
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

// ===== 功能开关 =====
const ENABLE_POINTS = false  // 积分系统：获得广告资格后改为 true

// 48 小时 = 2 天
const TIMEOUT_MS = 48 * 60 * 60 * 1000

exports.main = async (event, context) => {
  try {
    const cutoffTime = Date.now() - TIMEOUT_MS

    // 查询超过 48 小时且未处理的 pending 申请（pointsCost > 0 表示扣了积分）
    const pendingRes = await db.collection('contact_requests')
      .where({
        status: 'pending',
        createTime: db.command.lt(cutoffTime),
        pointsCost: db.command.gt(0)
      })
      .limit(50)
      .get()

    if (pendingRes.data.length === 0) {
      return { code: 0, message: '无超时申请', data: { refunded: 0 } }
    }

    let refunded = 0
    const updates = []

    for (const req of pendingRes.data) {
      try {
        // 退还积分（ENABLE_POINTS 为 false 时跳过）
        if (ENABLE_POINTS) {
          await cloud.callFunction({
            name: 'points-service',
            data: {
              action: 'earn',
              params: {
                type: 'contact_refund',
                amount: req.pointsCost,
                relatedItemId: req.itemId
              }
            }
          })
        }

        // 标记为 timeout 状态
        updates.push({
          id: req._id,
          pointsCost: req.pointsCost
        })

        refunded++
        console.log(`超时退款: ${req.pointsCost} 积分, requestId: ${req._id}`)
      } catch (e) {
        console.error(`退款失败 requestId:${req._id}:`, e)
      }
    }

    // 批量更新状态
    for (const u of updates) {
      await db.collection('contact_requests').doc(u.id).update({
        data: {
          status: 'timeout',
          timeoutTime: Date.now()
        }
      })
    }

    return {
      code: 0,
      message: `已处理 ${refunded} 笔超时申请`,
      data: { refunded }
    }
  } catch (error) {
    return { code: -1, message: '检查超时失败: ' + error.message }
  }
}
