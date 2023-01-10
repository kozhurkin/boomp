const os = require('os');
const $ = require('./stylize');
const spawnProcess = require('./spawnProcess');
const { ConfigManger } = require('./config');

const USERNAME = process.env.USER;
const HOSTNAME = os.hostname();

class Cmd extends ConfigManger {
  constructor() {
    super()
    //
  }

  #hidePass(str) {
    str = str.replace(/(\s--password=)[^\s]+/g, '$1***');
    str = str.replace(/(https?:\/\/)(.*)(@.*)/g, '$1***:***$3');
    return str;
  }

  async ssh(...cmd) {
    cmd = cmd.join('\n');
    const { user, host, port } = this.config;
    console.log($.bold($.blue(user + '@' + host)) + ' :> ' + $.yellow(this.#hidePass(cmd)));
    return spawnProcess('ssh', [`-p ${port}`, `${user}@${host}`, cmd]);
  }

  async local(...cmd) {
    cmd = cmd.join('\n');
    console.log($.bold($.blue(`${USERNAME}@${HOSTNAME}`)) + ' :> ' + $.lightmagenta(this.#hidePass(cmd)));
    return spawnProcess('sh', ['-c', cmd]);
  }

  async lazySsh(...args) {
    if (this.config.isLocalEnv()) {
      return this.local(...args);
    } else {
      return this.ssh(...args);
    }
  }
}

module.exports = { Cmd };