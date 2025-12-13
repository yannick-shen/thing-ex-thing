// 测试云函数入口文件
const cloud = require('wx-server-sdk')

cloud.init({
  env: 'cloud1-3gsbomiw03ea5416'
})

// 云函数入口函数
exports.main = async (event, context) => {
  try {
    console.log('测试云函数被调用')
    const wxContext = cloud.getWXContext()
    
    console.log('WXContext:', wxContext)
    
    return {
      code: 0,
      message: '云函数测试成功',
      data: {
        timestamp: new Date().toISOString(),
        env: 'cloud1-3gsbomiw03ea5416',
        wxContext: {
          OPENID: wxContext.OPENID || '未获取到OPENID',
          APPID: wxContext.APPID || '未获取到APPID',
          UNIONID: wxContext.UNIONID || '未获取到UNIONID'
        }
      }
    }
  } catch (error) {
    console.error('测试云函数失败:', error)
    return {
      code: -1,
      message: '云函数测试失败: ' + error.message,
      error: error
    }
  }
}