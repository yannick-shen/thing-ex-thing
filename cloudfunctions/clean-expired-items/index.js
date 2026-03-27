const cloud = require('wx-server-sdk');
cloud.init({ env: 'cloud1-3gsbomiw03ea5416' });
const db = cloud.database();
const _ = db.command;

exports.main = async (event, context) => {
  try {
    const now = Date.now();
    const draftDeleteDays = 90; // 草稿90天后软删除
    const draftDeleteTime = now - draftDeleteDays * 24 * 60 * 60 * 1000;
    const draftToDeleteDays = 30; // 软删除30天后真删除
    const draftToDeleteTime = now - draftToDeleteDays * 24 * 60 * 60 * 1000;
    const expireDays = 30; // 上架30天后自动下架
    const expireTime = now - expireDays * 24 * 60 * 60 * 1000;
    
    // 1. 处理上架超过30天的物品：自动下架至草稿
    const expiredItems = await db.collection('items')
      .where({
        status: 'on',
        updatedAt: _.lt(expireTime)
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

    // 2. 处理草稿箱中超过90天的物品：软删除
    const oldDrafts = await db.collection('items')
      .where({
        status: 'draft',
        updatedAt: _.lt(draftDeleteTime)
      })
      .limit(100)
      .get();

    let softDeletedCount = 0;
    if (oldDrafts.data && oldDrafts.data.length > 0) {
      // 标记为软删除
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
      softDeletedCount = oldDrafts.data.length;
      console.log(`Soft deleted ${softDeletedCount} old draft items`);
    }

    // 3. 处理软删除超过30天的物品：彻底真删除
    const oldDeletedItems = await db.collection('items')
      .where({
        status: 'deleted',
        updatedAt: _.lt(draftToDeleteTime)
      })
      .limit(100)
      .get();

    let trulyDeletedCount = 0;
    if (oldDeletedItems.data && oldDeletedItems.data.length > 0) {
      // 删除云存储中的图片
      const deleteImagePromises = [];
      
      oldDeletedItems.data.forEach(item => {
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

      // 彻底删除物品记录
      const deletePromises = oldDeletedItems.data.map(item => {
        return db.collection('items').doc(item._id).remove();
      });
      await Promise.all(deletePromises);
      trulyDeletedCount = oldDeletedItems.data.length;
      console.log(`Truly deleted ${trulyDeletedCount} old deleted items`);
    }

    return { 
      code: 0, 
      message: 'success', 
      expiredCount,
      softDeletedCount,
      trulyDeletedCount,
      totalCount: expiredCount + softDeletedCount + trulyDeletedCount
    };
  } catch (e) {
    console.error(e);
    return { code: 500, message: 'server error' };
  }
};