// 简单调试云函数
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

// 云函数入口函数
exports.main = async (event, context) => {
  try {
    const { itemId } = event
    
    console.log('简单调试 - itemId:', itemId)
    console.log('简单调试 - itemId类型:', typeof itemId)
    
    // 直接查询指定物品的评论
    const comments = await db.collection('comments').where({
      itemId: itemId
    }).get()
    
    console.log('查询到的评论数量:', comments.data.length)
    
    // 查询物品是否存在
    const items = await db.collection('items').where({
      _id: itemId
    }).get()
    
    console.log('查询到的物品数量:', items.data.length)
    
    return {
      success: true,
      itemId: itemId,
      itemIdType: typeof itemId,
      commentCount: comments.data.length,
      itemExists: items.data.length > 0,
      comments: comments.data.slice(0, 2) // 只返回前2条评论用于调试
    }
    
  } catch (error) {
    console.error('简单调试失败:', error)
    return {
      success: false,
      error: error.message
    }
  }
}