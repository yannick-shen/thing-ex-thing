const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;

  try {
    const userRes = await db.collection('users').where({
      openid: openid
    }).get();

    if (userRes.data.length === 0) {
      return {
        code: -1,
        message: '用户不存在'
      };
    }

    return {
      code: 0,
      message: '获取成功',
      data: {
        user: userRes.data[0]
      }
    };
  } catch (error) {
    return {
      code: -1,
      message: '获取失败: ' + error.message
    };
  }
};
