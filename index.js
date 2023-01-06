const optimist = require('optimist');
const boomp = require('./boomp');
const $ = require('./stylize');

const argv = optimist.argv;

optimist
  .usage([
    'Usage:',
    'boomp help',
    'boomp [-hvt]',
    'boomp [env_from] [env_to]'
  ].join('\n      '))
  .describe('h', 'print short help');


if (argv._[0] === 'help') {
  optimist.showHelp();
} else if (argv._.length >= 2) {
  const envFrom = argv._[0];
  const envTo = argv._[1];
  boomp.mysqlDump(envFrom, envTo, argv._.slice(2)).catch(err => {
    console.error($.bold(err));
  });
} else {
  optimist.showHelp();
}

process.on('SIGINT', () => {
  throw new Error('canceled');
});