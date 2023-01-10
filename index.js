const optimist = require('optimist');
const { Mysql } = require('./commands/mysql');
const $ = require('./stylize');

const argv = optimist.argv;

optimist
  .usage([
    'Usage:',
    'boomp help',
    'boomp [env_from] [env_to]'
  ].join('\n      '))
  .describe('h', 'print help');


if (argv._[0] === 'help') {
  optimist.showHelp();
} else if (argv._.length >= 2) {
  const envFrom = argv._[0];
  const envTo = argv._[1];
  const task = new Mysql()
  task.mysqlDump(envFrom, envTo, argv._.slice(2)).catch(err => {
    console.error($.bold(err));
    console.error(err.stack);
  });
} else {
  optimist.showHelp();
}

process.on('SIGINT', () => {
  throw new Error('canceled');
});