const _ = require('lodash');

module.exports = {
  hidePass(str) {
    str = str.replace(/(\s--password=)[^\s]+/g, '$1***');
    str = str.replace(/(https?:\/\/)(.*)(@.*)/g, '$1***:***$3');
    return str;
  },
  mysqlconn({ host, username, password, database }, withDb = true) {
    return _.compact([
      '--force',
      '--host=' + host,
      '--user=' + username,
      '--password=' + password,
      withDb ? database : null,
    ]).join(' ');
  }
};