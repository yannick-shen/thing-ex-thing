const cloud = require('wx-server-sdk');
cloud.init({ env: 'cloud1-3gsbomiw03ea5416' });
const db = cloud.database();
const https = require('https');

// 通过 PConline IP 库获取城市名（不消耗腾讯地图配额）
function ipToCity(clientIp) {
  return new Promise((resolve) => {
    const url = `https://whois.pconline.com.cn/ipJson.jsp?ip=${encodeURIComponent(clientIp)}&json=true`;
    const req = https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          // PConline 返回 GBK 编码，但 Node https 默认按 UTF-8 解析
          // 需要转换：先按 latin1 取字节，再用 iconv-lite 解码
          const buf = Buffer.from(data, 'binary');
          const iconv = require('iconv-lite');
          const text = iconv.decode(buf, 'gbk');
          const json = JSON.parse(text);
          if (!json.err) {
            resolve(json.city || '');
          } else {
            resolve('');
          }
        } catch (e) {
          console.error('PConline 解析失败:', e);
          resolve('');
        }
      });
    });
    req.on('error', () => resolve(''));
    req.setTimeout(3000, () => { req.destroy(); resolve(''); });
  });
}

exports.main = async (event, context) => {
  try {
    const {
      center, radiusKm = 2, keyword = '', mode = '',
      city = '',          // 直接按城市名查询
      autoDetectCity = false // 列表模式：通过 PConline IP 库获取用户城市
    } = event || {};

    const _ = db.command;

    // 如果直接传了 city（非 autoDetect），按城市查询
    if (city && !autoDetectCity) {
      const where = {
        status: _.eq('on'),
        city: db.RegExp({ regexp: city, options: 'i' }),
        auditStatus: _.eq('pass'),
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
      return { code: 0, data: { items: (res.data || []).map(formatItem), city } };
    }

    // ===== 半径查询模式（默认，列表和地图通用）=====
    if (!center || typeof center.latitude !== 'number' || typeof center.longitude !== 'number') {
      return { code: 400, message: 'invalid center' };
    }
    const lat = center.latitude;
    const lng = center.longitude;
    const dLat = (radiusKm || 50) / 111;
    const dLng = (radiusKm || 50) / (111 * Math.cos(lat * Math.PI / 180));
    const minLat = lat - dLat, maxLat = lat + dLat;
    const minLng = lng - dLng, maxLng = lng + dLng;

    const where = {
      status: _.eq('on'),
      lat: _.gte(minLat).and(_.lte(maxLat)),
      lng: _.gte(minLng).and(_.lte(maxLng)),
      auditStatus: _.eq('pass'),
    };
    if (keyword) {
      const reg = db.RegExp({ regexp: keyword, options: 'i' });
      where._or = [{ title: reg }, { desc: reg }];
    }
    if (mode) where.mode = _.eq(mode);

    // 半径查询：只取必要字段 + 限制数量，加快查询速度
    const res = await db.collection('items')
      .where(where)
      .field({
        _id: true, lat: true, lng: true, title: true, desc: true,
        mode: true, price: true, images: true, city: true,
        addressText: true, createdAt: true, counters: true,
        commentCount: true, authorId: true
      })
      .orderBy('createdAt', 'desc')
      .limit(200)
      .get();
    const rawItems = res.data || [];
    const items = rawItems.map(formatItem);

    // 列表模式：通过 PConline IP 库获取用户城市（不消耗腾讯地图配额）
    let detectedCity = '';
    if (autoDetectCity) {
      const clientIp = cloud.getWXContext().CLIENTIP;
      if (clientIp) {
        detectedCity = await ipToCity(clientIp);
      }
    }
    return { code: 0, data: { items, city: detectedCity } };
  } catch (e) {
    console.error(e);
    return { code: 500, message: 'server error' };
  }
};

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
