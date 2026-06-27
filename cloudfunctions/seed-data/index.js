const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command
const https = require('https')

// ── 逆地理编码获取城市名（带缓存） ──
const cityCache = new Map()
function reverseGeocodeCity(lat, lng) {
  // 粗粒度缓存 key：同一经纬度附近共享结果
  const key = `${lat.toFixed(2)},${lng.toFixed(2)}`
  if (cityCache.has(key)) return Promise.resolve(cityCache.get(key))

  return new Promise((resolve) => {
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&accept-language=zh`
    https.get(url, { headers: { 'User-Agent': 'WxMiniprogram/1.0' } }, (res) => {
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => {
        try {
          const json = JSON.parse(data)
          const addr = json.address || {}
          // state_district：中文 OSM 中代表地级市，解决县级市→地级市映射
          const city = (addr.city || addr.state_district || addr.county || addr.state || addr.town || '').replace(/市$/, '')
          cityCache.set(key, city)
          resolve(city)
        } catch (e) {
          resolve('')
        }
      })
    }).on('error', () => resolve(''))
  })
}

// ── 简单延迟 ──
function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

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
    let author
    if (userCache.has(nickname)) {
      author = userCache.get(nickname)
    } else {
      try {
        author = await ensureUser(nickname, item.authorAvatar || '')
        userCache.set(nickname, author)
      } catch (e) {
        results.push({ index: i, status: 'error', reason: `创建用户失败: ${e.message}` })
        continue
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
      authorId: author._id,
      status: 'on',
      auditStatus: 'pass',
      counters: { views: Math.floor(Math.random() * 200) + 10, favorites: Math.floor(Math.random() * 15), comments: 0 },
      createdAt: now - Math.floor(Math.random() * 7 * 24 * 60 * 60 * 1000),
      updatedAt: now,
      expireAt
    }

    // 如果没有手动指定 city，通过逆地理编码自动获取
    if (!doc.city) {
      await sleep(1000)  // Nominatim 限速约 1 req/s
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
