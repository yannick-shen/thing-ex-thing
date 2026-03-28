const cloud = require('wx-server-sdk');
cloud.init({ env: 'cloud1-3gsbomiw03ea5416' });
const db = cloud.database();

exports.main = async (event, context) => {
  try {
    const { messageId } = event;
    const wxContext = cloud.getWXContext();
    const openid = wxContext.OPENID;

    if (!messageId) {
      return { code: 400, message: '缺少消息ID' };
    }

    if (!openid) {
      return { code: 401, message: '未授权' };
    }

    // 查询消息是否存在
    const message = await db.collection('messages').doc(messageId).get();
    
    if (!message.data) {
      return { code: 404, message: '消息不存在' };
    }

    // 验证权限：只能删除自己收到的消息
    if (message.data.toUserId !== openid) {
      return { code: 403, message: '无权删除此消息' };
    }

    // 删除消息
    await db.collection('messages').doc(messageId).remove();

    return { code: 0, message: '删除成功' };
  } catch (e) {
    console.error(e);
    return { code: 500, message: '服务器错误' };
  }
};
