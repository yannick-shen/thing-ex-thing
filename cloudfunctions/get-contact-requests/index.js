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

    return {
      code: 0,
      message: '获取成功',
      data: {
        requests: requestsRes.data,
        total: countRes.total,
        hasMore: skip + requestsRes.data.length < countRes.total
      }
    };
  } catch (error) {
    return {
      code: -1,
      message: '获取失败: ' + error.message
    };
  }
};
