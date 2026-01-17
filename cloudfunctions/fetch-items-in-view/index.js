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
      mode: it.mode || 'sale',  // 添加交易类型，默认为出售
      price: it.price || 0,  // 添加价格
      images: it.images || []  // 添加图片数组
    }));

    // 批量处理图片临时链接
    const cloudImages = [];
    const imageItemMap = {};  // 记录每张图片属于哪个物品

    items.forEach((item, itemIndex) => {
      if (item.images && item.images.length > 0) {
        // 只处理第一张图片用于缩略图
        const firstImage = item.images[0];
        if (firstImage && firstImage.startsWith('cloud://')) {
          cloudImages.push(firstImage);
          imageItemMap[firstImage] = itemIndex;
        }
      }
    });

    if (cloudImages.length > 0) {
      try {
        const tempUrlResult = await cloud.getTempFileURL({
          fileList: cloudImages,
          maxAge: 7200  // 2小时
        });

        if (tempUrlResult.fileList && tempUrlResult.fileList.length > 0) {
          // 创建临时链接映射
          const urlMap = {};
          tempUrlResult.fileList.forEach(fileInfo => {
            if (fileInfo.tempFileURL) {
              urlMap[fileInfo.fileID] = fileInfo.tempFileURL;
            }
          });

          // 为每个物品的第一张图片添加临时链接
          items.forEach(item => {
            if (item.images && item.images.length > 0) {
              const firstImage = item.images[0];
              item.tempImage = urlMap[firstImage] || firstImage;
            }
          });
        }
      } catch (err) {
        console.warn('批量获取图片临时链接失败:', err);
        // 失败时使用原始图片URL
        items.forEach(item => {
          if (item.images && item.images.length > 0) {
            item.tempImage = item.images[0];
          }
        });
      }
    } else {
      // 没有云存储图片，直接使用第一张图片
      items.forEach(item => {
        if (item.images && item.images.length > 0) {
          item.tempImage = item.images[0];
        }
      });
    }

    return { code: 0, data: { items } };
  } catch (e) {
    console.error(e);
    return { code: 500, message: 'server error' };
  }
};