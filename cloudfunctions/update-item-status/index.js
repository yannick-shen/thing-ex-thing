const cloud = require('wx-server-sdk');
cloud.init({ env: 'cloud1-3gsbomiw03ea5416' });
const db = cloud.database();

// ===== 功能开关 =====
const ENABLE_POINTS = false  // 积分系统：获得广告资格后改为 true

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

    // ============================================================
    //  积分系统：上架消耗（draft/off → on）
    // ============================================================
    const oldStatus = item.data.status
    let isFirstPublish = false

    if (status === 'on' && oldStatus !== 'on') {
      // 1. 统计用户当前已上架物品（排除本物品）
      const onCountRes = await db.collection('items')
        .where({ authorId: userId, status: 'on', _id: db.command.neq(itemId) })
        .count()
      const currentOnCount = onCountRes.total

      // 2. 是否首次上架
      isFirstPublish = (currentOnCount === 0)

      // 3. 判断计费类型：草稿发布 or 续期/重新上架
      const isExpired = item.data.expireAt && item.data.expireAt <= Date.now()
      const isRenew = (oldStatus === 'off' && !isExpired)

      const getPublishCost = (n) => {
        if (n <= 3) return 0
        if (n === 4) return 10
        if (n === 5) return 20
        if (n === 6) return 35
        return 65
      }

      const getRenewCost = (n) => {
        if (n <= 3) return 0
        if (n === 4) return 7
        if (n === 5) return 15
        if (n === 6) return 25
        return 45
      }

      const cost = isRenew ? getRenewCost(currentOnCount) : getPublishCost(currentOnCount)
      const consumeType = isRenew ? 'renew' : 'publish'

      // 4. 消耗积分（ENABLE_POINTS 为 false 时跳过）
      if (ENABLE_POINTS && cost > 0) {
        try {
          const consumeRes = await cloud.callFunction({
            name: 'points-service',
            data: {
              action: 'consume',
              params: { type: consumeType, amount: cost, relatedItemId: itemId }
            }
          })
          const cr = consumeRes.result
          if (cr.code !== 0) {
            return {
              code: 402,
              message: '积分不足',
              data: {
                cost,
                balance: cr.data ? cr.data.balance : 0,
                required: cost
              }
            }
          }
        } catch (e) {
          console.error('积分扣减失败:', e)
          return { code: 500, message: '积分系统异常，请稍后重试' }
        }
      }
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

    // 5. 新用户首次上架奖励（ENABLE_POINTS 为 false 时跳过）
    if (ENABLE_POINTS && isFirstPublish) {
      try {
        await cloud.callFunction({
          name: 'points-service',
          data: {
            action: 'earn',
            params: { type: 'new_user', amount: 50, relatedItemId: itemId }
          }
        })
        console.log('新用户奖励已发放: 50 积分, itemId:', itemId)
      } catch (e) {
        console.error('新用户奖励发放失败:', e)
      }
    }

    return { code: 0, data: { success: true } };
  } catch (e) {
    console.error(e);
    return { code: 500, message: 'server error' };
  }
};