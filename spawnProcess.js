const cp = require('child_process');

module.exports = async function spawnProcess(command, options) {
  return new Promise((resolve, reject) => {
    let child = cp.spawn(command, options);

    let stderr = [];
    child.stderr.on('data', chunk => {
      process.stderr.write(chunk.toString());
      stderr.push(chunk.toString());
    });

    let stdout = [];
    child.stdout.on('data', chunk => {
      process.stdout.write(chunk.toString());
      stdout.push(chunk.toString());
    });

    child.stdout.on('end', () => {
      // console.log('spawnProcess: END')
    });

    child.on('exit', (code, signal) => {
      // console.log('EXIT CODE:', code, signal);
      let err = code || signal ? new Error(code || signal) : null;
      setImmediate(() => {
        if (err) {
          return reject(err);
        }
        resolve(stdout.join(''));
      });
    });
  });
};
