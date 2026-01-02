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

  try {
    // 统计当前用户的未读消息数量
    const countResult = await db.collection('messages')
      .where({
        toUserId: wxContext.OPENID,
        isRead: false
      })
      .count()

    const unreadCount = countResult.total || 0

    return {
      success: true,
      message: '获取未读消息数量成功',
      data: {
        unreadCount
      }
    }

  } catch (error) {
    console.error('获取未读消息数量失败:', error)
    return {
      success: false,
      message: '获取未读消息数量失败',
      error: error.message
    }
  }
}
