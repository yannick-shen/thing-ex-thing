const cloud = require('wx-server-sdk');
cloud.init({ env: 'cloud1-3gsbomiw03ea5416' });
const db = cloud.database();

exports.main = async (event, context) => {
  try {
    console.log('云函数开始执行');
    console.log('接收到的event:', event);
    
    const { itemId } = event || {};
    const wxContext = cloud.getWXContext();
    console.log('提取的itemId:', itemId);
    console.log('用户上下文:', wxContext);
    
    if (!itemId) {
      console.log('itemId为空');
      return { code: 400, message: 'missing itemId' };
    }

    // 尝试获取物品详情
    console.log('开始查询物品详情，itemId:', itemId);
    let itemRes;
    try {
      itemRes = await db.collection('items').doc(itemId).get();
      console.log('物品查询结果:', itemRes);
    } catch (err) {
      console.error('查询物品失败:', err);
      console.error('错误详情:', err.message);
      return { code: 500, message: 'database query failed: ' + err.message };
    }
    
    if (!itemRes.data) {
      console.log('物品不存在');
      return { code: 404, message: 'item not found' };
    }

    const item = itemRes.data;
    console.log('物品数据:', item);
    
    // 检查物品状态 - 允许查看自己的任何状态物品
    const canView = item.status === 'on' || item.authorId === wxContext.OPENID;
    if (!canView) {
      console.log('物品状态不允许查看，status:', item.status, 'authorId:', item.authorId, 'openid:', wxContext.OPENID);
      return { code: 403, message: 'item not available' };
    }

    // 查询收藏状态（仅在用户登录时）
    let favorited = false;
    if (wxContext.OPENID) {
      console.log('查询收藏状态，userId:', wxContext.OPENID, 'itemId:', itemId);
      try {
        const favRes = await db.collection('favorites').where({ 
          userId: wxContext.OPENID, 
          itemId 
        }).get();
        console.log('收藏查询结果:', favRes);
        favorited = favRes.data && favRes.data.length > 0;
      } catch (err) {
        console.error('查询收藏状态失败:', err);
        // 收藏状态查询失败不应该影响主要功能
      }
    }

    // 异步增加浏览计数
    try {
      setTimeout(async () => {
        try {
          await db.collection('items').doc(itemId).update({
            data: { 'counters.views': db.command.inc(1) }
          });
          console.log('浏览数更新成功');
        } catch (err) {
          console.error('更新浏览数失败:', err);
        }
      }, 0);
    } catch (err) {
      console.error('设置异步更新失败:', err);
    }

    console.log('返回成功结果，favorited:', favorited);
    return { 
      code: 0, 
      data: { 
        item, 
        favorited 
      } 
    };
  } catch (e) {
    console.error('云函数执行出错:', e);
    console.error('错误堆栈:', e.stack);
    return { 
      code: 500, 
      message: 'server error: ' + e.message,
      error: e.toString()
    };
  }
};