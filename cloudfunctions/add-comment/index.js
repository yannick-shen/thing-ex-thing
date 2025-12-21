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
  const wxContext = cloud.getWXContext()
  const { itemId, content, replyToUserId, replyToCommentId } = event

  try {
    // 参数校验
    if (!itemId || !content || !content.trim()) {
      return {
        success: false,
        message: '参数错误'
      }
    }

    // 获取用户信息
    console.log('查询用户，openid:', wxContext.OPENID);
    const userInfo = await db.collection('users').where({
      openid: wxContext.OPENID
    }).get()

    console.log('用户查询结果:', userInfo);

    if (userInfo.data.length === 0) {
      console.log('用户不存在，尝试自动创建用户...');
      
      // 尝试自动创建用户（如果已经通过其他云函数登录过）
      try {
        const appid = wxContext.APPID || '';
        const newUser = {
          openid: wxContext.OPENID,
          appid: appid,
          createTime: new Date(),
          updateTime: new Date(),
          profile: {
            nickname: '微信用户',
            avatarUrl: '',
            phone: '',
            isPhoneBound: false
          },
          stats: {
            publishedCount: 0,
            favoritesCount: 0,
            soldCount: 0
          },
          status: 'active'
        };

        const addResult = await db.collection('users').add({
          data: newUser
        });
        
        console.log('用户创建成功:', addResult._id);
        
        const user = {
          _id: addResult._id,
          ...newUser
        };
        
        return await this.createComment(user, event);
      } catch (createError) {
        console.error('创建用户失败:', createError);
        return {
          success: false,
          message: '用户创建失败: ' + createError.message
        };
      }
    }

    const user = userInfo.data[0];
    console.log('找到用户:', user);
    return await this.createComment(user, event);

    // 构建评论数据
    const commentData = {
      itemId: itemId,
      userId: user.openid,
      userName: user.profile ? user.profile.nickname : '匿名用户',
      userAvatar: user.profile ? user.profile.avatarUrl : '',
      content: content.trim(),
      replyToUserId: replyToUserId || null,
      replyToCommentId: replyToCommentId || null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      status: 'active'
    }

  }
}

// 创建评论的辅助函数
async function createComment(user, event) {
  const { itemId, content, replyToUserId, replyToCommentId } = event
  
  // 构建评论数据
  const commentData = {
    itemId: itemId,
    userId: user.openid,
    userName: user.profile ? user.profile.nickname : '匿名用户',
    userAvatar: user.profile ? user.profile.avatarUrl : '',
    content: content.trim(),
    replyToUserId: replyToUserId || null,
    replyToCommentId: replyToCommentId || null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    status: 'active'
  }

  // 如果是回复，获取被回复用户的用户名
  if (replyToUserId) {
    const replyToUser = await db.collection('users').where({
      openid: replyToUserId
    }).get()
    
    if (replyToUser.data.length > 0) {
      commentData.replyToUserName = replyToUser.data[0].profile ? replyToUser.data[0].profile.nickname : '匿名用户'
    }
  }

  // 插入评论
  const result = await db.collection('comments').add({
    data: commentData
  })

  // 更新物品的评论数量
  try {
    await db.collection('items').doc(itemId).update({
      data: {
        commentCount: _.inc(1),
        updatedAt: Date.now()
      }
    });
    console.log('物品评论数量更新成功');
  } catch (updateError) {
    console.error('更新物品评论数量失败:', updateError);
    // 不影响主要功能，继续执行
  }

  // 返回插入的评论数据
  return {
    success: true,
    message: '评论发表成功',
    data: {
      comment: {
        _id: result._id,
        ...commentData
      }
    }
  }

  } catch (error) {
    console.error('添加评论失败:', error)
    return {
      success: false,
      message: '添加评论失败',
      error: error.message
    }
  }
}