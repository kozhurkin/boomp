const optimist = require('optimist');
const $ = require('../stylize');


class Help {
  showHelp(command) {
    switch(command) {
      case 'mysql': {
        console.log('');
        console.log($.darkgray('# Dump all schemas and data'));
        console.log('boomp mysql production local');

        console.log('');
        console.log($.darkgray('# Specify tables'));
        console.log('boomp mysql production local --tables="users balances"');
        console.log('boomp mysql production local --skip-tables="snapshots logs"');

        console.log('');
        console.log($.darkgray('# Dump schema only'));
        console.log('boomp mysql production local --schema');
        console.log('boomp mysql production local --schema --drop # drop table if exist');

        console.log('');
        console.log($.darkgray('# Select by condition'));
        console.log('boomp mysql production local --where="userId=7" --tables="balances purchases"');
        console.log('boomp mysql production local --where="status in (\'failed\', \'ok\')" --tables="transactions"');

        console.log('');
        break;
      }
      case 'mongo': {
        // console.log('');
        // console.log($.darkgray('# Dump all collections'));
        // console.log('boomp mongo production local');
        // console.log('boomp mongo production local --drop', $.darkgray('# use for drop and replace'));

        console.log('');
        console.log($.darkgray('# Specify collections'));
        console.log('boomp mongo production local --collections="users balances"');
        // console.log('boomp mongo production local --skip-collections="snapshots logs"');

        console.log('');
        console.log($.darkgray('# Select by condition'));
        console.log('boomp mongo production local --where="{ userId: 7 }" --collections="balances purchases"');
        console.log('boomp mongo production local --where="{ status: $in: [\'failed\', \'ok\'] }" --tables="transactions"');

        console.log('');
        break;
      }
      default: {
        optimist.showHelp();
        break;
      }
    }
  }
}

module.exports = { Help }
