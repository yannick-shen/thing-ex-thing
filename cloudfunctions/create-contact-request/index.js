const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

// ===== 功能开关 =====
const ENABLE_POINTS = false  // 积分系统：获得广告资格后改为 true

exports.main = async (event, context) => {
  const { itemId, remark } = event;
  const wxContext = cloud.getWXContext();
  const buyerOpenid = wxContext.OPENID;

  try {
    // 获取买家信息
    const buyerRes = await db.collection('users').where({
      openid: buyerOpenid
    }).get();

    if (buyerRes.data.length === 0) {
      return {
        code: -1,
        message: '用户不存在'
      };
    }

    const buyer = buyerRes.data[0];
    const buyerId = buyer._id;
    const buyerName = buyer.profile && buyer.profile.nickname || '用户';
    const buyerAvatar = buyer.profile && buyer.profile.avatarUrl || '/assets/images/default-avatar.png';

    // 获取物品信息
    const itemRes = await db.collection('items').doc(itemId).get();

    if (!itemRes.data) {
      return {
        code: -1,
        message: '物品不存在'
      };
    }

    const item = itemRes.data;
    const sellerId = item.authorId;

    // 不能联系自己
    if (buyerId === sellerId) {
      return {
        code: -1,
        message: '不能联系自己'
      };
    }

    // 获取卖家的openid
    const sellerRes = await db.collection('users').doc(sellerId).get();
    if (!sellerRes.data) {
      return {
        code: -1,
        message: '卖家信息不存在'
      };
    }

    const sellerOpenid = sellerRes.data.openid;

    // 检查是否已有未处理的联系申请
    const existingRequest = await db.collection('contact_requests').where({
      itemId: itemId,
      buyerId: buyerId,
      sellerId: sellerId,
      status: 'pending'
    }).get();

    if (existingRequest.data.length > 0) {
      return {
        code: -1,
        message: '已有待处理的联系申请，请勿重复提交'
      };
    }

    // 检查是否已被拒绝（可选：可以设置冷却期）
    const rejectedRequest = await db.collection('contact_requests').where({
      itemId: itemId,
      buyerId: buyerId,
      sellerId: sellerId,
      status: 'rejected'
    }).orderBy('createTime', 'desc')
      .limit(1)
      .get();

    if (rejectedRequest.data.length > 0) {
      const lastReject = rejectedRequest.data[0];
      const dayInMs = 24 * 60 * 60 * 1000;
      const daysPassed = Date.now() - lastReject.createTime;

      if (daysPassed < dayInMs) {
        return {
          code: -1,
          message: '卖家已拒绝您的联系申请，24小时后可再次申请'
        };
      }
    }

    // ============================================================
    //  积分系统：联系卖家消耗（每日前 2 次免费，超出 3 积分/次）
    //  使用 users.todayContactCount / contactCountDate 跟踪
    // ============================================================
    let pointsCost = 0

    // 1. 获取今天的日期字符串，跨天重置
    const todayStr = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-${String(new Date().getDate()).padStart(2, '0')}`
    const contactCountDate = buyer.contactCountDate || ''
    const todayContactCount = (contactCountDate === todayStr) ? (buyer.todayContactCount || 0) : 0

    // 2. 超过 2 次免费配额，扣积分（ENABLE_POINTS 为 false 时跳过）
    if (ENABLE_POINTS && todayContactCount >= 2) {
      pointsCost = 3
      try {
        const consumeRes = await cloud.callFunction({
          name: 'points-service',
          data: {
            action: 'consume',
            params: { type: 'contact', amount: pointsCost, relatedItemId: itemId }
          }
        })
        const cr = consumeRes.result
        if (cr.code !== 0) {
          return {
            code: 402,
            message: '积分不足',
            data: {
              cost: pointsCost,
              balance: cr.data ? cr.data.balance : 0,
              required: pointsCost,
              todayCount: todayContactCount
            }
          }
        }
      } catch (e) {
        console.error('联系消耗积分失败:', e)
        return { code: 500, message: '积分系统异常，请稍后重试' }
      }
    }

    // 3. 更新用户联系计数（先更新计数，再创建申请）
    await db.collection('users').doc(buyerId).update({
      data: {
        todayContactCount: todayContactCount + 1,
        contactCountDate: todayStr,
        updateTime: db.serverDate()
      }
    })

    // 4. 创建联系申请
    const requestResult = await db.collection('contact_requests').add({
      data: {
        itemId: itemId,
        itemTitle: item.title,
        buyerId: buyerId,
        buyerName: buyerName,
        buyerAvatar: buyerAvatar,
        buyerOpenid: buyerOpenid,
        sellerId: sellerId,
        sellerOpenid: sellerOpenid,
        remark: remark || '',
        status: 'pending',
        createTime: Date.now(),
        pointsCost: pointsCost  // 记录消耗积分，退款时用
      }
    });

    return {
      code: 0,
      message: '联系申请已发送',
      data: {
        requestId: requestResult._id,
        freeRemaining: Math.max(0, 2 - todayContactCount),
        pointsUsed: pointsCost
      }
    };
  } catch (error) {
    return {
      code: -1,
      message: '发送申请失败: ' + error.message
    };
  }
};
