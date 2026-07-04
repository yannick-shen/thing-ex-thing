const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const https = require('https')

// 腾讯地图 WebService API Key
const MAP_KEY = '677BZ-5PR3Z-XMJX3-T3E3K-MLYE2-RBBMT'

/**
 * 调用腾讯地图逆地理编码 API
 * 文档: https://lbs.qq.com/service/webService/webServiceGuide/webServiceGcoder
 * 
 * @param {number} lat 纬度 (GCJ-02)
 * @param {number} lng 经度 (GCJ-02)
 * @returns {{ city: string, address: string, district: string, province: string, nation: string }}
 */
function tencentReverseGeocode(lat, lng) {
  return new Promise((resolve, reject) => {
    const url = `https://apis.map.qq.com/ws/geocoder/v1/?location=${lat},${lng}&key=${MAP_KEY}&get_poi=0`
    https.get(url, (res) => {
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => {
        try {
          const json = JSON.parse(data)
          if (json.status === 0 && json.result) {
            const comp = json.result.address_component || {}
            const city = (comp.city || '').replace(/市$/, '')  // "北京市" → "北京"
            resolve({
              city: city || '',
              address: json.result.address || '',
              district: comp.district || '',
              province: (comp.province || '').replace(/省$/, ''),
              nation: comp.nation || ''
            })
          } else {
            console.warn('腾讯地图逆地理编码失败:', json)
            resolve({ city: '', address: '', district: '', province: '', nation: '' })
          }
        } catch (e) {
          console.error('解析逆地理编码响应失败:', e)
          resolve({ city: '', address: '', district: '', province: '', nation: '' })
        }
      })
    }).on('error', (e) => {
      console.error('腾讯地图逆地理编码请求失败:', e)
      resolve({ city: '', address: '', district: '', province: '', nation: '' })
    })
  })
}

/**
 * 云函数入口
 * 支持两种调用方式：
 * 1. { lat, lng } → 返回完整逆地理编码结果
 * 2. { lat, lng, fields: ['city'] } → 只返回指定字段
 */
exports.main = async (event, context) => {
  const { lat, lng, fields } = event || {}

  if (typeof lat !== 'number' || typeof lng !== 'number') {
    return { code: 400, message: '缺少有效的 lat/lng 参数' }
  }

  try {
    const result = await tencentReverseGeocode(lat, lng)

    // 如果指定了 fields，只返回需要的字段
    if (Array.isArray(fields) && fields.length > 0) {
      const filtered = {}
      fields.forEach(f => { if (result[f] !== undefined) filtered[f] = result[f] })
      return { code: 0, data: filtered }
    }

    return { code: 0, data: result }
  } catch (e) {
    console.error('reverse-geocode 异常:', e)
    return { code: 500, message: '逆地理编码失败', data: { city: '', address: '' } }
  }
}
