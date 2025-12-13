const cloud = require('wx-server-sdk');
cloud.init({ env: 'cloud1-3gsbomiw03ea5416' });
const db = cloud.database();
const _ = db.command;

exports.main = async (event, context) => {
  try {
    const now = Date.now();
    const draftDeleteDays = 90; // 草稿90天后删除
    const draftDeleteTime = now - draftDeleteDays * 24 * 60 * 60 * 1000;
    
    // 1. 处理过期物品：上架30天后自动下架至草稿
    const expiredItems = await db.collection('items')
      .where({
        expireAt: _.lt(now),
        status: 'on'
      })
      .limit(100)
      .get();

    let expiredCount = 0;
    if (expiredItems.data && expiredItems.data.length > 0) {
      const updatePromises = expiredItems.data.map(item => {
        return db.collection('items').doc(item._id).update({
          data: {
            status: 'draft',
            updatedAt: now
          }
        });
      });
      await Promise.all(updatePromises);
      expiredCount = expiredItems.data.length;
      console.log(`Moved ${expiredCount} expired items to draft`);
    }

    // 2. 处理草稿箱中超过90天的物品：自动删除
    const oldDrafts = await db.collection('items')
      .where({
        status: 'draft',
        updatedAt: _.lt(draftDeleteTime)
      })
      .limit(100)
      .get();

    let deletedCount = 0;
    if (oldDrafts.data && oldDrafts.data.length > 0) {
      // 删除云存储中的图片
      const deleteImagePromises = [];
      
      oldDrafts.data.forEach(item => {
        if (item.images && Array.isArray(item.images)) {
          item.images.forEach(fileID => {
            deleteImagePromises.push(
              cloud.deleteFile({ fileList: [fileID] }).catch(err => {
                console.error('删除图片失败:', fileID, err);
              })
            );
          });
        }
      });

      // 等待所有图片删除完成
      await Promise.all(deleteImagePromises);

      // 标记为已删除
      const deletePromises = oldDrafts.data.map(item => {
        return db.collection('items').doc(item._id).update({
          data: {
            status: 'deleted',
            deletedAt: now,
            updatedAt: now
          }
        });
      });
      await Promise.all(deletePromises);
      deletedCount = oldDrafts.data.length;
      console.log(`Deleted ${deletedCount} old draft items`);
    }

    return { 
      code: 0, 
      message: 'success', 
      expiredCount,
      deletedCount,
      totalCount: expiredCount + deletedCount
    };
  } catch (e) {
    console.error(e);
    return { code: 500, message: 'server error' };
  }
};