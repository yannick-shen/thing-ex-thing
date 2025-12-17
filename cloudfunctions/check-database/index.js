const cloud = require('wx-server-sdk');
cloud.init({ env: 'cloud1-3gsbomiw03ea5416' });
const db = cloud.database();

exports.main = async (event, context) => {
  try {
    console.log('开始检查数据库状态');
    const wxContext = cloud.getWXContext();
    
    let result = {
      users: [],
      items: [],
      favorites: [],
      currentUser: wxContext.OPENID ? '已登录' : '未登录'
    };
    
    // 检查用户集合
    try {
      const usersRes = await db.collection('users').limit(5).get();
      result.users = usersRes.data.map(u => ({
        _id: u._id,
        openid: u.openid ? u.openid.substring(0, 10) + '...' : 'none',
        nickName: u.nickName || 'none',
        createTime: u.createdAt || 'none'
      }));
      console.log('用户数据:', result.users.length, '条');
    } catch (e) {
      result.usersError = e.message;
      console.error('获取用户数据失败:', e);
    }
    
    // 检查物品集合
    try {
      const itemsRes = await db.collection('items').limit(5).get();
      result.items = itemsRes.data.map(i => ({
        _id: i._id,
        title: i.title || 'none',
        status: i.status || 'none',
        authorId: i.authorId ? i.authorId.substring(0, 10) + '...' : 'none',
        createTime: i.createdAt || 'none'
      }));
      console.log('物品数据:', result.items.length, '条');
    } catch (e) {
      result.itemsError = e.message;
      console.error('获取物品数据失败:', e);
    }
    
    // 检查收藏集合
    try {
      const favoritesRes = await db.collection('favorites').limit(5).get();
      result.favorites = favoritesRes.data.map(f => ({
        _id: f._id,
        userId: f.userId ? f.userId.substring(0, 10) + '...' : 'none',
        itemId: f.itemId || 'none',
        createTime: f.createdAt || 'none'
      }));
      console.log('收藏数据:', result.favorites.length, '条');
    } catch (e) {
      result.favoritesError = e.message;
      console.error('获取收藏数据失败:', e);
    }
    
    return { 
      code: 0, 
      message: '数据库检查完成',
      data: result 
    };
  } catch (e) {
    console.error('检查数据库失败:', e);
    return { 
      code: 500, 
      message: 'server error: ' + e.message 
    };
  }
};