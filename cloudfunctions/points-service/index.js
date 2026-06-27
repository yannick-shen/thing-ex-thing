// 积分核心云函数 — 包含 earn、consume、getBalance、getHistory
const cloud = require('wx-server-sdk')

cloud.init({
  env: 'cloud1-3gsbomiw03ea5416'
})

const db = cloud.database()
const _ = db.command

// 有效的积分变动类型
const VALID_TYPES = [
  'sign_in',        // 签到
  'ad_reward',      // 广告奖励
  'new_user',       // 新用户奖励
  'publish',        // 发布消耗
  'renew',          // 续期消耗
  'contact',        // 联系消耗
  'contact_refund'  // 联系退款
]

const EXPIRY_DAYS = 90 // 积分有效期 90 天
const MS_PER_DAY = 24 * 60 * 60 * 1000

/**
 * 获取当前用户 openid
 */
function getOpenid() {
  return cloud.getWXContext().OPENID
}

/**
 * 获取当前时间戳（毫秒）
 */
function now() {
  return Date.now()
}

/**
 * 获取今日日期字符串 '2026-05-31'
 */
function todayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// ============================================================
//  入账：增加积分
//  入参 { type, amount, relatedItemId? }
//  仅在服务端被其他云函数调用
// ============================================================
async function earn(openid, params) {
  const { type, amount, relatedItemId } = params

  if (!type || !amount || amount <= 0) {
    return { code: -1, message: '参数不合法' }
  }
  if (!VALID_TYPES.includes(type)) {
    return { code: -1, message: `未知的积分类型: ${type}` }
  }

  const ts = now()
  const expireAt = ts + EXPIRY_DAYS * MS_PER_DAY

  // 1. 写入收入流水
  const transData = {
    _openid: openid,
    type: type,
    amount: amount,           // > 0
    balance: 0,               // 先占位，下面补
    createTime: ts,
    expireAt: expireAt,
    remaining: amount         // FIFO 扣减用
  }
  if (relatedItemId) {
    transData.relatedItemId = relatedItemId
  }

  const transResult = await db.collection('points_transactions').add({ data: transData })

  // 2. 更新 / 创建积分账户
  const accColl = db.collection('points_accounts')
  const accRes = await accColl.where({ _openid: openid }).limit(1).get()

  if (accRes.data.length === 0) {
    // 首次入账，创建账户
    await accColl.add({
      data: {
        _openid: openid,
        balance: amount,
        totalEarned: amount,
        totalSpent: 0,
        createTime: ts,
        updateTime: ts
      }
    })
  } else {
    await accColl.doc(accRes.data[0]._id).update({
      data: {
        balance: _.inc(amount),
        totalEarned: _.inc(amount),
        updateTime: ts
      }
    })
  }

  // 3. 回填流水的 balance
  const finalAcc = (await accColl.where({ _openid: openid }).limit(1).get()).data[0]
  await db.collection('points_transactions').doc(transResult._id).update({
    data: { balance: finalAcc.balance }
  })

  return {
    code: 0,
    message: '积分入账成功',
    data: { transactionId: transResult._id, balance: finalAcc.balance }
  }
}

// ============================================================
//  消费：FIFO 扣减积分
//  入参 { type, amount, relatedItemId? }
// ============================================================
async function consume(openid, params) {
  const { type, amount, relatedItemId } = params

  if (!type || !amount || amount <= 0) {
    return { code: -1, message: '参数不合法' }
  }
  if (!VALID_TYPES.includes(type)) {
    return { code: -1, message: `未知的积分类型: ${type}` }
  }

  // 消费前先清理过期积分，确保 remaining 数据准确
  await cleanExpired(openid)

  return await _fifoConsume(openid, type, amount, relatedItemId)
}

/**
 * FIFO 扣减核心逻辑
 * 按 createTime 升序，从最早未用完的积分开始扣
 */
