const cloud = require('wx-server-sdk');
cloud.init({ env: 'cloud1-3gsbomiw03ea5416' });
const db = cloud.database();

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
    return { code: 0, data: { items: res.data || [] } };
  } catch (e) {
    console.error(e);
    return { code: 500, message: 'server error' };
  }
};