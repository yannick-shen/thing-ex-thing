const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const https = require('https');

// ===== 功能开关 =====
const ENABLE_POINTS = false  // 积分系统：获得广告资格后改为 true

// ===== 通过 Nominatim 逆地理编码获取城市名（地级市级别）=====
function reverseGeocodeCity(lat, lng) {
  return new Promise((resolve) => {
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&accept-language=zh`;
    https.get(url, { headers: { 'User-Agent': 'WxMiniprogram/1.0' } }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          const addr = json.address || {};
          // state_district：中文 OSM 中代表地级市（如"郑州市"），解决县级市（登封）→地级市（郑州）的映射
          const city = addr.city || addr.state_district || addr.county || addr.state || addr.town || '';
          resolve(city ? city.replace(/市$/, '') : '');
        } catch (e) {
          resolve('');
        }
      });
    }).on('error', () => resolve(''));
  });
}

// 位置模糊处理：在原位置基础上生成稳定的偏移（基于种子值，确保同一位置每次偏移相同）
// 偏移范围：50-200米
function fuzzyLocation(lat, lng, seed) {
  // 使用种子值生成伪随机数，确保稳定性
  function seededRandom(seed) {
    const x = Math.sin(seed) * 10000;
    return x - Math.floor(x);
  }
  
  const random1 = seededRandom(seed);
  const random2 = seededRandom(seed * 2);
  
  // 偏移距离：50-200米
  const offsetKm = (random1 * 0.15 + 0.05) / 111;
  // 偏移角度：0-360度
  const angle = random2 * 2 * Math.PI;
  
  const fuzzyLat = lat + offsetKm * Math.cos(angle);
  const fuzzyLng = lng + offsetKm * Math.sin(angle) / Math.cos(lat * Math.PI / 180);
  return { fuzzyLat, fuzzyLng };
}

// 本地敏感词过滤（作为微信审核的补充）
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
    // version 2 返回格式：result.result.suggest
    // suggest: 'pass' 通过, 'risky' 有风险, 'review' 需人工审核
    if (result.result && result.result.suggest) {
      return result.result.suggest === 'pass';
    }
    // 兼容旧版本 API
    return result.errCode === 0;
  } catch (e) {
    console.error('文本审核异常:', e);
    // errCode 87014 表示内容含有违法违规内容
    if (e.errCode === 87014) {
      return false;
    }
    // 其他错误不阻止发布
    return true;
  }
}

// 图片内容安全审核
async function checkImageSecurity(fileID) {
  try {
    const result = await cloud.openapi.security.imgSecCheck({
      media: {
        contentType: 'image/png',
        value: Buffer.from(fileID)
      }
    });
    return result.errCode === 0;
  } catch (e) {
    console.error('图片审核失败:', e);
    // 审核接口失败不阻止发布
    return true;
  }
}

exports.main = async (event, context) => {
  try {
    const { title, desc, mode, price, tradeMethod, images = [], location, addressText = '' } = event || {};
    const wxContext = cloud.getWXContext();
    const openid = wxContext.OPENID;

    if (!title || !desc || !location || !Array.isArray(images) || images.length === 0) {
      return { code: 400, message: 'missing fields' };
    }

    // 获取用户信息
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
      return { code: 401, message: '请先登录后再发布物品' };
    }

    // 内容安全审核
    const textContent = title + ' ' + desc;
    
    // 1. 本地敏感词过滤（优先，更快）
    const localCheck = checkLocalSensitiveWords(textContent);
    if (!localCheck.safe) {
      return { code: 400, message: `内容包含敏感词"${localCheck.word}"，请修改后重试` };
    }
    
    // 2. 微信内容安全 API（更全面，但宽松）
    const textSafe = await checkTextSecurity(textContent);
    if (!textSafe) {
      return { code: 400, message: '内容包含违规信息，请修改后重试' };
    }

    // 图片审核（只审核第一张，避免超限）
    // 注意：个人小程序每日限1000次，建议只在必要时审核
    // const imgSafe = await checkImageSecurity(images[0]);
    // if (!imgSafe) {
    //   return { code: 400, message: '图片包含违规内容，请更换后重试' };
    // }

    // ============================================================
    //  积分系统：发布消耗 + 新用户奖励
    // ============================================================
    const publishStatus = event.status || 'on'

    if (publishStatus === 'on') {
      // 1. 统计用户当前上架物品数量（status='on'）
      const onCountRes = await db.collection('items')
        .where({ authorId: userId, status: 'on' })
        .count()
      const currentOnCount = onCountRes.total

      // 2. 按 N（当前已上架数）确定费用档位
      const getPublishCost = (n) => {
        if (n <= 3) return 0
        if (n === 4) return 10
        if (n === 5) return 20
        if (n === 6) return 35
        return 65
      }
      const cost = getPublishCost(currentOnCount)

      // 4. 消费积分（ENABLE_POINTS 为 false 时跳过）
      if (ENABLE_POINTS && cost > 0) {
        try {
          const consumeRes = await cloud.callFunction({
            name: 'points-service',
            data: {
              action: 'consume',
              params: { type: 'publish', amount: cost }
            }
          })
          const cr = consumeRes.result
          if (cr.code !== 0) {
            return {
              code: 402,
              message: '积分不足',
              data: {
                cost,
                balance: cr.data ? cr.data.balance : 0,
                required: cost
              }
            }
          }
        } catch (e) {
          console.error('积分扣减失败:', e)
          return { code: 500, message: '积分系统异常，请稍后重试' }
        }
      }
    }

    const now = Date.now();
    const expiryDays = 30;
    const expireAt = now + expiryDays * 24 * 60 * 60 * 1000;

    // 位置处理
    const finalLat = Number(location.latitude);
    const finalLng = Number(location.longitude);
    const exactLocationData = {
      lat: Number(location.latitude),
      lng: Number(location.longitude)
    };

    // 逆地理编码获取城市名（异步，不阻塞发布）
    const city = await reverseGeocodeCity(finalLat, finalLng).catch(() => '');

    const doc = {
      title,
      desc,
      mode,
      price: mode === 'sale' ? Number(price || 0) : null,
      negotiable: false,
      tradeMethod,
      lat: finalLat,
      lng: finalLng,
      exactLocation: exactLocationData,
      addressText,
      city: city || '',  // 发布时写入城市名，用于城市级别查询
      images,
      authorId: userId,
      status: publishStatus,
      auditStatus: 'pass',
      counters: { views: 0, favorites: 0, comments: 0 },
      createdAt: now,
      updatedAt: now,
      expireAt,

    };
    const res = await db.collection('items').add({ data: doc });

    // 5. 新用户首次上架奖励（原子标记防并发重复）
    let newUserBonus = false
    try {
      // 原子 CAS：仅在 newUserBonusClaimed 字段不存在时才写入 true
      const claimRes = await db.collection('users')
        .where({
          _id: userId,
          newUserBonusClaimed: _.exists(false)
        })
        .update({
          data: { newUserBonusClaimed: true, updateTime: db.serverDate() }
        })

      // stats.updated === 1 表示我们是第一个写入的（从未领取过）
      if (claimRes.stats && claimRes.stats.updated === 1) {
        await cloud.callFunction({
          name: 'points-service',
          data: {
            action: 'earn',
            params: { type: 'new_user', amount: 50, relatedItemId: res._id }
          }
        })
        newUserBonus = true
      }
    } catch (e) {
      console.error('新用户奖励处理失败:', e)
    }

    return {
      code: 0,
      data: {
        id: res._id,
        newUserBonus,
        bonusAmount: newUserBonus ? 50 : 0
      }
    };
  } catch (e) {
    console.error(e);
    return { code: 500, message: 'server error' };
  }
};