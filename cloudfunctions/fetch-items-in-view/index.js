const cloud = require('wx-server-sdk');
cloud.init({ env: 'cloud1-3gsbomiw03ea5416' });
const db = cloud.database();

exports.main = async (event, context) => {
  try {
    const { center, radiusKm = 2, keyword = '', mode = '' } = event || {};
    if (!center || typeof center.latitude !== 'number' || typeof center.longitude !== 'number') {
      return { code: 400, message: 'invalid center' };
    }
    const lat = center.latitude;
    const lng = center.longitude;
    const dLat = radiusKm / 111; // approx degrees
    const dLng = radiusKm / (111 * Math.cos(lat * Math.PI / 180));
    const minLat = lat - dLat, maxLat = lat + dLat;
    const minLng = lng - dLng, maxLng = lng + dLng;

    const _ = db.command;
    const where = {
      status: _.eq('on'),
      lat: _.gte(minLat).and(_.lte(maxLat)),
      lng: _.gte(minLng).and(_.lte(maxLng)),
      auditStatus: _.eq('pass'),
      expireAt: _.gte(Date.now())
    };
    if (keyword) {
      const reg = db.RegExp({ regexp: keyword, options: 'i' });
      where._or = [{ title: reg }, { desc: reg }];
    }
    if (mode) {
      where.mode = _.eq(mode);
    }

    const res = await db.collection('items').where(where).limit(500).get();
    const items = (res.data || []).map(it => ({
      id: it._id,
      lat: it.lat,
      lng: it.lng,
      title: it.title,
      desc: it.desc,
      mode: it.mode || 'sale',
      price: it.price || 0,
      images: it.images || [],
      // 直接使用云存储的 fileID，微信小程序会自动处理访问
      tempImage: (it.images && it.images.length > 0) ? it.images[0] : ''
    }));

    return { code: 0, data: { items } };
  } catch (e) {
    console.error(e);
    return { code: 500, message: 'server error' };
  }
};