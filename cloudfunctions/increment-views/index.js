const cloud = require('wx-server-sdk');
cloud.init({ env: 'cloud1-3gsbomiw03ea5416' });
const db = cloud.database();

exports.main = async (event, context) => {
  try {
    const { itemId } = event || {};
    
    if (!itemId) {
      return { code: 400, message: '缺少物品ID' };
    }

    // 增加物品浏览量
    const result = await db.collection('items').doc(itemId).update({
      data: {
        'counters.views': db.command.inc(1),
        updatedAt: Date.now()
      }
    });

    if (result.stats.updated > 0) {
      return { code: 0, message: '浏览量增加成功' };
    } else {
      return { code: 404, message: '物品不存在' };
    }

  } catch (e) {
    console.error('增加浏览量失败:', e);
    return { code: 500, message: '服务器错误' };
  }
};