async function _fifoConsume(openid, type, amount, relatedItemId) {
  const ts = now()
  const accColl = db.collection('points_accounts')
  const txnColl = db.collection('points_transactions')

  // 1. 检查余额
  const accRes = await accColl.where({ _openid: openid }).limit(1).get()
  if (accRes.data.length === 0) {
    return { code: -1, message: '积分账户不存在' }
  }
  const account = accRes.data[0]
  if (account.balance < amount) {
    return { code: -1, message: '积分不足', data: { balance: account.balance, required: amount } }
  }

  // 2. 查所有有效收入记录（remaining > 0），按时间升序
  const incomeRes = await txnColl
    .where({
      _openid: openid,
      amount: _.gt(0),
      remaining: _.gt(0)
    })
    .orderBy('createTime', 'asc')
    .get()

  const records = incomeRes.data
  let leftToConsume = amount
  const updates = []

  for (const rec of records) {
    if (leftToConsume <= 0) break
    const deduct = Math.min(rec.remaining, leftToConsume)
    updates.push({
      id: rec._id,
      newRemaining: rec.remaining - deduct
    })
    leftToConsume -= deduct
  }

  if (leftToConsume > 0) {
    // 理论上不会到这里（余额已校验），但以防万一
    return { code: -1, message: '积分扣减异常：余额与流水不匹配' }
  }

  // 3. 批量更新 remaining
  for (const u of updates) {
    await txnColl.doc(u.id).update({
      data: { remaining: u.newRemaining }
    })
  }

  // 4. 写入消费流水
  const newBalance = account.balance - amount
  const expenseData = {
    _openid: openid,
    type: type,
    amount: -amount,
    balance: newBalance,
    createTime: ts,
    expireAt: 0,
    remaining: 0
  }
  if (relatedItemId) {
    expenseData.relatedItemId = relatedItemId
  }
  await txnColl.add({ data: expenseData })

  // 5. 更新账户余额
  await accColl.doc(account._id).update({
    data: {
      balance: _.inc(-amount),
      totalSpent: _.inc(amount),
      updateTime: ts
    }
  })

  return {
    code: 0,
    message: '积分扣减成功',
    data: { balance: newBalance }
  }
}

// ============================================================
//  清理过期积分（懒清理，查余额时触发）
//  将剩余 > 0 且 expireAt < 当前时间 的收入记录的 remaining 置 0，并扣减账户余额
// ============================================================
async function cleanExpired(openid) {
  const ts = now()
  const accColl = db.collection('points_accounts')
  const txnColl = db.collection('points_transactions')

  // 查找已过期的有效收入记录
  const expiredRes = await txnColl
    .where({
      _openid: openid,
      amount: _.gt(0),
      remaining: _.gt(0),
      expireAt: _.lt(ts)
    })
    .get()

  if (expiredRes.data.length === 0) return

  let totalExpired = 0
  for (const rec of expiredRes.data) {
    totalExpired += rec.remaining
    await txnColl.doc(rec._id).update({
      data: { remaining: 0 }
    })
  }

  // 扣减账户余额
  if (totalExpired > 0) {
    const accRes = await accColl.where({ _openid: openid }).limit(1).get()
    if (accRes.data.length > 0) {
      await accColl.doc(accRes.data[0]._id).update({
        data: {
          balance: _.inc(-totalExpired),
          updateTime: ts
        }
      })
    }
  }

  console.log(`清理过期积分: ${totalExpired}，共 ${expiredRes.data.length} 笔`)
}

// ============================================================
//  查询余额（含懒清理过期积分）
// ============================================================
async function getBalance(openid) {
  // 先清理过期积分
  await cleanExpired(openid)

  const res = await db.collection('points_accounts').where({ _openid: openid }).limit(1).get()

  if (res.data.length === 0) {
    return {
      code: 0,
      data: { balance: 0, totalEarned: 0, totalSpent: 0 }
    }
  }

  const acc = res.data[0]
  return {
    code: 0,
    data: {
      balance: Math.max(0, acc.balance || 0),
      totalEarned: acc.totalEarned || 0,
      totalSpent: acc.totalSpent || 0
    }
  }
}

// ============================================================
//  查询积分明细（分页）
//  入参 { page, pageSize }
// ============================================================
async function getHistory(openid, params) {
  const { page = 1, pageSize = 20 } = params || {}
  const skip = (page - 1) * pageSize

  const totalRes = await db.collection('points_transactions')
    .where({ _openid: openid })
    .count()

  const listRes = await db.collection('points_transactions')
    .where({ _openid: openid })
    .orderBy('createTime', 'desc')
    .skip(skip)
    .limit(pageSize)
    .get()

  const list = listRes.data.map(item => ({
    _id: item._id,
    type: item.type,
    amount: item.amount,
    balance: item.balance,
    createTime: item.createTime,
    relatedItemId: item.relatedItemId || ''
  }))

  return {
    code: 0,
    data: {
      list,
      total: totalRes.total,
      page,
      pageSize
    }
  }
}

// ============================================================
//  入口
// ============================================================
exports.main = async (event, context) => {
  const openid = getOpenid()
  const { action, params } = event

  console.log('points-service called:', { action, params, openid })

  switch (action) {
    case 'earn':
      return await earn(openid, params || {})
    case 'consume':
      return await consume(openid, params || {})
    case 'getBalance':
      return await getBalance(openid)
    case 'getHistory':
      return await getHistory(openid, params || {})
    default:
      return { code: -1, message: `未知操作: ${action}` }
  }
}
