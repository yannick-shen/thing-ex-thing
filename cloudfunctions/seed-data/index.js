const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

// ── 逆地理编码获取城市名（带缓存） ──
const cityCache = new Map()
async function reverseGeocodeCity(lat, lng) {
  const key = `${lat.toFixed(2)},${lng.toFixed(2)}`
  if (cityCache.has(key)) return cityCache.get(key)

  try {
    const res = await cloud.callFunction({
      name: 'reverse-geocode',
      data: { lat, lng, fields: ['city'] }
    })
    const city = (res.result && res.result.code === 0) ? (res.result.data.city || '') : ''
    cityCache.set(key, city)
    return city
  } catch (e) {
    console.error('逆地理编码失败:', e)
    return ''
  }
}

// ── 工具：生成唯一 demo openid ──
function makeOpenid(nickname) {
  return 'demo_' + Buffer.from(nickname.trim()).toString('base64').slice(0, 20)
}

// ── 工具：获取或创建 demo 用户 ──
async function ensureUser(nickname, avatarUrl) {
  const openid = makeOpenid(nickname)
  const exist = await db.collection('users').where({ openid }).get()
  if (exist.data.length > 0) return exist.data[0]
  
  const newUser = {
    openid,
    nickName: nickname,
    avatarUrl: avatarUrl || '',
    points: 0,
    newUserBonusClaimed: false,
    createTime: db.serverDate(),
    updateTime: db.serverDate()
  }
  const res = await db.collection('users').add({ data: newUser })
  return { _id: res._id, ...newUser }
}

// ── 主函数 ──
exports.main = async (event, context) => {
  const { items = [], dryRun = false } = event
  
  if (!Array.isArray(items) || items.length === 0) {
    return { code: 400, message: '请提供 items 数组。参照 seed-data-template.json 填写数据后传入。' }
  }
  
  const now = Date.now()
  const expiryDays = 30
  const expireAt = now + expiryDays * 24 * 60 * 60 * 1000
  
  const userCache = new Map()
  const results = []
  let inserted = 0
  let skipped = 0
  
  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    
    // ── 必填校验 ──
    if (!item.title || !item.desc) {
      results.push({ index: i, status: 'skipped', reason: '缺少 title 或 desc' })
      skipped++
      continue
    }
    if (typeof item.lat !== 'number' || typeof item.lng !== 'number') {
      results.push({ index: i, status: 'skipped', reason: '缺少 lat 或 lng（需为数字）' })
      skipped++
      continue
    }
    
    // ── dryRun 模式 ──
    if (dryRun) {
      results.push({
        index: i, status: 'dry_run', title: item.title,
        author: item.authorName || '闲置达人',
        mode: item.mode, price: item.price,
        addressText: item.addressText,
        imageCount: (item.images || []).length
      })
      continue
    }
    
    // ── 获取/创建作者 ──
    const nickname = item.authorName || '闲置达人'
    let authorId

    if (item.authorId) {
      // 直接使用指定的 authorId（不做校验，调用者自行保证正确）
      authorId = item.authorId
    } else {
      if (userCache.has(nickname)) {
        authorId = userCache.get(nickname)
      } else {
        try {
          const author = await ensureUser(nickname, item.authorAvatar || '')
          userCache.set(nickname, author._id)
          authorId = author._id
        } catch (e) {
          results.push({ index: i, status: 'error', reason: `创建用户失败: ${e.message}` })
          continue
        }
      }
    }
    
    // ── 构建物品文档 ──
    const mode = ['sale', 'exchange', 'donate', 'help'].includes(item.mode) ? item.mode : 'sale'
    const price = mode === 'sale' ? Number(item.price || 0) : null
    
    const doc = {
      title: item.title.trim(),
      desc: item.desc.trim(),
      mode,
      price,
      tradeMethod: item.tradeMethod || 'self',
      lat: item.lat,
      lng: item.lng,
      exactLocation: { lat: item.lat, lng: item.lng },
      addressText: item.addressText || '',
      city: item.city || '',  // 可手动指定，也可自动逆地理编码获取
      images: Array.isArray(item.images) ? item.images : [],
      authorId,
      status: 'on',
      auditStatus: 'pass',
      counters: { views: Math.floor(Math.random() * 200) + 10, favorites: Math.floor(Math.random() * 15), comments: 0 },
      createdAt: now - Math.floor(Math.random() * 7 * 24 * 60 * 60 * 1000),
      updatedAt: now,
      expireAt
    }

    // 如果没有手动指定 city，通过腾讯地图逆地理编码获取
    if (!doc.city) {
      doc.city = await reverseGeocodeCity(item.lat, item.lng)
    }
    
    // ── 插入数据库 ──
    try {
      const res = await db.collection('items').add({ data: doc })
      results.push({
        index: i, status: 'ok', id: res._id,
        title: doc.title, author: nickname,
        imageCount: doc.images.length
      })
      inserted++
    } catch (e) {
      results.push({ index: i, status: 'error', title: doc.title, reason: e.message })
    }
  }
  
  return {
    code: 0,
    dryRun,
    total: items.length,
    inserted,
    skipped,
    errors: items.length - inserted - skipped,
    results
  }
}
