const os = require('os');
const _ = require('lodash');
const { argv } = require('optimist');
const $ = require('../stylize');
const { Cmd } = require('../cmd');

const DUMP_DIR = '~/.boomp/dumps';
const MYSQL_DUMP_DIR = `${DUMP_DIR}/mysql`;
const USERNAME = process.env.USER;
const HOSTNAME = os.hostname();

class Mysql extends Cmd {
  constructor() {
    super()
    //
  }
  async mysqlDump(envFrom, envTo, options = {}) {
    const exportConfig = this.getEnv(envFrom);
    const importConfig = this.getEnv(envTo);

    if (importConfig.isProductionEnv()) {
      throw 'Deny dump to production!';
    }

    const exportMysql = exportConfig.validateMysql();
    const importMysql = importConfig.validateMysql();

    this.switchEnv(envFrom);

    const dumpName = [
      'dump',
      envFrom,
      exportMysql.database,
      new Date().toISOString().slice(0, 19),
      `${USERNAME}@${HOSTNAME}`,
    ].join('_');

    let drop = argv['drop'];
    let where = argv['where'];
    let schema = argv['schema'] || argv['schema-only'];
    if (!schema && !where) {
      drop = true;
    }
    let tables = argv['table'] || argv['tables'];
    tables = typeof tables === 'string' ? tables.split(/[\s,]+/g) : [];

    let skiptables = argv['skip-table'] || argv['skip-tables'];
    skiptables = typeof skiptables === 'string' ? skiptables.split(/[\s,]+/g) : [];

    if (tables.length === 0) {
      const select = `SELECT group_concat(distinct TABLE_NAME) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = '${exportMysql.database}'`;
      const out = await this.lazySsh(`mysql ${exportConfig.mysqlconn()} -e ${JSON.stringify(select)}`);
      tables = out.split('\n')[1].split(',');
    }

    if (skiptables.length !== 0) {
      tables = _.difference(tables, skiptables);
    }

    // // add tables specified by pattern
    // tables = await (async (result = []) => {
    //   for (let table of tables) {
    //     if (table.indexOf('%') !== -1) {
    //       let out = await this.lazySsh(`mysql ${exportConfig.mysqlconn()} -e "SHOW TABLES LIKE '${table}'"`);
    //       result.concat(out.split('\n').slice(1, -1));
    //     }
    //   }
    //   return result;
    // })();

    // let secretSelects = {};
    // if (!schema) {
    //   const rest = [];
    //   for (let table of tables) {
    //     let select = await this.selectBuilder(table, options.restrictions);
    //     if (typeof select === 'string') {
    //       secretSelects[table] = select;
    //     } else if (select === -1) {
    //       console.log($.bold(`Skipping forbidden table «${table}»`));
    //     } else {
    //       rest.push(table);
    //     }
    //   }
    //   tables = rest;
    // }

    let mysqldumpArgs = '--max_allowed_packet=512M ';
    if (!drop) {
      mysqldumpArgs += '--skip-add-drop-table ';
    }
    if (schema) {
      mysqldumpArgs += '--no-data ';
    }
    if (where) {
      mysqldumpArgs += `--where="${where}" `;
    }
    mysqldumpArgs += tables.join(' ');

    await this.makeDumpDir(dumpName);

    // control size of dump dir
    await this.dirSizeControl(MYSQL_DUMP_DIR, 50);

    console.log($.bold(`\n# DUMP FROM ${envFrom} TO ${envTo}`));

    console.log($.bold('\n# EXPORT DATA\n'));

    await this.lazySsh(`mysqldump --disable-keys --single-transaction --quick ${exportConfig.mysqlconn()} ${mysqldumpArgs} > ${MYSQL_DUMP_DIR}/${dumpName}/dump.sql`);

    // for (let tableName in secretSelects) {
    //   const select = secretSelects[tableName];
    //   await this.lazySsh(`mysql ${exportConfig.mysqlconn()} -e ${JSON.stringify(select)} -N | less | sed \"s/	NULL/	\\\\\\N/g\" > ${MYSQL_DUMP_DIR}/${dumpName}/${tableName}.rows`);
    //   await this.lazySsh(`mysqldump ${exportConfig.mysqlconn()} ${tableName} --single-transaction ${drop ? '' : '--skip-add-drop-table'} --no-data > ${MYSQL_DUMP_DIR}/${dumpName}/${tableName}.schema`);
    // }

    await this.lazySsh(
      `cd ${MYSQL_DUMP_DIR}/${dumpName}`,
      `tar -zcvf ../${dumpName}.tar.gz ./`
    );

    const importDump = async () => {
      if (!schema && !drop && tables.length && where) {
        console.log($.bold('\n# DELETE ROWS BY WHERE'));
        const deleteQuery = tables.map(table => `DELETE FROM ${table} WHERE ${where}`);
        await this.lazySsh(`mysql ${importConfig.mysqlconn()} -e \"${deleteQuery.join('; ')}\"`);
      }

      console.log($.bold('\n# IMPORT DATA\n'));

      // unzip
      await this.lazySsh(`tar -xvzf ${MYSQL_DUMP_DIR}/${dumpName}.tar.gz -C ${MYSQL_DUMP_DIR}/${dumpName}`);

      // create database if not exist
      await this.lazySsh(`mysql ${importConfig.mysqlconn(false)} -e \"CREATE DATABASE IF NOT EXISTS ${importMysql.database}\"`);

      // push schema and data into db
      const sed__IF_NOT_EXISTS = 'sed "s/CREATE TABLE /CREATE TABLE IF NOT EXISTS /g"';
      if (tables.length) {
        await this.lazySsh(`cat ${MYSQL_DUMP_DIR}/${dumpName}/dump.sql | ${sed__IF_NOT_EXISTS} | mysql ${importConfig.mysqlconn()}`);
      }

      // for (const tableName in secretSelects) {
      //   await this.lazySsh(`cat ${MYSQL_DUMP_DIR}/${dumpName}/${tableName}.schema | ${sed__IF_NOT_EXISTS} | mysql ${importConfig.mysqlconn()}`);
      //   await this.lazySsh(`mysqlimport ${importConfig.mysqlconn()} \'${MYSQL_DUMP_DIR}/${dumpName}/${tableName}.rows\' --local`);
      // }
    };

    console.log($.bold('\n# MOVE DATA\n'));

    // catch home dir from export env
    let exportHome = (await this.lazySsh('echo $HOME')).trim();

    // switch env to import side
    this.switchEnv(envTo);

    // create dump dir
    await this.makeDumpDir(dumpName);

    if (this.isSameServer(envFrom, envTo)) {
      const exportDir = MYSQL_DUMP_DIR.replace('~', exportHome);
      const tarGz = `${exportDir}/${dumpName}.tar.gz`;
      const isExist = await this.lazySsh(`test -f ${tarGz} && echo "FILE exists."`);
      if (!isExist) {
        await this.lazySsh(`cp ${tarGz} ${MYSQL_DUMP_DIR}/`);
      }
    } else if (this.isLocalEnv(envTo)) {
      await this.local(
        `rsync -av --progress -e 'ssh -p ${exportConfig.port}' ${exportConfig.user}@${exportConfig.host}:${MYSQL_DUMP_DIR}/${dumpName}.tar.gz ${MYSQL_DUMP_DIR}/`
      );
    } else {
      await this.local(`mkdir -p ${MYSQL_DUMP_DIR}`);

      await this.local(
        `rsync -av --progress -e 'ssh -p ${exportConfig.port}' ${exportConfig.user}@${exportConfig.host}:${MYSQL_DUMP_DIR}/${dumpName}.tar.gz ${MYSQL_DUMP_DIR}`
      );

      await this.local(
        `rsync -av --progress -e 'ssh -p ${importConfig.port}' ${MYSQL_DUMP_DIR}/${dumpName}.tar.gz ${importConfig.user}@${importConfig.host}:${MYSQL_DUMP_DIR}/`
      );

      await this.local(`rm -f ${MYSQL_DUMP_DIR}/${dumpName}.tar.gz`);
    }

    // import dump
    await importDump();

    // clear temporary dirs and files on the import side
    await this.clearTemp(dumpName);

    // switch env to export side
    this.switchEnv(envFrom);

    // clear temporary dirs and files on the export side
    await this.clearTemp(dumpName);
  }

