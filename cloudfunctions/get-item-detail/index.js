const cloud = require('wx-server-sdk');
cloud.init({ env: 'cloud1-3gsbomiw03ea5416' });
const db = cloud.database();

exports.main = async (event, context) => {
  try {
    const { itemId } = event || {};
    const wxContext = cloud.getWXContext();
    if (!itemId) return { code: 400, message: 'missing itemId' };

    // 并行查询物品详情和收藏状态
    const promises = [];
    
    // 查询物品详情
    const itemPromise = db.collection('items').doc(itemId).get();
    promises.push(itemPromise);

    // 如果用户已登录，并行查询收藏状态
    if (wxContext.OPENID) {
      const favPromise = db.collection('favorites').where({ 
        userId: wxContext.OPENID, 
        itemId 
      }).get();
      promises.push(favPromise);
    }

    // 等待所有查询完成
    const results = await Promise.all(promises);
    const itemRes = results[0];
    
    if (!itemRes.data) return { code: 404, message: 'item not found' };

    const item = itemRes.data;
    
    // 检查物品状态，只有上架中的物品才能查看（除非是发布者本人）
    if (item.status !== 'on' && item.authorId !== wxContext.OPENID) {
      return { code: 403, message: 'item not available' };
    }

    // 获取收藏状态
    let favorited = false;
    if (wxContext.OPENID && results[1]) {
      favorited = results[1].data && results[1].data.length > 0;
    }

    // 异步增加浏览计数（完全不影响返回速度）
    setTimeout(() => {
      db.collection('items').doc(itemId).update({
        data: { 'counters.views': db.command.inc(1) }
      }).catch(err => {
        console.error('更新浏览数失败:', err);
      });
    }, 0);

    return { code: 0, data: { item, favorited } };
  } catch (e) {
    console.error(e);
    return { code: 500, message: 'server error' };
  }
};