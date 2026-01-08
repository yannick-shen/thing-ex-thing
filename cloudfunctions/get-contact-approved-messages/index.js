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

    // 获取被批准的联系消息（作为买家）
    const messagesRes = await db.collection('messages')
      .where({
        type: 'contact_approved',
        buyerId: userId
      })
      .orderBy('createTime', 'desc')
      .skip(skip)
      .limit(pageSize)
      .get();

    // 统计总数
    const countRes = await db.collection('messages')
      .where({
        type: 'contact_approved',
        buyerId: userId,
        read: false
      })
      .count();

    return {
      code: 0,
      message: '获取成功',
      data: {
        messages: messagesRes.data,
        total: messagesRes.data.length,
        unreadCount: countRes.total,
        hasMore: false
      }
    };
  } catch (error) {
    return {
      code: -1,
      message: '获取失败: ' + error.message
    };
  }
};
