const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event, context) => {
  const { requestId } = event;
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;

  try {
    const requestRes = await db.collection('contact_requests').doc(requestId).get();

    if (!requestRes.data) {
      return {
        code: -1,
        message: '联系申请不存在'
      };
    }

    const request = requestRes.data;

    // 验证权限（买家或卖家可以查看）
    if (request.buyerOpenid !== openid && request.sellerOpenid !== openid) {
      return {
        code: -1,
        message: '无权查看此申请'
      };
    }

    // 获取卖家的联系方式（仅已同意的申请返回）
    let sellerQrCode = null;
    let sellerName = null;
    if (request.status === 'accepted') {
      const sellerRes = await db.collection('users').doc(request.sellerId).get();
      const seller = sellerRes.data;
      const qrCodeFileID = seller.contactInfo && seller.contactInfo.qrCode;

      // 获取卖家昵称
      sellerName = seller.profile && seller.profile.nickname || '对方';

      // 直接使用cloud://路径
      if (qrCodeFileID) {
        sellerQrCode = qrCodeFileID;
      }
    }

    return {
      code: 0,
      message: '获取成功',
      data: {
        request: request,
        sellerQrCode: sellerQrCode,
        sellerName: sellerName
      }
    };
  } catch (error) {
    return {
      code: -1,
      message: '获取失败: ' + error.message
    };
  }
};
