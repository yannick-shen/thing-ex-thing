const cloud = require('wx-server-sdk');
cloud.init({ env: 'cloud1-3gsbomiw03ea5416' });
const db = cloud.database();

exports.main = async (event, context) => {
  try {
    console.log('云函数被调用，参数:', event);
    
    const { itemId } = event || {};
    const wxContext = cloud.getWXContext();
    console.log('用户上下文:', wxContext);
    
    if (!itemId) {
      console.log('缺少itemId参数');
      return { code: 400, message: 'missing itemId' };
    }

    // 简化版本 - 只获取物品详情，不查收藏状态
    console.log('开始查询物品详情，itemId:', itemId);
    
    try {
      const itemRes = await db.collection('items').doc(itemId).get();
      console.log('物品查询结果:', itemRes);
      
      if (!itemRes.data) {
        console.log('物品不存在');
        return { code: 404, message: 'item not found' };
      }

      const item = itemRes.data;
      console.log('物品数据:', item);

      console.log('返回成功结果');
      return { 
        code: 0, 
        data: { 
          item, 
          favorited: false  // 暂时设为false
        } 
      };
    } catch (err) {
      console.error('查询物品失败:', err);
      return { 
        code: 500, 
        message: 'database query failed: ' + err.message,
        error: err.toString()
      };
    }
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