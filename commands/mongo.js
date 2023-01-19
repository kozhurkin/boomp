const vm = require('vm');
const os = require('os');
const { Cmd } = require('../cmd');
const { MONGO_DUMP_DIR } = require('../constants');

const USERNAME = process.env.USER;
const HOSTNAME = os.hostname();

class Mongo extends Cmd {
  constructor() {
    super()
    //
  }

  #parseWhere(where) {
    try {
      const context = vm.runInNewContext(`where = ${where}`, {});
      return JSON.stringify(context)
    } catch(e) {
      console.error(e);
      throw new Error('--where parse error');
    }
  }

  // #addslashes(str) {
  //   return str
  //     // .replace(/\'/g,'\\\'')
  //     // .replace(/\0/g,'\\0')
  //     .replace(/\\/g,'\\\\')
  //     .replace(/"/g,'\\"')
  //     .replace(/\$/g, '\\\$');
  // }

  async mongoDump(envFrom, envTo, options){

    const exportConfig = this.getEnv(envFrom);
    const importConfig = this.getEnv(envTo);

    if (importConfig.isProductionEnv()) {
      throw 'Deny dump to production!';
    }

    const exportMongo = exportConfig.validateMongo();
    const importMongo = importConfig.validateMongo();

    await this.switchEnv(envFrom);

    //
    let collections = options['collections'] || options['collection'];
    collections     = collections ? collections.split(/[\s,]+/g) : [];
    let where       = options['where'] ? `-q '${this.#parseWhere(options['where'])}'` : '';
    let drop        = options['drop'];

    let dumpName = [
      'dump',
      envFrom,
      exportMongo.database,
      new Date().toISOString().slice(0, 19),
      `${USERNAME}@${HOSTNAME}`,
    ].join('.')

    const makeDumpDir = async() => {
      await this.sshif(`mkdir -p ${MONGO_DUMP_DIR}/${dumpName}`);
    }

    const removeDumpDir = async () => {
      await this.sshif(`rm -rf ${MONGO_DUMP_DIR}/${dumpName}*`);
    }

    const cleanup = async () => {
      // cleanup broken dumps
      await this.sshif(`find ${MONGO_DUMP_DIR}/ -mindepth 1 -maxdepth 1 -name "dump.*" -mmin +300 | xargs rm -rf`);
    }

    await makeDumpDir();

    // control size of dump dir
    await this.dirSizeControl(MONGO_DUMP_DIR, 30);

    console.log('\n// DUMP FROM %s TO %s', envFrom, envTo);

    console.log('\n// EXPORT DATA');

    for (let collection of collections) {
      await this.sshif(`mongodump ${exportConfig.mongoconn()} -c ${collection} ${where} --out ${MONGO_DUMP_DIR}/${dumpName}`);
    }

    const importDump = async() => {
      console.log('\n// IMPORT DATA');
      await this.sshif(
        `cd ${MONGO_DUMP_DIR}`,
        `mongorestore ${importConfig.mongoconn()} ${drop ? '--drop' : ''} ${dumpName}/${exportMongo.database}`,
      );
    }

    const clearTemp = async() => {
      console.log(`\n// CLEAR ${this.env} TEMP`);
      await removeDumpDir();
      await cleanup();
    }

    await this.sshif(
      `cd ${MONGO_DUMP_DIR}/${dumpName}`,
      `tar -zcvf ../${dumpName}.tar.gz ./`
    );

    await this.sshif(`du -sh ${MONGO_DUMP_DIR}/${dumpName}.tar.gz`);

    console.log('\n// MOVE DATA');

    // catch home dir from export env (before switch)
    let exportHome = (await this.sshif('echo $HOME')).trim();

    // switch env to import side
    await this.switchEnv(envTo);

    // create dump dir
    await makeDumpDir();

    if (this.isSameServer(envFrom, envTo)) {
      const exportDir = MONGO_DUMP_DIR.replace('~', exportHome);
      const tarGz = `${exportDir}/${dumpName}.tar.gz`;
      const isExist = await this.sshif(`test -f ${tarGz} && echo "FILE exists."`);
      if (!isExist) {
        await this.sshif(`cp -R ${exportDir}/${dumpName}.tar.gz ${MONGO_DUMP_DIR}/`);
      }
    } else if (this.isLocalEnv(envTo)) {

      await this.cmd(`rsync -av --progress -e 'ssh -p ${exportConfig.port}' ${exportConfig.user}@${exportConfig.host}:${MONGO_DUMP_DIR}/${dumpName}.tar.gz ${MONGO_DUMP_DIR}/`);

    } else {

      // await this.sshif(`rsync -av --progress -e 'ssh -p ${exportConfig.port}' ${exportConfig.user}@${exportConfig.host}:${MONGO_DUMP_DIR}/${dumpName}.tar.gz ${MONGO_DUMP_DIR}/`);

      await this.cmd(`rsync -av --progress -e 'ssh -p ${exportConfig.port}' ${exportConfig.user}@${exportConfig.host}:${MONGO_DUMP_DIR}/${dumpName}.tar.gz ${MONGO_DUMP_DIR}/`);
      await this.cmd(`rsync -av --progress -e 'ssh -p ${importConfig.port}' ${MONGO_DUMP_DIR}/${dumpName}.tar.gz ${importConfig.user}@${importConfig.host}:${MONGO_DUMP_DIR}/`);
    }

    await this.sshif(
      `tar -xvzf ${MONGO_DUMP_DIR}/${dumpName}.tar.gz -C ${MONGO_DUMP_DIR}/${dumpName}`,
      `rm ${MONGO_DUMP_DIR}/${dumpName}.tar.gz`
    );

    // import dump
    await importDump();

    // clear temporary dirs and files on the import side
    await clearTemp();

    // switch env to export side
    await this.switchEnv(envFrom);

    // clear temporary dirs and files on the export side
    await clearTemp();
  }
}

module.exports = { Mongo }