  async makeDumpDir(dumpName) {
    await this.lazySsh(`mkdir -p ${MYSQL_DUMP_DIR}/${dumpName}`);
  }

  async clearTemp(dumpName) {
    console.log($.bold(`\n# CLEAR ${this.env} TEMP\n`));
    await this.lazySsh(`rm -rf ${MYSQL_DUMP_DIR}/${dumpName}*`);
    // cleanup broken dumps
    await this.lazySsh(`find ${MYSQL_DUMP_DIR}/ -mindepth 1 -maxdepth 1 -name "dump_*" -mmin +300 | xargs rm -rf`);
  }

  async dirSizeControl(dir, limit) {
    const out = await this.lazySsh(`du -s ${dir}`);
    const size = +out.split(/\s/)[0];
    // if temporary files have accumulated on limit GB
    if (size > limit * 1024 * 1024) {
      throw `«${$.bold(dir)}» more than ${limit} Gb!`;
    }
  }

  async selectBuilder(tableName, restrictions) {
    let { mysql } = this.config;
    let fieldsForReplace = restrictions ? restrictions[tableName] : null;
    if (!fieldsForReplace) {
      return false;
    }
    if (fieldsForReplace === -1) {
      return -1;
    }
    const select = `SELECT group_concat(COLUMN_NAME) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = '${mysql.database}' AND TABLE_NAME = '${tableName}'`;
    let fields = await this.lazySsh(`mysql ${mysqlconn(mysql)} -e ${JSON.stringify(select)}`);
    fields = fields.split('\n')[1].split(',');
    let replacedFields = fields.map(value => {
      if (!fieldsForReplace[value]) return value;
      return fieldsForReplace[value];
    });
    return `SELECT ${replacedFields.join(', ')} FROM ${mysql.database}.${tableName}`;
  }
}

module.exports = { Mysql }
