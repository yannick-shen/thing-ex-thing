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
  const { page = 1, pageSize = 20, type = 'all' } = event

  try {
    // 计算跳过的数量
    const skip = (page - 1) * pageSize

    // 构建查询条件
    let queryCondition = {
      toUserId: wxContext.OPENID
    }

    // 如果指定了类型，添加类型过滤
    if (type !== 'all') {
      queryCondition.type = type
    }

    // 获取消息列表
    const messagesResult = await db.collection('messages')
      .where(queryCondition)
      .orderBy('createdAt', 'desc')
      .skip(skip)
      .limit(pageSize)
      .get()

    // 获取总数
    const countResult = await db.collection('messages')
      .where(queryCondition)
      .count()

    // 处理消息数据，添加跳转路径
    const messages = messagesResult.data.map(message => {
      let jumpPath = ''
      
      // 根据消息类型和内容生成跳转路径
      if (message.type === 'comment' && message.itemId) {
        jumpPath = `/pages/comment/comment?itemId=${message.itemId}`
      } else if (message.type === 'reply' && message.itemId && message.commentId) {
        jumpPath = `/pages/comment/comment?itemId=${message.itemId}&commentId=${message.commentId}`
      }

      return {
        ...message,
        jumpPath,
        formattedTime: formatTime(message.createdAt)
      }
    })

    const total = countResult.total
    const hasMore = skip + messages.length < total

    return {
      success: true,
      message: '获取评论消息成功',
      data: {
        messages,
        total,
        hasMore,
        page,
        pageSize
      }
    }

  } catch (error) {
    console.error('获取评论消息失败:', error)
    return {
      success: false,
      message: '获取评论消息失败',
      error: error.message
    }
  }
}

// 格式化时间函数
function formatTime(timestamp) {
  const now = Date.now()
  const diff = now - timestamp
  const minute = 60 * 1000
  const hour = 60 * minute
  const day = 24 * hour

  if (diff < minute) {
    return '刚刚'
  } else if (diff < hour) {
    return `${Math.floor(diff / minute)}分钟前`
  } else if (diff < day) {
    return `${Math.floor(diff / hour)}小时前`
  } else if (diff < 7 * day) {
    return `${Math.floor(diff / day)}天前`
  } else {
    const date = new Date(timestamp)
    return `${date.getMonth() + 1}-${date.getDate()}`
  }
}