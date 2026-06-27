const cloud = require('wx-server-sdk');
cloud.init({ env: 'cloud1-3gsbomiw03ea5416' });
const db = cloud.database();
const https = require('https');

// ===== 通过 Nominatim 逆地理编码获取城市名 =====
function reverseGeocodeCity(lat, lng) {
  return new Promise((resolve, reject) => {
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&accept-language=zh`;
    https.get(url, { headers: { 'User-Agent': 'WxMiniprogram/1.0' } }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          const addr = json.address || {};
          // state_district：中文 OSM 中代表地级市（如"郑州市"），解决县级市（登封）→地级市（郑州）的映射
          const city = addr.city || addr.state_district || addr.county || addr.state || addr.town || '';
          if (city) {
            resolve(city.replace(/市$/, ''));
          } else {
            resolve('');
          }
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

exports.main = async (event, context) => {
  try {
    const {
      center, radiusKm = 2, keyword = '', mode = '',
      city = '',          // 直接按城市查询
      autoDetectCity = false // 根据 center 自动识别城市
    } = event || {};

    const _ = db.command;
    const now = Date.now();

    // ===== 城市模式：全城查询，按时间倒序 =====
    if (city || autoDetectCity) {
      let queryCity = city;
      if (autoDetectCity && center && center.latitude && center.longitude) {
        try {
          queryCity = await reverseGeocodeCity(center.latitude, center.longitude);
        } catch (e) {
          console.warn('逆地理编码失败，退回到半径查询:', e.message);
          // 失败时回退到地理半径查询
        }
      }
      if (!queryCity) {
        // 无法获取城市，回退到半径查询
        if (!center || typeof center.latitude !== 'number') {
          return { code: 400, message: '无法获取城市且无有效坐标' };
        }
        // 使用较大半径作为回退
        const lat = center.latitude, lng = center.longitude;
        const dLat = (radiusKm || 50) / 111;
        const dLng = (radiusKm || 50) / (111 * Math.cos(lat * Math.PI / 180));
        const where = {
          status: _.eq('on'),
          lat: _.gte(lat - dLat).and(_.lte(lat + dLat)),
          lng: _.gte(lng - dLng).and(_.lte(lng + dLng)),
          auditStatus: _.eq('pass'),
          expireAt: _.gte(now)
        };
        if (keyword) {
          const reg = db.RegExp({ regexp: keyword, options: 'i' });
          where._or = [{ title: reg }, { desc: reg }];
        }
        if (mode) where.mode = _.eq(mode);
        const res = await db.collection('items').where(where).limit(500).get();
        const items = (res.data || []).map(it => formatItem(it));
        return { code: 0, data: { items, city: '' } };
      }

      // 按城市查询，时间倒序
      const where = {
        status: _.eq('on'),
        city: db.RegExp({ regexp: queryCity, options: 'i' }),
        auditStatus: _.eq('pass'),
        expireAt: _.gte(now)
      };
      if (keyword) {
        const reg = db.RegExp({ regexp: keyword, options: 'i' });
        where._or = [{ title: reg }, { desc: reg }];
      }
      if (mode) where.mode = _.eq(mode);

      const res = await db.collection('items')
        .where(where)
        .orderBy('createdAt', 'desc')
        .limit(500)
        .get();

      const items = (res.data || []).map(it => formatItem(it));
      return { code: 0, data: { items, city: queryCity } };
    }

    // ===== 地理半径模式（原有逻辑）=====
    if (!center || typeof center.latitude !== 'number' || typeof center.longitude !== 'number') {
      return { code: 400, message: 'invalid center' };
    }
    const lat = center.latitude;
    const lng = center.longitude;
    const dLat = radiusKm / 111;
    const dLng = radiusKm / (111 * Math.cos(lat * Math.PI / 180));
    const minLat = lat - dLat, maxLat = lat + dLat;
    const minLng = lng - dLng, maxLng = lng + dLng;

    const where = {
      status: _.eq('on'),
      lat: _.gte(minLat).and(_.lte(maxLat)),
      lng: _.gte(minLng).and(_.lte(maxLng)),
      auditStatus: _.eq('pass'),
      expireAt: _.gte(now)
    };
    if (keyword) {
      const reg = db.RegExp({ regexp: keyword, options: 'i' });
      where._or = [{ title: reg }, { desc: reg }];
    }
    if (mode) where.mode = _.eq(mode);

    const res = await db.collection('items').where(where).limit(500).get();
    const items = (res.data || []).map(it => formatItem(it));

    return { code: 0, data: { items } };
  } catch (e) {
    console.error(e);
    return { code: 500, message: 'server error' };
  }
};

// ===== 格式化输出 =====
function formatItem(it) {
  return {
    id: it._id,
    lat: it.lat,
    lng: it.lng,
    title: it.title,
    desc: it.desc,
    mode: it.mode || 'sale',
    price: it.price || 0,
    images: it.images || [],
    city: it.city || '',
    addressText: it.addressText || '',
    createdAt: it.createdAt || 0,
    counters: it.counters || { views: 0, favorites: 0 },
    commentCount: it.commentCount || 0,
    authorId: it.authorId || '',
    tempImage: (it.images && it.images.length > 0) ? it.images[0] : ''
  };
}