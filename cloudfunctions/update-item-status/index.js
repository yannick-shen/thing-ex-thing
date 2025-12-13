const cloud = require('wx-server-sdk');
cloud.init({ env: 'cloud1-3gsbomiw03ea5416' });
const db = cloud.database();

exports.main = async (event, context) => {
  try {
    const { itemId, status } = event || {};
    const wxContext = cloud.getWXContext();
    const tempId = wxContext.OPENID || 'temp_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    
    if (!itemId || !status) return { code: 400, message: 'missing params' };

    // 验证权限：只能操作自己的物品
    const item = await db.collection('items').doc(itemId).get();
    if (!item.data || item.data.authorId !== tempId) {
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