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

      // 直接使用云存储的 fileID，微信小程序会自动处理访问
      const items = itemsRes.data || [];

      return { code: 0, data: { items: items } };
    }
  } catch (e) {
    console.error(e);
    return { code: 500, message: 'server error' };
  }
};