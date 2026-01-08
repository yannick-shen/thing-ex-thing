const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event, context) => {
  const { avatarUrl, nickname } = event;
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

    const userId = userRes.data[0]._id;
    const updateData = {};

    if (avatarUrl) {
      updateData['profile.avatarUrl'] = avatarUrl;
    }

    if (nickname) {
      updateData['profile.nickname'] = nickname;
    }

    await db.collection('users').doc(userId).update({
      data: updateData
    });

    const updatedUserRes = await db.collection('users').doc(userId).get();
    const updatedUser = updatedUserRes.data;

    return {
      code: 0,
      message: '更新成功',
      data: {
        user: updatedUser
      }
    };
  } catch (error) {
    return {
      code: -1,
      message: '更新失败: ' + error.message
    };
  }
};



