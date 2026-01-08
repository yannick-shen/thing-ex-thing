const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event, context) => {
  const { requestId } = event;
  const wxContext = cloud.getWXContext();
  const sellerOpenid = wxContext.OPENID;

  try {
    // 获取联系申请
    const requestRes = await db.collection('contact_requests').doc(requestId).get();

    if (!requestRes.data) {
      return {
        code: -1,
        message: '联系申请不存在'
      };
    }

    const request = requestRes.data;

    // 验证是否为卖家的申请
    if (request.sellerOpenid !== sellerOpenid) {
      return {
        code: -1,
        message: '无权操作此申请'
      };
    }

    // 检查状态
    if (request.status !== 'pending') {
      return {
        code: -1,
        message: '该申请已被处理'
      };
    }

    // 获取卖家的联系方式（二维码）
    const sellerRes = await db.collection('users').doc(request.sellerId).get();
    const seller = sellerRes.data;
    const qrCode = seller.contactInfo && seller.contactInfo.qrCode;

    if (!qrCode) {
      return {
        code: -1,
        message: '请先设置联系方式（二维码）'
      };
    }

    // 更新申请状态
    await db.collection('contact_requests').doc(requestId).update({
      data: {
        status: 'accepted',
        acceptTime: Date.now()
      }
    });

    // 创建通知消息给买家
    await db.collection('messages').add({
      data: {
        type: 'contact_approved',
        buyerId: request.buyerId,
        buyerOpenid: request.buyerOpenid,
        sellerId: request.sellerId,
        sellerName: seller.profile && seller.profile.nickname || '卖家',
        sellerAvatar: seller.profile && seller.profile.avatarUrl || '/assets/images/default-avatar.png',
        itemId: request.itemId,
        itemTitle: request.itemTitle,
        requestId: requestId,
        read: false,
        createTime: Date.now()
      }
    });

    return {
      code: 0,
      message: '已同意联系申请',
      data: {
        requestId: requestId
      }
    };
  } catch (error) {
    return {
      code: -1,
      message: '操作失败: ' + error.message
    };
  }
};
