const os = require('os');
const _ = require('lodash');
const $ = require('../stylize');
const { Cmd } = require('../cmd');
const { MYSQL_DUMP_DIR } = require('../constants');

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

    let drop = options['drop'];
    let where = options['where'];
    let schema = options['schema'] || options['schema-only'];
    if (!schema && !where) {
      drop = true;
    }
    let tables = options['table'] || options['tables'];
    tables = typeof tables === 'string' ? tables.split(/[\s,]+/g) : [];

    let skiptables = options['skip-table'] || options['skip-tables'];
    skiptables = typeof skiptables === 'string' ? skiptables.split(/[\s,]+/g) : [];

    if (tables.length === 0) {
      const select = `SELECT group_concat(distinct TABLE_NAME) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = '${exportMysql.database}'`;
      const out = await this.sshif(`mysql ${exportConfig.mysqlconn()} -e ${JSON.stringify(select)}`);
      tables = out.split('\n')[1].split(',');
    }

    if (skiptables.length !== 0) {
      tables = _.difference(tables, skiptables);
    }

    await this.makeDumpDir(dumpName);

    // control size of dump dir
    await this.dirSizeControl(MYSQL_DUMP_DIR, 50);

    console.log($.bold(`\n# DUMP FROM ${envFrom} TO ${envTo}`));

    console.log($.bold('\n# EXPORT DATA\n'));

    const mysqldump = `mysqldump --disable-keys --single-transaction --quick ${exportConfig.mysqlconn()}`;
    {
      const sed__IF_NOT_EXISTS = 'sed "s/CREATE TABLE /CREATE TABLE IF NOT EXISTS /g"';
      let args = [
        '--no-data',
        drop ? '' : '--skip-add-drop-table',
        ...tables,
      ].join(' ');
      await this.sshif(`${mysqldump} ${args} | ${sed__IF_NOT_EXISTS} > ${MYSQL_DUMP_DIR}/${dumpName}/schema.sql`);
    }
    if (!schema) {
      const args = [
        '--max_allowed_packet=256M',
        '--no-create-info',
        '--skip-triggers',
        '--no-create-db',
        where ? `--where="${where}"` : '',
        ...tables,
      ].join(' ');
      await this.sshif(`${mysqldump} ${args} >> ${MYSQL_DUMP_DIR}/${dumpName}/data.sql`);
    }

    await this.sshif(
      `cd ${MYSQL_DUMP_DIR}/${dumpName}`,
      `tar -zcvf ../${dumpName}.tar.gz ./`
    );

    const importDump = async () => {
      console.log($.bold('\n# IMPORT DATA\n'));

      // unzip
      await this.sshif(`tar -xvzf ${MYSQL_DUMP_DIR}/${dumpName}.tar.gz -C ${MYSQL_DUMP_DIR}/${dumpName}`);

      // create database if not exist
      await this.sshif(`mysql ${importConfig.mysqlconn(false)} -e \"CREATE DATABASE IF NOT EXISTS ${importMysql.database}\"`);

      // push schema and data into db
      if (tables.length) {
        await this.sshif(`cat ${MYSQL_DUMP_DIR}/${dumpName}/schema.sql | mysql ${importConfig.mysqlconn()}`);
        if (where && !schema && !drop) {
          console.log($.bold('\n# DELETE ROWS BY WHERE'));
          const deleteQuery = tables.map(table => `DELETE FROM ${table} WHERE ${where}`);
          await this.sshif(`mysql ${importConfig.mysqlconn()} -e \"${deleteQuery.join('; ')}\"`);
        }
        if (!schema) {
          await this.sshif(`cat ${MYSQL_DUMP_DIR}/${dumpName}/data.sql | mysql ${importConfig.mysqlconn()}`);
        }
      }
    };

    console.log($.bold('\n# MOVE DATA\n'));

    // catch home dir from export env (before switch)
    let exportHome = (await this.sshif('echo $HOME')).trim();

    // switch env to import side
    this.switchEnv(envTo);

    // create dump dir
    await this.makeDumpDir(dumpName);

    if (this.isSameServer(envFrom, envTo)) {
      const exportDir = MYSQL_DUMP_DIR.replace('~', exportHome);
      const tarGz = `${exportDir}/${dumpName}.tar.gz`;
      const isExist = await this.sshif(`test -f ${tarGz} && echo "FILE exists."`);
      if (!isExist) {
        await this.sshif(`cp ${tarGz} ${MYSQL_DUMP_DIR}/`);
      }
    } else if (this.isLocalEnv(envTo)) {
      await this.cmd(
        `rsync -av --progress -e 'ssh -p ${exportConfig.port}' ${exportConfig.user}@${exportConfig.host}:${MYSQL_DUMP_DIR}/${dumpName}.tar.gz ${MYSQL_DUMP_DIR}/`
      );
    } else {
      await this.cmd(`mkdir -p ${MYSQL_DUMP_DIR}`);

      await this.cmd(
        `rsync -av --progress -e 'ssh -p ${exportConfig.port}' ${exportConfig.user}@${exportConfig.host}:${MYSQL_DUMP_DIR}/${dumpName}.tar.gz ${MYSQL_DUMP_DIR}`
      );

      await this.cmd(
        `rsync -av --progress -e 'ssh -p ${importConfig.port}' ${MYSQL_DUMP_DIR}/${dumpName}.tar.gz ${importConfig.user}@${importConfig.host}:${MYSQL_DUMP_DIR}/`
      );

      await this.cmd(`rm -f ${MYSQL_DUMP_DIR}/${dumpName}.tar.gz`);
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
    await this.sshif(`mkdir -p ${MYSQL_DUMP_DIR}/${dumpName}`);
  }

  async clearTemp(dumpName) {
    console.log($.bold(`\n# CLEAR ${this.env} TEMP\n`));
    await this.sshif(`rm -rf ${MYSQL_DUMP_DIR}/${dumpName}*`);
    // cleanup broken dumps
    await this.sshif(`find ${MYSQL_DUMP_DIR}/ -mindepth 1 -maxdepth 1 -name "dump_*" -mmin +300 | xargs rm -rf`);
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
    let fields = await this.sshif(`mysql ${mysqlconn(mysql)} -e ${JSON.stringify(select)}`);
    fields = fields.split('\n')[1].split(',');
    let replacedFields = fields.map(value => {
      if (!fieldsForReplace[value]) return value;
      return fieldsForReplace[value];
    });
    return `SELECT ${replacedFields.join(', ')} FROM ${mysql.database}.${tableName}`;
  }
}

module.exports = { Mysql }
