const cloud = require('wx-server-sdk');
cloud.init({ env: 'cloud1-3gsbomiw03ea5416' });
const db = cloud.database();
const _ = db.command;

exports.main = async (event, context) => {
  try {
    const wxContext = cloud.getWXContext();
    if (!wxContext.OPENID) return { code: 401, message: 'unauthenticated' };

    const { itemId } = event || {};

    // 获取用户ID
    let userId = null;
    try {
      const userResult = await db.collection('users').where({
        openid: wxContext.OPENID
      }).get();

      if (userResult.data.length > 0) {
        userId = userResult.data[0]._id;
      }
    } catch (e) {
      console.error('获取用户ID失败:', e);
    }

    if (!userId) {
      return { code: 401, message: '用户未登录' };
    }

    // 兼容逻辑：如果传入itemId，只判断是否收藏；否则返回收藏列表
    if (itemId) {
      const countResult = await db.collection('favorites')
        .where({ userId, itemId })
        .count();

      return {
        code: 0,
        data: { favorited: countResult.total > 0 }
      };
    } else {
      // 旧逻辑：返回收藏列表
      const favRes = await db.collection('favorites')
        .where({ userId: userId })
        .orderBy('createdAt', 'desc')
        .limit(100)
        .get();

      if (!favRes.data || favRes.data.length === 0) {
        return { code: 0, data: { items: [] } };
      }

      // 获取所有收藏的物品ID
      const itemIds = favRes.data.map(f => f.itemId);

      // 批量查询物品详情
      const itemsRes = await db.collection('items')
        .where({ _id: _.in(itemIds), status: 'on' })
        .get();

      // 为所有图片生成临时访问链接
      const items = itemsRes.data || [];
      const allImageIds = [];

      // 收集所有云存储图片ID
      items.forEach(item => {
        if (item.images && item.images.length > 0) {
          item.images.forEach(img => {
            if (img && img.startsWith('cloud://')) {
              allImageIds.push(img);
            }
          });
        }
      });

      // 批量获取临时链接
      let tempUrlMap = {};
      if (allImageIds.length > 0) {
        try {
          const result = await cloud.getTempFileURL({
            fileList: allImageIds
          });

          if (result.fileList) {
            result.fileList.forEach(file => {
              if (file.status === 0) {
                tempUrlMap[file.fileID] = file.tempFileURL;
              }
            });
          }
        } catch (e) {
          console.error('获取临时链接失败:', e);
        }
      }

      // 替换图片路径为临时链接
      items.forEach(item => {
        if (item.images && item.images.length > 0) {
          item.images = item.images.map(img => {
            if (img && img.startsWith('cloud://') && tempUrlMap[img]) {
              return tempUrlMap[img];
            }
            return img;
          });
        }
      });

      return { code: 0, data: { items: items } };
    }
  } catch (e) {
    console.error(e);
    return { code: 500, message: 'server error' };
  }
};