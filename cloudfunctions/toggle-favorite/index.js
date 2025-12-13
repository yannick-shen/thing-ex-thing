const cloud = require('wx-server-sdk');
cloud.init({ env: 'cloud1-3gsbomiw03ea5416' });
const db = cloud.database();

exports.main = async (event, context) => {
  try {
    const { itemId } = event || {};
    const wxContext = cloud.getWXContext();
    if (!wxContext.OPENID) return { code: 401, message: 'unauthenticated' };
    if (!itemId) return { code: 400, message: 'missing itemId' };

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
    const _ = db.command;

    // 检查是否已收藏
    const existing = await db.collection('favorites').where({ userId, itemId }).limit(1).get();
    
    if (existing.data && existing.data.length > 0) {
      // 已收藏，则取消收藏（并行执行）
      await Promise.all([
        db.collection('favorites').doc(existing.data[0]._id).remove(),
        db.collection('items').doc(itemId).update({
          data: { 'counters.favorites': _.inc(-1), updatedAt: Date.now() }
        })
      ]);
      return { code: 0, data: { favorited: false } };
    } else {
      // 未收藏，则添加收藏（并行执行）
      await Promise.all([
        db.collection('favorites').add({
          data: { userId, itemId, createdAt: Date.now() }
        }),
        db.collection('items').doc(itemId).update({
          data: { 'counters.favorites': _.inc(1), updatedAt: Date.now() }
        })
      ]);
      return { code: 0, data: { favorited: true } };
    }
  } catch (e) {
    console.error(e);
    return { code: 500, message: 'server error' };
  }
};