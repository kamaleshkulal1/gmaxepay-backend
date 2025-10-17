const { DataTypes } = require('sequelize');
const sequelize = require('../config/dbConnection');
const sequelizePaginate = require('sequelize-paginate');
const sequelizeTransforms = require('sequelize-transforms');

let EService = sequelize.define(
  'eService',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    service: {
      type: DataTypes.STRING
    },
    isActive: {
      type: DataTypes.BOOLEAN
    }
  },
  {
    freezeTableName: true
  }
);

sequelizeTransforms(EService);
sequelizePaginate.paginate(EService);

sequelize.sync().then(async () => {
  const count = await EService.count();

  if (count === 0) {
    await EService.bulkCreate([
      { service: 'SurePass' },
      { service: 'CashFree' }
    ]);
    console.log('Default services have been created.');
  }
});

module.exports = EService;
