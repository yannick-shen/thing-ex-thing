const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event, context) => {
  const { qrCode } = event;
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;

  try {
    const userRes = await db.collection('users').where({
      openid: openid
    }).get();

    if (userRes.data.length === 0) {
      return {
        code: -1,
        message: '用户不存在'
      };
    }

    const userId = userRes.data[0]._id;
    const user = userRes.data[0];

    // 获取旧二维码
    const oldQrCode = user.contactInfo && user.contactInfo.qrCode;

    // 删除旧二维码文件
    if (oldQrCode && oldQrCode !== qrCode && oldQrCode.startsWith('cloud://')) {
      try {
        await cloud.deleteFile({
          fileList: [oldQrCode]
        });
      } catch (deleteError) {
        console.warn('删除旧二维码失败:', deleteError.message);
      }
    }

    // 更新用户的联系方式
    await db.collection('users').doc(userId).update({
      data: {
        contactInfo: {
          qrCode: qrCode,
          updateTime: Date.now()
        }
      }
    });

    return {
      code: 0,
      message: '联系方式更新成功'
    };
  } catch (error) {
    return {
      code: -1,
      message: '更新失败: ' + error.message
    };
  }
};
