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

    // 如果是下架到草稿箱，删除该物品的所有评论
    if (status === 'draft' && item.data.status === 'on') {
      const comments = await db.collection('comments')
        .where({ itemId })
        .limit(500)
        .get();
      
      if (comments.data && comments.data.length > 0) {
        // 批量删除评论
        const deletePromises = comments.data.map(c => 
          db.collection('comments').doc(c._id).remove()
        );
        await Promise.all(deletePromises);
        console.log(`Deleted ${comments.data.length} comments for item ${itemId}`);
      }
    }

    await db.collection('items').doc(itemId).update({ data: updateData });
    return { code: 0, data: { success: true } };
  } catch (e) {
    console.error(e);
    return { code: 500, message: 'server error' };
  }
};