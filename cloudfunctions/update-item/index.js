const cloud = require('wx-server-sdk');
cloud.init({ env: 'cloud1-3gsbomiw03ea5416' });
const db = cloud.database();

// 本地敏感词过滤
function checkLocalSensitiveWords(content) {
  const sensitiveWords = [
    '赌博', '博彩', '六合彩', '时时彩', '赌场', '赌注',
    '色情', '黄色', '成人', '裸聊', '约炮',
    '毒品', '冰毒', '大麻', '海洛因',
    '枪支', '手枪', '步枪', '炸药', '雷管',
    '发票', '代开', '刻章', '办证',
    '传销', '微商', '兼职打字', '刷单', '贷款', '信用卡套现'
  ];

  const lowerContent = content.toLowerCase();
  for (const word of sensitiveWords) {
    if (lowerContent.includes(word)) {
      return { safe: false, word };
    }
  }
  return { safe: true };
}

// 文本内容安全审核
async function checkTextSecurity(content) {
  try {
    const result = await cloud.openapi.security.msgSecCheck({
      openid: cloud.getWXContext().OPENID,
      scene: 1,
      version: 2,
      content
    });
    console.log('文本审核结果:', result);
    if (result.result && result.result.suggest) {
      return result.result.suggest === 'pass';
    }
    return result.errCode === 0;
  } catch (e) {
    console.error('文本审核异常:', e);
    if (e.errCode === 87014) {
      return false;
    }
    return true;
  }
}

exports.main = async (event, context) => {
  try {
    const { itemId, title, desc, mode, price, images = [], location, addressText = '' } = event || {};
    const wxContext = cloud.getWXContext();
    const openid = wxContext.OPENID;

    if (!itemId) {
      return { code: 400, message: 'missing itemId' };
    }

    // 获取用户ID
    let userId = null;
    try {
      const userResult = await db.collection('users').where({
        openid: openid
      }).get();

      if (userResult.data.length > 0) {
        userId = userResult.data[0]._id;
      }
    } catch (e) {
      console.error('获取用户ID失败:', e);
    }

    if (!userId) {
      return { code: 401, message: '请先登录后再编辑物品' };
    }

    // 验证物品归属
    const item = await db.collection('items').doc(itemId).get();
    if (!item.data) {
      return { code: 404, message: 'item not found' };
    }

    if (item.data.authorId !== userId) {
      return { code: 403, message: 'forbidden' };
    }

    // 内容安全审核
    const textContent = title + ' ' + desc;

    // 1. 本地敏感词过滤
    const localCheck = checkLocalSensitiveWords(textContent);
    if (!localCheck.safe) {
      return { code: 400, message: `内容包含敏感词"${localCheck.word}"，请修改后重试` };
    }

    // 2. 微信内容安全 API
    const textSafe = await checkTextSecurity(textContent);
    if (!textSafe) {
      return { code: 400, message: '内容包含违规信息，请修改后重试' };
    }

    const now = Date.now();

    // 位置处理
    const finalLat = Number(location.latitude);
    const finalLng = Number(location.longitude);

    const updateData = {
      title,
      desc,
      mode,
      price: mode === 'sale' ? Number(price || 0) : null,
      lat: finalLat,
      lng: finalLng,
      addressText,
      images,
      updatedAt: now
    };

    await db.collection('items').doc(itemId).update({ data: updateData });

    return { code: 0, data: { id: itemId } };
  } catch (e) {
    console.error(e);
    return { code: 500, message: 'server error' };
  }
};
