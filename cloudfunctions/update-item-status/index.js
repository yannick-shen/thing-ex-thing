const cloud = require('wx-server-sdk');
cloud.init({ env: 'cloud1-3gsbomiw03ea5416' });
const db = cloud.database();

exports.main = async (event, context) => {
  try {
    const { itemId, status } = event || {};
    const wxContext = cloud.getWXContext();
    const openid = wxContext.OPENID;

    if (!itemId || !status) return { code: 400, message: 'missing params' };
    if (!openid) return { code: 401, message: 'unauthorized' };

    // 验证权限：只能操作自己的物品
    const item = await db.collection('items').doc(itemId).get();
    if (!item.data) {
      return { code: 404, message: 'item not found' };
    }

    // 通过openid查询用户，获取用户的_id
    const userResult = await db.collection('users').where({ openid }).limit(1).get();
    if (!userResult.data || userResult.data.length === 0) {
      return { code: 403, message: 'user not found' };
    }

    const userId = userResult.data[0]._id;
    if (item.data.authorId !== userId) {
      return { code: 403, message: 'forbidden' };
    }

    const updateData = { updatedAt: Date.now(), status };

    if (status === 'deleted') {
      updateData.deletedAt = Date.now();
    }

    await db.collection('items').doc(itemId).update({ data: updateData });
    return { code: 0, data: { success: true } };
  } catch (e) {
    console.error(e);
    return { code: 500, message: 'server error' };
  }
};