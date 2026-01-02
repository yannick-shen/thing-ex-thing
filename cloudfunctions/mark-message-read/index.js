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
  const { messageId } = event

  try {
    // 参数校验
    if (!messageId) {
      return {
        success: false,
        message: '参数错误：缺少消息ID'
      }
    }

    // 获取消息信息
    const messageResult = await db.collection('messages').doc(messageId).get()
    if (!messageResult.data) {
      return {
        success: false,
        message: '消息不存在'
      }
    }

    const message = messageResult.data

    // 只能标记发送给自己的消息
    if (message.toUserId !== wxContext.OPENID) {
      return {
        success: false,
        message: '无权操作此消息'
      }
    }

    // 标记为已读
    await db.collection('messages').doc(messageId).update({
      data: {
        isRead: true,
        updatedAt: Date.now()
      }
    })

    return {
      success: true,
      message: '标记已读成功'
    }

  } catch (error) {
    console.error('标记消息已读失败:', error)
    return {
      success: false,
      message: '标记消息已读失败',
      error: error.message
    }
  }
}
