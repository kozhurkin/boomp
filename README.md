# boomp

Dump production data to your local machine like a boss.

* **MySQL - ready to use**
* **MongoDB - ready to use**
* PostgreSQL - in developing

## Installation

```bash
sudo npm install -g boomdump
```

## How it works

Imagine that you are dumping data from production to a local machine.

`
boomp mysql production local
`

1) First, boomp connects via **ssh** to the **production** server.
2) And creates a temporary dump directory in the user's **home** directory.
3) Then it **dumps** the data to that directory and archives the directory.
4) Using the **rsync** utility, the archived dump is coping to your **local** home directory.
5) The dump file is unpacked and **imported** into the database.
6) All temporary directories on the production and local server are **cleared**. Done.

You have production data in your local database. Enjoy!

**Notice 1:** You must be able to access remote servers via **vpn** or **ssh** using your public key.\
**Notice 2:** Mysql dumps uses **mysql** command. Mongo dumps uses **mongodump** and **mongorestore** commands.

## Usage
```
Usage:
      boomp help [command]
      boomp mysql [from_env] [to_env]
      boomp mongo [from_env] [to_env]

Options:
  -h  print help

```

#### boomp mysql

```bash
# Dump all schemas and data
boomp mysql production local

# Specify tables
boomp mysql production local --tables="users balances"
boomp mysql production local --skip-tables="snapshots logs"

# Dump schema only
boomp mysql production local --schema
boomp mysql production local --schema --drop # drop table if exist

# Select by condition 
boomp mysql production local --where="userId=7" --tables="balances purchases"
boomp mysql production local --where="status in ('failed', 'ok')" --tables="transactions"

# You can dump not only from production to local
boomp mysql production stage
boomp mysql stage local
boomp mysql prodreplica local2
```

#### boomp mongo

```bash
# Specify collections
boomp mongo production local --collections="users balances"

# Select by condition
boomp mongo production local --where="{ userId: 7 }" --collections="balances purchases"
boomp mongo production local --where="{ status: $in: ['failed', 'ok'] }" --tables="transactions"

```

## Configs

Place config files in the **/boomp** directory.\
Use **.js** and **.json** config formats.

```bash
/project
  /boomp
    production.js
    stage.js
    local.json
  ...
  README.md
```

### production.js
```javascript
// require mysql settings from main config
const { mysql } = require('../config/production.json');

module.exports = {
  host : 'logr.info',
  user : 'dima',
  port : 22,
  mysql: {
    host     : mysql.host,
    username : mysql.username,
    password : mysql.password,
    database : mysql.database,
  },
  mongo: {
    host     : "my.mongodb.net",
    username : "myuser",
    database : "mydb",
    password : "qwerty123",
  }
}
```

### local.json
```json
{
  "mysql": {
    "host": "127.0.0.1",
    "username": "root",
    "password": "123",
    "database": "thehatdb"
  },
  "mongo": {
    "host": "localhost",
    "database": "mydb"
  }
}
```