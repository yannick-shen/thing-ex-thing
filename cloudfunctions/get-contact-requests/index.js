const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event, context) => {
  const { page, pageSize } = event;
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;

  try {
    // 获取用户信息
    const userRes = await db.collection('users').where({
      openid: openid
    }).get();

    if (userRes.data.length === 0) {
      return {
        code: -1,
        message: '用户不存在'
      };
    }

    const userId = userRes.data[0]._id;

    // 计算跳过的数量
    const skip = (page - 1) * pageSize;

    // 获取收到的联系申请（作为卖家）
    const requestsRes = await db.collection('contact_requests')
      .where({
        sellerId: userId
      })
      .orderBy('createTime', 'desc')
      .skip(skip)
      .limit(pageSize)
      .get();

    // 统计总数
    const countRes = await db.collection('contact_requests')
      .where({
        sellerId: userId
      })
      .count();

    const requests = requestsRes.data;

    // 实时从users表获取买家最新头像（与get-comment-messages逻辑一致）
    const buyerIds = [...new Set(requests.map(req => req.buyerId))];
    let buyersMap = {};

    if (buyerIds.length > 0) {
      try {
        const batchSize = 20;
        for (let i = 0; i < buyerIds.length; i += batchSize) {
          const batch = buyerIds.slice(i, i + batchSize);
          const buyersRes = await db.collection('users')
            .where({
              _id: db.command.in(batch)
            })
            .field({
              'profile.avatarUrl': true
            })
            .get();

          if (buyersRes.data && buyersRes.data.length > 0) {
            buyersRes.data.forEach(user => {
              buyersMap[user._id] = user.profile && user.profile.avatarUrl || '';
            });
          }
        }
      } catch (error) {
        console.error('批量查询买家信息失败:', error);
      }
    }

    // 用最新头像替换存储的旧头像（直接使用cloud://路径）
    requests.forEach(req => {
      const freshAvatar = buyersMap[req.buyerId];
      if (freshAvatar) {
        req.buyerAvatar = freshAvatar;
      }
    });

    return {
      code: 0,
      message: '获取成功',
      data: {
        requests: requests,
        total: countRes.total,
        hasMore: skip + requests.length < countRes.total
      }
    };
  } catch (error) {
    return {
      code: -1,
      message: '获取失败: ' + error.message
    };
  }
};
