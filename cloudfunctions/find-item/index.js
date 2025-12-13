const cloud = require('wx-server-sdk');
cloud.init({ env: 'cloud1-3gsbomiw03ea5416' });
const db = cloud.database();

exports.main = async (event, context) => {
  try {
    const { itemId, mode, status, limit = 20 } = event || {};
    
    let query = {};
    
    if (itemId) {
      // 查找特定物品
      query._id = itemId;
    } else {
      // 按条件查找
      if (mode) query.mode = mode;
      if (status) query.status = status;
    }
    
    const result = await db.collection('items')
      .where(query)
      .limit(limit)
      .orderBy('updatedAt', 'desc')
      .get();
    
    const items = result.data || [];
    
    // 添加状态说明
    const statusMap = {
      'on': '上架中',
      'draft': '草稿',
      'deleted': '已删除',
      'off': '已下架'
    };
    
    const detailedItems = items.map(item => ({
      id: item._id,
      title: item.title,
      mode: item.mode,
      status: item.status,
      statusText: statusMap[item.status] || item.status,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
      expireAt: item.expireAt,
      isExpired: item.expireAt ? Date.now() > item.expireAt : false,
      views: item.counters?.views || 0,
      favorites: item.counters?.favorites || 0
    }));
    
    return { 
      code: 0, 
      data: { 
        items: detailedItems,
        count: detailedItems.length
      }
    };
    
  } catch (e) {
    console.error('查询物品失败:', e);
    return { code: 500, message: '服务器错误' };
  }
};