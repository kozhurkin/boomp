const _ = require('lodash');
const os = require('os');
const path = require('path');
const { argv } = require('optimist');
const $ = require('./stylize');
const spawnProcess = require('./spawnProcess');
const { hidePass, mysqlconn } = require('./helpers');

const DUMP_DIR = '~/.boomp/dumps';
const MYSQL_DUMP_DIR = `${DUMP_DIR}/mysql`;
const USERNAME = process.env.USER;
const HOSTNAME = os.hostname();

module.exports = {
  env: null,
  config: null,

  async ssh(...cmd) {
    cmd = cmd.join('\n');
    const { user, host, port } = this.config;
    console.log($.bold($.blue(user + '@' + host)) + ' :> ' + $.yellow(hidePass(cmd)));
    return spawnProcess('ssh', [`-p ${port}`, `${user}@${host}`, cmd]);
  },
  async local(...cmd) {
    cmd = cmd.join('\n');
    console.log($.bold($.blue(`${USERNAME}@${HOSTNAME}`)) + ' :> ' + $.lightmagenta(hidePass(cmd)));
    return spawnProcess('sh', ['-c', cmd]);
  },
  getEnv(env) {
    const configpath = path.resolve(process.cwd(), './boomp', env);
    return require(configpath);
  },
  switchEnv(env) {
    this.env = env;
    this.config = this.getEnv(env);
  },
  help() {
    console.log('help');
  },
  async lazySsh(...args) {
    if (this.env.includes('local')) {
      return this.local(...args);
    } else {
      return this.ssh(...args);
    }
  },
  async mysqlDump(envFrom, envTo, options = {}) {
    if (envTo.includes('prod')) {
      throw 'Deny dump to production!';
    }

    const exportConfig = this.getEnv(envFrom);
    const importConfig = this.getEnv(envTo);

    const exportMysql = exportConfig.mysql || {};
    const importMysql = importConfig.mysql || {};

    if (!exportMysql.host || !exportMysql.database) throw `Bad mysql-settings in ${envFrom}-config.`;
    if (!importMysql.host || !importMysql.database) throw `Bad mysql-settings in ${envTo}-config.`;

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
      // throw 'Please specify --tables argument';
      const select = `SELECT group_concat(distinct TABLE_NAME) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = '${exportMysql.database}'`;
      const out = await this.lazySsh(`mysql ${mysqlconn(exportMysql)} -e ${JSON.stringify(select)}`);
      tables = out.split('\n')[1].split(',');
    }

    if (skiptables.length !== 0) {
      tables = _.difference(tables, skiptables);
    }

    // // обрабатываем таблицы указанные через шаблон
    // tables = await (async (result = []) => {
    //   for (let table of tables) {
    //     if (table.indexOf('%') !== -1) {
    //       let out = await this.lazySsh(`mysql ${mysqlconn(exportMysql)} -e "SHOW TABLES LIKE '${table}'"`);
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

    // проверяем не заполнилась ли папка с дампами
    await this.dirSizeControl(MYSQL_DUMP_DIR, 50);

    console.log($.bold(`\n# DUMP FROM ${envFrom} TO ${envTo}`));

    console.log($.bold('\n# EXPORT DATA\n'));

    await this.lazySsh(`mysqldump --disable-keys --single-transaction --quick ${mysqlconn(exportMysql)} ${mysqldumpArgs} > ${MYSQL_DUMP_DIR}/${dumpName}/dump.sql`);

    // for (let tableName in secretSelects) {
    //   const select = secretSelects[tableName];
    //   await this.lazySsh(`mysql ${mysqlconn(exportMysql)} -e ${JSON.stringify(select)} -N | less | sed \"s/	NULL/	\\\\\\N/g\" > ${MYSQL_DUMP_DIR}/${dumpName}/${tableName}.rows`);
    //   await this.lazySsh(`mysqldump ${mysqlconn(exportMysql)} ${tableName} --single-transaction ${drop ? '' : '--skip-add-drop-table'} --no-data > ${MYSQL_DUMP_DIR}/${dumpName}/${tableName}.schema`);
    // }

    await this.lazySsh(
      `cd ${MYSQL_DUMP_DIR}/${dumpName}`,
      `tar -zcvf ../${dumpName}.tar.gz ./`
    );

    const importDump = async () => {
      if (!schema && !drop && tables.length && where) {
        console.log($.bold('\n# DELETE ROWS BY WHERE'));
        const deleteQuery = tables.map(table => `DELETE FROM ${table} WHERE ${where}`);
        await this.lazySsh(`mysql ${mysqlconn(importMysql)} -e \"${deleteQuery.join('; ')}\"`);
      }

      console.log($.bold('\n# IMPORT DATA\n'));

      // распаковываем архив
      await this.lazySsh(`tar -xvzf ${MYSQL_DUMP_DIR}/${dumpName}.tar.gz -C ${MYSQL_DUMP_DIR}/${dumpName}`);

      // создаем базу если ее нет
      await this.lazySsh(`mysql ${mysqlconn(importMysql, false)} -e \"CREATE DATABASE IF NOT EXISTS ${importMysql.database}\"`);

      // заливаем схемы и данные
      const sed__IF_NOT_EXISTS = 'sed "s/CREATE TABLE /CREATE TABLE IF NOT EXISTS /g"';
      if (tables.length) {
        await this.lazySsh(`cat ${MYSQL_DUMP_DIR}/${dumpName}/dump.sql | ${sed__IF_NOT_EXISTS} | mysql ${mysqlconn(importMysql)}`);
      }

      // for (const tableName in secretSelects) {
      //   await this.lazySsh(`cat ${MYSQL_DUMP_DIR}/${dumpName}/${tableName}.schema | ${sed__IF_NOT_EXISTS} | mysql ${mysqlconn(importMysql)}`);
      //   await this.lazySsh(`mysqlimport ${mysqlconn(importMysql)} \'${MYSQL_DUMP_DIR}/${dumpName}/${tableName}.rows\' --local`);
      // }
    };

    console.log($.bold('\n# MOVE DATA\n'));

    // catch home dir from export env
    let exportHome = (await this.lazySsh('echo $HOME')).trim();

    // преключаем окружение на envTo, все операции будем делать с него
    this.switchEnv(envTo);

    // создаем папку для дампа
    await this.makeDumpDir(dumpName);

    let isOneServer = (importConfig.host === exportConfig.host) || (this.isLocalEnv(envFrom) && this.isLocalEnv(envTo));
    if (isOneServer) {
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

    // Импортируем данные
    await importDump();

    // Чистим временные папки в импорт-окружении
    await this.clearTemp(dumpName);

    // Переключаемся в экспорт-окружение
    this.switchEnv(envFrom);

    // Чистим временные папки в экспорт-окружении
    await this.clearTemp(dumpName);
  },

  isLocalEnv(env) {
    if (env.includes('local')) {
      return true;
    }
    const { host } = this.getEnv(env);
    if (!host) {
      return true;
    }
    return ['localhost', '127.0.0.1'].includes(host);

  },

  async makeDumpDir(dumpName) {
    await this.lazySsh(`mkdir -p ${MYSQL_DUMP_DIR}/${dumpName}`);
  },

  async clearTemp(dumpName) {
    console.log($.bold(`\n# CLEAR ${this.env} TEMP\n`));
    await this.lazySsh(`rm -rf ${MYSQL_DUMP_DIR}/${dumpName}*`);
    // очистка прерванных дампов
    await this.lazySsh(`find ${MYSQL_DUMP_DIR}/ -mindepth 1 -maxdepth 1 -name "dump_*" -mmin +300 | xargs rm -rf`);
  },

  async dirSizeControl(dir, limit) {
    const out = await this.lazySsh(`du -s ${dir}`);
    const size = +out.split(/\s/)[0];
    // если временных файлов скопилось на limit Гб
    if (size > limit * 1024 * 1024) {
      throw `«${$.bold(dir)}» more than ${limit} Gb!`;
    }
  },

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
  },
};
