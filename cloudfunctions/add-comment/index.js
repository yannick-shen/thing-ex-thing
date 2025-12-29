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
  const { itemId, content, replyToUserId, replyToCommentId } = event

  try {
    // 参数校验
    if (!itemId || !content || !content.trim()) {
      return {
        success: false,
        message: '参数错误'
      }
    }

    console.log('=== 开始评论处理 ===');
    console.log('当前用户openid:', wxContext.OPENID);
    console.log('评论参数:', event);
    console.log('itemId类型:', typeof itemId);
    console.log('itemId值:', itemId);

    // 直接获取用户信息用于构建评论数据
    // （用户能调用此云函数证明已经登录，用户记录必然存在）
    const userInfo = await db.collection('users').where({
      openid: wxContext.OPENID
    }).get()

    const user = userInfo.data[0];
    console.log('获取用户信息成功:', user.profile?.nickname);
    
    return await createComment(user, event, db, _);
    
  } catch (error) {
    console.error('云函数执行失败:', error);
    return {
      success: false,
      message: '云函数执行失败: ' + error.message,
      error: error.message
    }
  }
}

// 创建评论的辅助函数
async function createComment(user, event, db, _) {
  const { itemId, content, replyToUserId, replyToCommentId } = event
  
  console.log('=== createComment 函数开始 ===');
  console.log('用户openid:', user.openid);
  console.log('用户profile:', user.profile);
  
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

  console.log('评论数据:', commentData);

  // 如果是回复，获取被回复用户的用户名
  if (replyToUserId) {
    console.log('查询被回复用户:', replyToUserId);
    const replyToUser = await db.collection('users').where({
      openid: replyToUserId
    }).get()
    
    console.log('被回复用户查询结果:', replyToUser.data);
    
    if (replyToUser.data.length > 0) {
      commentData.replyToUserName = replyToUser.data[0].profile ? replyToUser.data[0].profile.nickname : '匿名用户'
      console.log('设置被回复用户名:', commentData.replyToUserName);
    }
  }

  try {
    console.log('插入评论到数据库...');
    // 插入评论
    const result = await db.collection('comments').add({
      data: commentData
    })

    console.log('评论插入成功，ID:', result._id);

    // 更新物品的评论数量
    try {
      console.log('准备更新物品评论数量，itemId:', itemId);
      console.log('使用where条件查询物品...');
      
      // 使用where查询而不是doc，避免ObjectId格式问题
      const updateResult = await db.collection('items').where({
        _id: itemId
      }).update({
        data: {
          commentCount: _.inc(1),
          updatedAt: Date.now()
        }
      });
      
      console.log('物品评论数量更新结果:', updateResult);
      console.log('匹配的物品数量:', updateResult.stats.updated);
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
          userId: user.openid,
          ...commentData
        }
      }
    }
  } catch (commentError) {
    console.error('插入评论失败:', commentError);
    throw commentError;
  }
}