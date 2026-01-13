const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event, context) => {
  try {
    console.log('云函数开始执行');
    console.log('接收到的event:', event);
    
    const { itemId } = event || {};
    const wxContext = cloud.getWXContext();
    console.log('提取的itemId:', itemId);
    console.log('用户上下文:', wxContext);
    
    if (!itemId) {
      console.log('itemId为空');
      return { code: 400, message: 'missing itemId' };
    }

    // 尝试获取物品详情
    console.log('开始查询物品详情，itemId:', itemId);
    let itemRes;
    try {
      itemRes = await db.collection('items').doc(itemId).get();
      console.log('物品查询结果:', itemRes);
    } catch (err) {
      console.error('查询物品失败:', err);
      console.error('错误详情:', err.message);
      return { code: 500, message: 'database query failed: ' + err.message };
    }
    
    if (!itemRes.data) {
      console.log('物品不存在');
      return { code: 404, message: 'item not found' };
    }

    const item = itemRes.data;
    console.log('物品数据:', item);
    console.log('物品图片字段:', item.images);
    console.log('图片字段类型:', typeof item.images);
    console.log('图片是否为数组:', Array.isArray(item.images));
    if (item.images && Array.isArray(item.images)) {
      console.log('图片数组长度:', item.images.length);
      if (item.images.length > 0) {
        console.log('第一张图片:', item.images[0]);
        console.log('第一张图片类型:', typeof item.images[0]);
      }
    }

    // 检查物品状态 - 允许查看自己的任何状态物品
    // 需要通过openid查询用户表获取_id，因为authorId存储的是_id而不是openid
    let isOwnItem = false;
    if (wxContext.OPENID) {
      try {
        const userRes = await db.collection('users').where({ openid: wxContext.OPENID }).limit(1).get();
        if (userRes.data && userRes.data.length > 0) {
          isOwnItem = userRes.data[0]._id === item.authorId;
        }
      } catch (err) {
        console.error('查询用户信息失败:', err);
      }
    }

    const canView = item.status === 'on' || isOwnItem;
    if (!canView) {
      console.log('物品状态不允许查看，status:', item.status, 'authorId:', item.authorId, 'openid:', wxContext.OPENID, 'isOwnItem:', isOwnItem);
      return { code: 403, message: 'item not available' };
    }

    // 查询收藏状态（仅在用户登录时）
    let favorited = false;
    let commentCount = 0;
    
    if (wxContext.OPENID) {
      console.log('查询收藏状态，userId:', wxContext.OPENID, 'itemId:', itemId);
      try {
        const favRes = await db.collection('favorites').where({ 
          userId: wxContext.OPENID, 
          itemId 
        }).get();
        console.log('收藏查询结果:', favRes);
        favorited = favRes.data && favRes.data.length > 0;
      } catch (err) {
        console.error('查询收藏状态失败:', err);
        // 收藏状态查询失败不应该影响主要功能
      }
    }

    // 查询评论数量
    try {
      console.log('查询评论数量，itemId:', itemId);
      const commentRes = await db.collection('comments').where({
        itemId: itemId,
        status: 'active'
      }).count();
      commentCount = commentRes.total || 0;
      console.log('评论数量:', commentCount);
    } catch (err) {
      console.error('查询评论数量失败:', err);
      // 评论数量查询失败不应该影响主要功能
    }

    // 异步增加浏览计数
    try {
      setTimeout(async () => {
        try {
          await db.collection('items').doc(itemId).update({
            data: { 'counters.views': db.command.inc(1) }
          });
          console.log('浏览数更新成功');
        } catch (err) {
          console.error('更新浏览数失败:', err);
        }
      }, 0);
    } catch (err) {
      console.error('设置异步更新失败:', err);
    }

    // 添加评论数量到物品数据
    item.commentCount = commentCount;

    console.log('=== 开始处理图片和头像 ===');
    console.log('原始图片数组:', item.images);

    // 查询作者信息，添加作者头像
    if (item.authorId) {
      try {
        console.log('查询作者信息，authorId:', item.authorId);
        const authorRes = await db.collection('users').doc(item.authorId).get();
        if (authorRes.data && authorRes.data.profile) {
          item.authorAvatar = authorRes.data.profile.avatarUrl || '';
          item.authorNickname = authorRes.data.profile.nickname || '';
          console.log('作者头像URL:', item.authorAvatar);

          // 如果作者头像URL是云存储路径，转换为临时链接
          if (item.authorAvatar && item.authorAvatar.startsWith('cloud://')) {
            try {
              const tempUrlResult = await cloud.getTempFileURL({
                fileList: [item.authorAvatar],
                maxAge: 7200  // 设置临时链接有效期为2小时（7200秒）
              });
              console.log('作者头像临时链接结果:', tempUrlResult);
              if (tempUrlResult.fileList && tempUrlResult.fileList.length > 0 && tempUrlResult.fileList[0].tempFileURL) {
                item.authorAvatar = tempUrlResult.fileList[0].tempFileURL;
                console.log('作者头像临时链接生成成功:', item.authorAvatar);
              } else {
                console.warn('作者头像临时链接结果为空，tempUrlResult:', tempUrlResult);
              }
            } catch (err) {
              console.warn('获取作者头像临时链接失败:', item.authorAvatar, err);
            }
          }
        }
      } catch (err) {
        console.warn('获取作者信息失败:', err);
      }
    }

    // 转换图片链接为临时链接
    if (item.images && Array.isArray(item.images) && item.images.length > 0) {
      const tempImageUrls = [];

      // 批量获取临时链接（更高效）
      const cloudImages = item.images.filter(img => img && img.startsWith('cloud://'));
      console.log(`找到${cloudImages.length}张云存储图片，准备批量获取临时链接`);

      if (cloudImages.length > 0) {
        try {
          const batchResult = await cloud.getTempFileURL({
            fileList: cloudImages,
            maxAge: 7200
          });
          console.log('批量获取临时链接结果:', batchResult);

          if (batchResult.fileList && batchResult.fileList.length > 0) {
            // 创建映射表：原始图片URL -> 临时链接
            const urlMap = {};
            batchResult.fileList.forEach(fileInfo => {
              if (fileInfo.tempFileURL) {
                urlMap[fileInfo.fileID] = fileInfo.tempFileURL;
                console.log(`临时链接映射: ${fileInfo.fileID} -> ${fileInfo.tempFileURL}`);
              } else {
                console.warn(`文件${fileInfo.fileID}的临时链接为空`);
              }
            });

            // 替换图片URL
            item.images.forEach(image => {
              if (image && image.startsWith('cloud://')) {
                tempImageUrls.push(urlMap[image] || image);
              } else {
                tempImageUrls.push(image);
              }
            });
          } else {
            console.warn('批量获取临时链接失败，fileList为空');
            tempImageUrls.push(...item.images);
          }
        } catch (err) {
          console.error('批量获取临时链接异常:', err);
          console.error('错误详情:', JSON.stringify(err, null, 2));
          // 批量失败时逐个尝试
          console.log('批量失败，尝试逐个获取临时链接');
          for (let i = 0; i < item.images.length; i++) {
            const image = item.images[i];
            if (image && image.startsWith('cloud://')) {
              try {
                const singleResult = await cloud.getTempFileURL({
                  fileList: [image],
                  maxAge: 7200
                });
                if (singleResult.fileList && singleResult.fileList.length > 0 && singleResult.fileList[0].tempFileURL) {
                  tempImageUrls.push(singleResult.fileList[0].tempFileURL);
                  console.log(`第${i+1}张图片临时链接生成成功:`, singleResult.fileList[0].tempFileURL);
                } else {
                  tempImageUrls.push(image);
                  console.warn(`第${i+1}张图片临时链接为空`);
                }
              } catch (singleErr) {
                console.error(`第${i+1}张图片获取临时链接失败:`, image, singleErr);
                tempImageUrls.push(image);
              }
            } else {
              tempImageUrls.push(image);
            }
          }
        }
      } else {
        tempImageUrls.push(...item.images);
        console.log('没有云存储图片，直接使用原始URL');
      }

      item.images = tempImageUrls;
      console.log('转换后的图片数组:', item.images);
      console.log('转换后图片数组长度:', item.images.length);
    } else {
      console.warn('图片数组为空或格式不正确:', item.images);
      // 如果图片为空，使用占位图
      item.images = ['/assets/images/placeholder-empty.png'];
    }

    console.log('=== 处理完成，准备返回 ===');
    console.log('最终物品数据:', item);

    console.log('返回成功结果，favorited:', favorited, 'commentCount:', commentCount);
    return {
      code: 0,
      data: {
        item,
        favorited
      }
    };
  } catch (e) {
    console.error('云函数执行出错:', e);
    console.error('错误堆栈:', e.stack);
    return { 
      code: 500, 
      message: 'server error: ' + e.message,
      error: e.toString()
    };
  }
};