const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event, context) => {
  const { page, pageSize, markAsRead: messageIdToMark } = event;
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;

  try {
    // 如果提供了 messageIdToMark，先标记为已读
    if (messageIdToMark) {
      await db.collection('messages').doc(messageIdToMark).update({
        data: {
          read: true,
          updateTime: Date.now()
        }
      });
    }

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

    // 转换头像链接为临时链接
    const messages = await Promise.all(messagesRes.data.map(async (msg) => {
      const processedMsg = { ...msg };
      if (processedMsg.sellerAvatar && processedMsg.sellerAvatar.startsWith('cloud://')) {
        try {
          const tempUrlResult = await cloud.getTempFileURL({
            fileList: [processedMsg.sellerAvatar],
            maxAge: 7200  // 设置临时链接有效期为2小时（7200秒）
          });
          if (tempUrlResult.fileList && tempUrlResult.fileList.length > 0) {
            processedMsg.sellerAvatar = tempUrlResult.fileList[0].tempFileURL;
          }
        } catch (err) {
          console.warn('获取临时链接失败:', processedMsg.sellerAvatar, err);
        }
      }
      return processedMsg;
    }));

    return {
      code: 0,
      message: '获取成功',
      data: {
        messages: messages,
        total: messages.length,
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
