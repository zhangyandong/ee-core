const path = require('path');
const getPort = require('get-port');
const {app, BrowserWindow, BrowserView, Menu} = require('electron');
const BaseApp = require('./baseApp');
const is = require('is-type-of');
const Koa = require('koa');
const koaServe = require('koa-static');

class EeApp extends BaseApp {
  constructor(options = {}) {
    super(options);

    this.electron = {
      mainWindow: null,
      tray: null,
      extra: {
        closeWindow: false,
      }
    };
  }

  /**
   * 生成端口
   */
  async createPorts () {
    const mainPort = await getPort({port: this.config.mainServer.port});
    process.env.EE_MAIN_PORT = mainPort;
    this.config.mainServer.port = mainPort;

    if (this.config.socketServer.enable) {
      const socketPort = await getPort({port: this.config.socketServer.port});
      process.env.EE_SOCKET_PORT = socketPort;
      this.config.socketServer.port = socketPort;
    }
    
    if (this.config.httpServer.enable) {
      const httpPort = await getPort({port: this.config.httpServer.port});
      process.env.EE_HTTP_PORT = httpPort;
      this.config.httpServer.port = httpPort;
    }
    
    // 更新db配置
    this.getCoreDB().setItem('config', this.config);
  }

  /**
   * 启动通信模块
   */
  startSocket () {
    const socket = require('./socket/start');
    socket(this);
  }
  
  /**
   * 创建electron应用
   */
  async createElectronApp () {
    const self = this;

    const gotTheLock = app.requestSingleInstanceLock();
    if (!gotTheLock) {
      await this.appQuit();
      return;
    }

    app.on('second-instance', (event) => {
      self.restoreMainWindow();
    })
  
    app.whenReady().then(() => {
      self.createWindow();
      app.on('activate', function () {
        if (BrowserWindow.getAllWindows().length === 0) {
          self.createWindow();
        }else {
          self.electron.mainWindow?.show();
          self.electron.mainWindow?.focus();
        }
      })
    })
    
    app.on('window-all-closed', function () {
      if (process.platform !== 'darwin') {
        self.coreLogger.info('[Appliaction] [initialize] window-all-closed quit');
        self.appQuit();
      }
    })

    app.on('before-quit', () => {
      self.electron.extra.closeWindow = true;
    })

    await this.electronAppReady();
  }
    
  /**
   * 创建应用主窗口
   */
  async createWindow () {
    const winOptions = this.config.windowsOption;
    this.electron.mainWindow = new BrowserWindow(winOptions);

    // 隐藏菜单
    if (!this.config.openAppMenu) {
      Menu.setApplicationMenu(null);
    }

    this.loadingView(winOptions);

    await this.windowReady();
  
    await this.loderPreload();

    this.selectAppType();

    // DevTools
    if (!app.isPackaged && this.config.openDevTools) {
      this.electron.mainWindow.webContents.openDevTools();
    }
  }

  /**
   * 还原窗口
   */
  restoreMainWindow () {
    if (this.electron.mainWindow) {
      if (this.electron.mainWindow.isMinimized()) {
        this.electron.mainWindow.restore();
      }
      this.electron.mainWindow.show()
    }
  }

  /**
   * 加载已经实现的功能
   */
  async loadPreference () {
    const preferences = require('./preferences');
    return await preferences(this);
  }

  /**
   * 加载loading页面
   */
  loadingView (winOptions) {
    if (!this.config.loadingPage) {
      return;
    }

    const self = this;
    const loadingBrowserView = new BrowserView();
    this.electron.mainWindow.setBrowserView(loadingBrowserView);
    loadingBrowserView.setBounds({
      x: 0,
      y: 0,
      width: winOptions.width,
      height: winOptions.height
    });

    // loading html
    const loadingHtml = path.join('file://', this.config.homeDir, 'public', 'html', 'loading.html');
    loadingBrowserView.webContents.loadURL(loadingHtml);
    this.logger.info('loadingHtml:', loadingHtml);
    
    this.electron.mainWindow.webContents.on('dom-ready', async (event) => {
      self.electron.mainWindow.removeBrowserView(loadingBrowserView);
    });
  }

