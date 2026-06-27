const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

// ===== 功能开关 =====
const ENABLE_POINTS = false  // 积分系统：获得广告资格后改为 true

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

    // 更新申请状态为拒绝
    await db.collection('contact_requests').doc(requestId).update({
      data: {
        status: 'rejected',
        rejectTime: Date.now()
      }
    });

    // ============================================================
    //  积分退款：卖家拒绝 → 退还联系消耗的积分（ENABLE_POINTS 为 false 时跳过）
    // ============================================================
    if (ENABLE_POINTS && request.pointsCost && request.pointsCost > 0) {
      try {
        await cloud.callFunction({
          name: 'points-service',
          data: {
            action: 'earn',
            params: {
              type: 'contact_refund',
              amount: request.pointsCost,
              relatedItemId: request.itemId
            }
          }
        })
        console.log('联系退款成功:', request.pointsCost, '积分, requestId:', requestId)
      } catch (e) {
        console.error('联系退款失败:', e)
        // 退款失败不阻断拒绝流程
      }
    }

    return {
      code: 0,
      message: '已拒绝联系申请'
    };
  } catch (error) {
    return {
      code: -1,
      message: '操作失败: ' + error.message
    };
  }
};
