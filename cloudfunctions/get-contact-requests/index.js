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

    // 转换头像链接为临时链接
    const requests = await Promise.all(requestsRes.data.map(async (req) => {
      const processedReq = { ...req };
      if (processedReq.buyerAvatar && processedReq.buyerAvatar.startsWith('cloud://')) {
        try {
          const tempUrlResult = await cloud.getTempFileURL({
            fileList: [processedReq.buyerAvatar],
            maxAge: 7200  // 设置临时链接有效期为2小时（7200秒）
          });
          if (tempUrlResult.fileList && tempUrlResult.fileList.length > 0) {
            processedReq.buyerAvatar = tempUrlResult.fileList[0].tempFileURL;
          }
        } catch (err) {
          console.warn('获取临时链接失败:', processedReq.buyerAvatar, err);
        }
      }
      return processedReq;
    }));

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
