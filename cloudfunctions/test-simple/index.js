const cloud = require('wx-server-sdk');
cloud.init({ env: 'cloud1-3gsbomiw03ea5416' });

exports.main = async (event, context) => {
  console.log('测试云函数被调用');
  return {
    code: 0,
    message: '测试成功',
    data: {
      timestamp: new Date().toISOString(),
      env: cloud.getWXContext()
    }
  };
};