const cloud = require('wx-server-sdk');
cloud.init({ env: 'cloud1-3gsbomiw03ea5416' });
const db = cloud.database();
const _ = db.command;

exports.main = async (event, context) => {
  try {
    const wxContext = cloud.getWXContext();
    if (!wxContext.OPENID) return { code: 401, message: '用户未登录' };

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

    const { status = 'all' } = event || {};
    const where = { authorId: userId };
    if (status !== 'all') {
      where.status = status;
    }

    const res = await db.collection('items').where(where).orderBy('createdAt', 'desc').limit(100).get();
    const items = res.data || [];

    // 为每个物品获取评论数和收藏数
    const itemsWithCounters = await Promise.all(items.map(async (item) => {
      try {
        // 获取评论数
        const commentRes = await db.collection('comments').where({
          itemId: item._id
        }).count();
        const commentCount = commentRes.total;

        // 获取收藏数
        const favoriteRes = await db.collection('favorites').where({
          itemId: item._id
        }).count();
        const favoriteCount = favoriteRes.total;

        return {
          ...item,
          counters: {
            views: item.counters?.views || 0,
            favorites: favoriteCount,
            comments: commentCount
          }
        };
      } catch (e) {
        console.error('获取统计失败:', e);
        return {
          ...item,
          counters: {
            views: item.counters?.views || 0,
            favorites: 0,
            comments: 0
          }
        };
      }
    }));

    return { code: 0, data: { items: itemsWithCounters } };
  } catch (e) {
    console.error(e);
    return { code: 500, message: 'server error' };
  }
};
