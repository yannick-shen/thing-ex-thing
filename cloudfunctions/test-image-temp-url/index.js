const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event, context) => {
  const { itemId } = event;

  try {
    console.log('测试云函数开始执行，itemId:', itemId);

    // 查询物品
    const itemRes = await db.collection('items').doc(itemId).get();
    if (!itemRes.data) {
      return { code: 404, message: '物品不存在' };
    }

    const item = itemRes.data;
    console.log('物品数据:', JSON.stringify(item, null, 2));
    console.log('图片数组:', item.images);
    console.log('图片数组长度:', item.images?.length);

    if (!item.images || item.images.length === 0) {
      return { code: 400, message: '物品没有图片' };
    }

    // 检查所有图片的类型
    const imageTypes = item.images.map(img => ({
      path: img,
      type: img.startsWith('cloud://') ? 'cloud' : (img.startsWith('http') ? 'http' : 'unknown')
    }));
    console.log('所有图片类型:', JSON.stringify(imageTypes, null, 2));

    // 找到第一个云存储路径的图片
    const cloudImage = item.images.find(img => img.startsWith('cloud://'));

    if (!cloudImage) {
      return {
        code: 200,
        message: '没有云存储路径的图片',
        data: {
          images: imageTypes,
          firstImage: item.images[0]
        }
      };
    }

    console.log('使用云存储图片:', cloudImage);
    console.log('云存储图片类型:', typeof cloudImage);
    console.log('是否为cloud://路径:', cloudImage.startsWith('cloud://'));

    // 测试获取临时链接
    console.log('开始获取临时链接...');
    try {
      const tempUrlResult = await cloud.getTempFileURL({
        fileList: [cloudImage],
        maxAge: 7200
      });

      console.log('临时链接结果:', JSON.stringify(tempUrlResult, null, 2));

      if (tempUrlResult.fileList && tempUrlResult.fileList.length > 0) {
        const fileInfo = tempUrlResult.fileList[0];
        console.log('文件信息:', JSON.stringify(fileInfo, null, 2));

        return {
          code: 0,
          message: '测试成功',
          data: {
            allImages: imageTypes,
            originalImage: cloudImage,
            tempFileURL: fileInfo.tempFileURL,
            fileID: fileInfo.fileID,
            maxAge: fileInfo.maxAge,
            status: fileInfo.status,
            errMsg: fileInfo.errMsg
          }
        };
      } else {
        return {
          code: 500,
          message: 'fileList为空',
          data: { tempUrlResult }
        };
      }
    } catch (err) {
      console.error('获取临时链接失败:', err);
      console.error('错误详情:', JSON.stringify(err, null, 2));

      return {
        code: 500,
        message: '获取临时链接失败',
        data: {
          error: err.message,
          errorDetail: err
        }
      };
    }

  } catch (error) {
    console.error('测试云函数执行失败:', error);
    console.error('错误堆栈:', error.stack);

    return {
      code: 500,
      message: '执行失败: ' + error.message,
      data: {
        error: error.message,
        stack: error.stack
      }
    };
  }
};
