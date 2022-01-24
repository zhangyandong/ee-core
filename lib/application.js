const { app } = require('electron');
const path = require('path');
const EeApp = require('./eeApp');
const debug = require('debug')('Appliaction');

class Appliaction extends EeApp {
  constructor() {
    const { env } = process;

    let options = {
      env: 'prod',
      serverScope: '',
      baseDir: path.join(app.getAppPath(), 'electron'),
      homeDir: process.cwd(),
      framework: path.join(process.cwd(), 'node_modules/ee-core'),
      appName: app.getName(),
      userHome: app.getPath('home'),
      appData: app.getPath('appData'),
      appUserData: app.getPath('userData'),
      logsDir: app.getPath('logs'),
      appVersion: app.getVersion()
    }

    // argv
    for (let i = 0; i < process.argv.length; i++) {
      const tmpArgv = process.argv[i]
      if (tmpArgv.indexOf('--env=') !== -1) {
        options.env = tmpArgv.substring(6)
      }
    }

    // normalize env
    env.NODE_ENV = 'production';
    env.HOME = options.homeDir;
    env.EE_SERVER_ENV = options.env;
    env.EE_SERVER_SCOPE = options.serverScope;
    env.EE_USER_HOME = options.userHome;
    env.EE_APP_DATA = options.appData;
    env.EE_APP_USER_DATA = options.appUserData;
    env.EE_EGG_PORT = null;
    env.EE_IPC_PORT = null;
    debug('options:%j', options)

    super(options);

  }
}

module.exports = Appliaction;