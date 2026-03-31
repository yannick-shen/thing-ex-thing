// 云函数入口文件
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command

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

    console.log('=== 开始获取评论 ===');
    console.log('itemId:', itemId);
    console.log('itemId类型:', typeof itemId);
    console.log('page:', page, 'pageSize:', pageSize);

    // 计算跳过的数量
    const skip = (page - 1) * pageSize

    // 直接使用简单查询，避免聚合查询的复杂性
    console.log('=== 执行查询 ===');
    const queryResult = await db.collection('comments')
      .where({
        itemId: itemId,
        status: 'active'
      })
      .orderBy('createdAt', 'asc')
      .skip(skip)
      .limit(pageSize)
      .get()

    console.log('查询结果数量:', queryResult.data.length);

    // 获取总数
    const countResult = await db.collection('comments').where({
      itemId: itemId,
      status: 'active'
    }).count()

    const total = countResult.total
    const hasMore = skip + queryResult.data.length < total

    console.log('评论总数:', total, 'hasMore:', hasMore);

    // 处理评论数据，添加用户信息
    console.log('=== 处理评论数据 ===');
    const comments = [];

    for (let i = 0; i < queryResult.data.length; i++) {
      const comment = queryResult.data[i];

      console.log(`处理评论${i + 1}:`, {
        _id: comment._id,
        userId: comment.userId,
        content: comment.content.substring(0, 20) + '...'
      });

      // 获取评论用户信息（直接使用cloud://路径）
      let userName = comment.userName || '匿名用户';
      let userAvatar = comment.userAvatar || '';

      if (comment.userId) {
        try {
          const userResult = await db.collection('users').where({
            openid: comment.userId
          }).get();

          if (userResult.data.length > 0) {
            const userInfo = userResult.data[0];
            userName = userInfo.profile && userInfo.profile.nickname ? userInfo.profile.nickname : '匿名用户';
            userAvatar = userInfo.profile && userInfo.profile.avatarUrl ? userInfo.profile.avatarUrl : '';
          }
        } catch (userError) {
          console.error('获取用户信息失败:', userError);
        }
      }

      // 获取被回复用户信息
      let replyToUserName = '';
      if (comment.replyToUserId && comment.replyToUserId !== comment.userId) {
        try {
          const replyUserResult = await db.collection('users').where({
            openid: comment.replyToUserId
          }).get();
          
          if (replyUserResult.data.length > 0) {
            const replyUserInfo = replyUserResult.data[0];
            replyToUserName = replyUserInfo.profile && replyUserInfo.profile.nickname ? replyUserInfo.profile.nickname : '匿名用户';
          }
        } catch (replyUserError) {
          console.error('获取被回复用户信息失败:', replyUserError);
        }
      }

      // 构建最终评论数据
      const processedComment = {
        _id: comment._id,
        itemId: comment.itemId,
        userId: comment.userId,
        userName: userName,
        userAvatar: userAvatar,
        content: comment.content,
        replyToUserId: comment.replyToUserId,
        replyToUserName: replyToUserName || comment.replyToUserName || '匿名用户',
        replyToCommentId: comment.replyToCommentId,
        createdAt: comment.createdAt,
        updatedAt: comment.updatedAt,
        status: comment.status
      };

      comments.push(processedComment);
      console.log(`评论${i + 1}处理完成: ${userName}`);
    }

    console.log('=== 查询完成 ===');
    console.log('最终返回评论数量:', comments.length);

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