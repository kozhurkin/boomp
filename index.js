const optimist = require('optimist');
const { Mysql } = require('./commands/mysql');
const { Mongo } = require('./commands/mongo');
const { Help } = require('./commands/help');
const { Config } = require('./config');
const $ = require('./stylize');

const argv = optimist.argv;

optimist
  .usage([
    'Usage:',
    'boomp help [command]',
    'boomp mysql [from_env] [to_env]',
    'boomp mongo [from_env] [to_env]',
  ].join('\n      '))
  .describe('h', 'print help');



Promise.resolve().then(async () => {
  const [param0, param1, param2] = argv._;
  const [command, sub] = (param0 || '').split(':');

  switch(command) {
    case 'help': {
      new Help().showHelp(param1);
      break;
    }
    case 'mysql': {
      const task = new Mysql()
      await task.mysqlDump(param1, param2, argv);
      break;
    }
    case 'mongo': {
      const task = new Mongo()
      await task.mongoDump(param1, param2, argv);
      break;
    }
    default: {
      try {
        new Config(param0) // check config exist
        const task = new Mysql()
        await task.mysqlDump(param0, param1, argv);
      } catch (e) {
        optimist.showHelp();
      }
    }
  }
}).catch(err => {
  console.error($.bold(err));
  console.error(err.stack);
})

process.on('SIGINT', () => {
  throw new Error('canceled');
});