  /**
   * 应用类型 （远程、html、单页应用）
   */
  selectAppType () {
    let type = '';
    let url = '';

    // 远程模式
    const remoteConfig = this.config.remoteUrl;
    if (remoteConfig.enable == true) {
      type = 'remote_web';
      url = remoteConfig.url;
      this.loadMainUrl(type, url);
      return;
    }

    const protocol = 'http://';
    const developmentModeConfig = this.config.developmentMode;
    const selectMode = developmentModeConfig.default;
    const modeInfo = developmentModeConfig.mode[selectMode];
    let staticDir = null;

    // html模式
    if (selectMode == 'html') {
      if (this.config.env !== 'prod') {
        staticDir = path.join(this.config.homeDir, 'frontend', 'dist');
      }
      this.loadLocalWeb('html', staticDir, modeInfo);
      return;
    }

    // 单页应用
    url = protocol + modeInfo.hostname + ':' + modeInfo.port;
    if (this.config.env !== 'prod') {
      this.loadMainUrl('spa', url);
    } else {
      this.loadLocalWeb('spa');
    }
  }

  /**
   * 加载本地前端资源
   */
  loadLocalWeb (mode, staticDir, hostInfo) {
    const self = this;
    if (!staticDir) {
      staticDir = path.join(this.config.homeDir, 'public', 'dist')
    }

    const koaApp = new Koa();	
    koaApp.use(koaServe(staticDir));

    const mainServer = this.config.mainServer;
    let url = mainServer.protocol + mainServer.host + ':' + mainServer.port;
    if (mode == 'html') {
      url += '/' + hostInfo.indexPage;
    }

    koaApp.listen(mainServer.port, () => {
      self.loadMainUrl(mode, url);
    });
  }

  /**
   * 主页面
   */
  loadMainUrl (type, url) {
    this.logger.info('main page is env: %s, type: %s, App running at: %s', this.config.env, type, url);
    this.electron.mainWindow.loadURL(url);
  }

  /**
   * 限制一个窗口
   */
  // async limitOneWindow () {
  //   const gotTheLock = app.requestSingleInstanceLock();
  //   if (!gotTheLock) {
  //     await this.appQuit();
  //   }
  // }

  /**
   * electron app退出
   */  
  async appQuit () {
    await this.beforeClose();
    
    // 窗口销毁
    //this.electron.mainWindow.close();

    //console.log('Exit now!');
    // 托盘销毁
    // if (this.electron.tray) {
    //   console.log('ssssssssssss');
    //   this.electron.tray.destroy();
    // }

    app.quit();
  }

  /**
   * 预加载模块
   */
  async loderPreload () {
    let filepath = this.loader.resolveModule(path.join(this.config.baseDir, 'preload', 'index'));
    if (!filepath) return; 
    const fileObj = this.loader.loadFile(filepath);
    if (is.function(fileObj) && !is.generatorFunction(fileObj) && !is.asyncFunction(fileObj)) {
      fileObj();
    } else if (is.asyncFunction(fileObj)) {
      await fileObj();
    }
  }  

  /**
   * 序列化参数
   */ 
  stringify(obj, ignore) {
    const result = {};
    Object.keys(obj).forEach(key => {
      if (!ignore.includes(key)) {
        result[key] = obj[key];
      }
    });
    return JSON.stringify(result);
  }

  /**
   * 捕获异常
   */
  catchLog () {
    const self = this;
    process.on('uncaughtException', function(err) {
      self.logger.error(err);
    });
    
    // process.on('SIGINT', function () {
    //   console.log('Exit now!');
    //   self.appQuit();
    //   process.exit();
    // });
  }

  /**
   * electron app已经准备好，主窗口还未创建
   */
  async electronAppReady () {
    // do some things

  }

  /**
   * 主应用窗口已经创建
   */
  async windowReady () {
    // do some things

  }

  /**
   * app关闭之前
   */  
  async beforeClose () {
    // do some things

  }  
}

module.exports = EeApp;