const authManager = require('../../utils/auth.js');

Component({
  properties: {
    show: {
      type: Boolean,
      value: false
    },
    title: {
      type: String,
      value: '需要登录'
    },
    content: {
      type: String,
      value: '登录后可以更好地使用此功能'
    }
  },

  data: {
    
  },

  methods: {
    // 关闭弹窗
    close() {
      this.triggerEvent('close');
    },

    // 跳转登录
    goToLogin() {
      // 获取当前页面路径用于重定向
      const pages = getCurrentPages();
      const currentPage = pages[pages.length - 1];
      const currentRoute = '/' + currentPage.route;
      
      this.close();
      
      wx.navigateTo({
        url: '/pages/login/login?redirect=' + encodeURIComponent(currentRoute)
      });
    },

    // 阻止点击穿透
    stopPropagation() {
      // 阻止事件冒泡
    }
  }
})