// 云函数入口文件
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command
const $ = _.aggregate

// 云函数入口函数
exports.main = async (event, context) => {
  const { itemId, page = 1, pageSize = 20, refresh = false } = event

  try {
    // 参数校验
    if (!itemId) {
      return {
        success: false,
        message: '参数错误：缺少物品ID'
      }
    }

    // 计算跳过的数量
    const skip = (page - 1) * pageSize

    // 构建聚合查询
    const aggregateQuery = db.collection('comments').aggregate()
      .match({
        itemId: itemId,
        status: 'active'
      })
      .lookup({
        from: 'users',
        localField: 'userId',
        foreignField: 'openid',
        as: 'userInfo'
      })
      .lookup({
        from: 'users',
        localField: 'replyToUserId',
        foreignField: 'openid',
        as: 'replyToUserInfo'
      })
      .sort({
        createdAt: 1 // 按时间升序排列，最早的评论在前
      })
      .skip(skip)
      .limit(pageSize)
      .end()

    const result = await aggregateQuery

    // 处理返回的数据
    const comments = result.data.map(comment => {
      const processedComment = {
        _id: comment._id,
        itemId: comment.itemId,
        userId: comment.userId,
        userName: comment.userName,
        userAvatar: comment.userAvatar,
        content: comment.content,
        replyToUserId: comment.replyToUserId,
        replyToUserName: comment.replyToUserName,
        replyToCommentId: comment.replyToCommentId,
        createdAt: comment.createdAt,
        updatedAt: comment.updatedAt,
        status: comment.status
      }

      // 如果有用户信息，使用更准确的用户名和头像
      if (comment.userInfo && comment.userInfo.length > 0) {
        const userInfo = comment.userInfo[0]
        processedComment.userName = userInfo.profile ? userInfo.profile.nickname : '匿名用户'
        processedComment.userAvatar = userInfo.profile ? userInfo.profile.avatarUrl : ''
      }

      // 如果有被回复用户信息，使用更准确的用户名
      if (comment.replyToUserInfo && comment.replyToUserInfo.length > 0) {
        const replyToUserInfo = comment.replyToUserInfo[0]
        processedComment.replyToUserName = replyToUserInfo.profile ? replyToUserInfo.profile.nickname : '匿名用户'
      }

      return processedComment
    })

    // 获取总数
    const countResult = await db.collection('comments').where({
      itemId: itemId,
      status: 'active'
    }).count()

    const total = countResult.total
    const hasMore = skip + comments.length < total

    return {
      success: true,
      message: '获取评论成功',
      data: {
        comments,
        total,
        hasMore,
        page,
        pageSize
      }
    }

  } catch (error) {
    console.error('获取评论失败:', error)
    return {
      success: false,
      message: '获取评论失败',
      error: error.message
    }
  }
}