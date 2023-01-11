# boomp

Dump production data to your local machine like a boss.

* **MySQL - ready to use**
* **MongoDB - ready to use**
* PostgreSQL - in developing

**Notice:** You must be able to access remote servers via **vpn** or **ssh** using your public key.\
Mysql dumps uses **mysql** command.\
Mongo dumps uses **mongodump** and **mongorestore** commands.


## Installation

```bash
sudo npm install -g boomdump
```

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
# Dump all collections
boomp mongo production local
boomp mongo production local --drop # use for drop and replace

# Specify collections
boomp mongo production local --collections="users balances"
boomp mongo production local --skip-collections="snapshots logs"

# Select by condition
boomp mongo production local --where="{ userId: 7 }" --collections="balances purchases"
boomp mongo production local --where="{ status: $in: [\'failed\', \'ok\'] }" --tables="transactions"

```

## Configs

Place configs to **/boomp** directory\
Use **.js** and **.json** config formats

```bash
/project
  /boomp
    production.js
    stage.js
    local.json
  ...
  README.md
```

### production.json
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