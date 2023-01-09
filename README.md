# boomp

Dump production data to your local machine like a boss.

* **MySQL - supported**
* MongoDB - in developing
* PostgreSQL - in developing

## Installation

```bash
sudo npm install -g boomdump
```

## Usage

```bash
# Dump all schemas and data
boomp production local

# Specify tables
boomp production local --tables="users balances"
boomp production local --skip-tables="snapshots logs"

# Dump schema only
boomp production local --schema
boomp production local --schema --drop # drop table if exist

# Select by condition 
boomp production local --where="userId=7" --tables="balances purchases"
boomp production local --where="status in ('failed', 'ok')" --tables="transactions"

# You can dump not only from production to local
boomp production stage
boomp stage local
boomp prodreplica local2
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
  }
}
```