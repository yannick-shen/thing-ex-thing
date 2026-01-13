// 云函数入口文件
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command

// 云函数入口函数
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const { 
    itemId, 
    commentId, 
    replyToUserId, 
    replyToUserName, 
    replierId, 
    replierName, 
    itemTitle 
  } = event

  try {
    // 参数校验
    if (!itemId || !commentId || !replyToUserId || !replierId) {
      return {
        success: false,
        message: '参数错误'
      }
    }

    // 如果回复者就是被回复者，不需要创建消息
    if (replierId === replyToUserId) {
      return {
        success: true,
        message: '自己回复自己，不需要创建消息'
      }
    }

    // 构建消息数据
    const messageData = {
      type: 'reply',
      title: '新回复通知',
      content: `${replierName} 回复了你在《${itemTitle}》下的评论`,
      itemId: itemId,
      commentId: commentId,
      fromUserId: replierId,
      fromUserName: replierName,
      toUserId: replyToUserId,
      replyToUserId: replyToUserId,
      replyToUserName: replyToUserName,
      isRead: false,
      createdAt: Date.now(),
      updatedAt: Date.now()
    }

    // 插入消息
    await db.collection('messages').add({
      data: messageData
    })

    return {
      success: true,
      message: '回复消息创建成功'
    }

  } catch (error) {
    console.error('创建回复消息失败:', error)
    return {
      success: false,
      message: '创建回复消息失败',
      error: error.message
    }
  }
}