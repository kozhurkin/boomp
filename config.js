const _ = require('lodash');
const path = require('path');

class Config {
  constructor(env) {
    const configpath = path.resolve(process.cwd(), './boomp', env);
    const config = require(configpath);
    this.env = env;
    Object.assign(this, config);
  }
  isLocalEnv() {
    if (this.env.includes('local')) {
      return true;
    }
    if (!this.host) {
      return true;
    }
    return ['localhost', '127.0.0.1'].includes(this.host);
  }
  isProductionEnv() {
    return this.production || this.env.includes('prod');
  }
  mysqlconn(withDb = true) {
    const { host, port, username, password, database } = this.mysql;
    return _.compact([
      '--force',
      '--host=' + host,
      port ? '--port=' + port : null,
      '--user=' + username,
      '--password=' + password,
      withDb ? database : null,
    ]).join(' ');
  }
  mongoconn(){
    let { host, username, password, database } = this.mongo;
    let opts = [];
    const split = host.split('://');
    if (split.length === 1) {
      host = `mongodb://${host}`;
    }
    opts.push(`"${host}/${database}"`);
    if (username) opts.push(`-u=${username}`);
    if (password) opts.push(`-p=${password}`);
    return opts.join(' ');
  }
  validateMysql() {
    const settings = this.mysql || {};
    if (!settings.host || !settings.database) {
      throw `Bad mysql-settings in ${this.env}-config.`;
    }
    return settings;
  }
  validateMongo() {
    const settings = this.mongo || {};
    if (!settings.host || !settings.database) {
      throw `Bad mongo-settings in ${this.env}-config.`;
    }
    return settings;
  }
}

class ConfigManger {
  env = null
  config = null
  getEnv(env) {
    return new Config(env);
  }
  switchEnv(env) {
    this.env = env;
    this.config = this.getEnv(env);
  }
  isLocalEnv(env) {
    return this.getEnv(env).isLocalEnv();
  }
  isProductionEnv(env) {
    return this.getEnv(env).isProductionEnv();
  }
  isSameServer(env1, env2) {
    const config1 = this.getEnv(env1);
    const config2 = this.getEnv(env2);
    return config1.host === config2.host || (config1.isLocalEnv() && config2.isLocalEnv());
  }
}

module.exports = { Config, ConfigManger }