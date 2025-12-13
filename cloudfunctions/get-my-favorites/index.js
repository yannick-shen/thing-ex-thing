const cloud = require('wx-server-sdk');
cloud.init({ env: 'cloud1-3gsbomiw03ea5416' });
const db = cloud.database();
const _ = db.command;

exports.main = async (event, context) => {
  try {
    const wxContext = cloud.getWXContext();
    if (!wxContext.OPENID) return { code: 401, message: 'unauthenticated' };

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

    // 获取收藏记录
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

    return { code: 0, data: { items: itemsRes.data || [] } };
  } catch (e) {
    console.error(e);
    return { code: 500, message: 'server error' };
  }
};