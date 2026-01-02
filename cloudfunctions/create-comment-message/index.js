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
  const { itemId, commentId, commenterId, commenterName, itemTitle } = event

  try {
    // 参数校验
    if (!itemId || !commentId || !commenterId) {
      return {
        success: false,
        message: '参数错误'
      }
    }

    // 获取物品信息，找到物品发布者
    const itemResult = await db.collection('items').doc(itemId).get()
    if (!itemResult.data) {
      return {
        success: false,
        message: '物品不存在'
      }
    }

    const item = itemResult.data

    // 获取物品发布者的 openid
    let itemOwnerOpenid = null
    if (item.authorId) {
      // 根据 authorId 查询用户信息获取 openid
      try {
        const userResult = await db.collection('users').doc(item.authorId).get()
        if (userResult.data && userResult.data.openid) {
          itemOwnerOpenid = userResult.data.openid
        }
      } catch (queryError) {
        // 如果 doc 查询失败,尝试使用 where 查询
        const whereResult = await db.collection('users').where({
          _id: item.authorId
        }).get()

        if (whereResult.data && whereResult.data.length > 0 && whereResult.data[0].openid) {
          itemOwnerOpenid = whereResult.data[0].openid
        }
      }
    }

    if (!itemOwnerOpenid) {
      return {
        success: false,
        message: '无法获取物品发布者信息'
      }
    }

    // 如果评论者就是物品发布者，不需要创建消息
    if (commenterId === itemOwnerOpenid) {
      return {
        success: true,
        message: '自己评论自己的物品，不需要创建消息'
      }
    }

    // 构建消息数据
    const messageData = {
      type: 'comment',
      title: '新评论通知',
      content: `${commenterName} 评论了你的物品《${itemTitle}》`,
      itemId: itemId,
      commentId: commentId,
      fromUserId: commenterId,
      fromUserName: commenterName,
      toUserId: itemOwnerOpenid,
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
      message: '评论消息创建成功'
    }

  } catch (error) {
    console.error('创建评论消息失败:', error)
    return {
      success: false,
      message: '创建评论消息失败',
      error: error.message
    }
  }
}