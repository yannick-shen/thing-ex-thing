// 云函数入口文件
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

// 云函数入口函数
exports.main = async (event, context) => {
  const { itemId } = event

  try {
    console.log('=== 调试评论数据 ===');
    console.log('查询itemId:', itemId);
    console.log('itemId类型:', typeof itemId);

    // 1. 查询所有评论（不限制itemId）
    const allComments = await db.collection('comments').get();
    console.log('数据库中总评论数:', allComments.data.length);

    // 2. 查询指定物品的评论（使用where）
    const itemComments = await db.collection('comments').where({
      itemId: itemId
    }).get();
    console.log('指定物品评论数:', itemComments.data.length);

    // 3. 查询指定物品的评论（使用聚合）
    const aggregateComments = await db.collection('comments').aggregate()
      .match({
        itemId: itemId,
        status: 'active'
      })
      .end();
    console.log('聚合查询评论数:', aggregateComments.data.length);

    // 4. 查询物品是否存在
    const itemExists = await db.collection('items').where({
      _id: itemId
    }).get();
    console.log('物品是否存在:', itemExists.data.length > 0);

    // 5. 显示最近的几条评论数据
    const recentComments = itemComments.data.slice(0, 3);
    console.log('最近的评论数据:');
    recentComments.forEach((comment, index) => {
      console.log(`评论${index + 1}:`, {
        _id: comment._id,
        itemId: comment.itemId,
        itemIdType: typeof comment.itemId,
        content: comment.content,
        status: comment.status,
        createdAt: comment.createdAt
      });
    });

    const result = {
      success: true,
      debug: {
        totalComments: allComments.data.length,
        itemComments: itemComments.data.length,
        aggregateComments: aggregateComments.data.length,
        itemExists: itemExists.data.length > 0,
        recentComments: recentComments
      }
    };

    console.log('调试云函数返回结果:', JSON.stringify(result, null, 2));
    return result;

  } catch (error) {
    console.error('调试失败:', error);
    return {
      success: false,
      error: error.message
    };
  }
}