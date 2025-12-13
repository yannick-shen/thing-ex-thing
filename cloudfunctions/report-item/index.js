const cloud = require('wx-server-sdk');
cloud.init({ env: 'cloud1-3gsbomiw03ea5416' });
const db = cloud.database();

exports.main = async (event, context) => {
  try {
    const { itemId, reason, detail = '' } = event || {};
    const wxContext = cloud.getWXContext();
    if (!wxContext.OPENID) return { code: 401, message: 'unauthenticated' };
    if (!itemId || !reason) return { code: 400, message: 'missing params' };

    // 检查是否已举报过
    const existing = await db.collection('reports')
      .where({ userId: wxContext.OPENID, itemId })
      .get();
    
    if (existing.data && existing.data.length > 0) {
      return { code: 400, message: '您已举报过该物品' };
    }

    // 添加举报记录
    const now = Date.now();
    await db.collection('reports').add({
      data: {
        userId: wxContext.OPENID,
        itemId,
        reason,
        detail,
        status: 'pending',
        createdAt: now
      }
    });

    return { code: 0, message: '举报成功，我们会尽快处理' };
  } catch (e) {
    console.error(e);
    return { code: 500, message: 'server error' };
  }
};