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

// NOTE: Model syncing should be handled centrally, not in individual model files
// The sync() call was removed to prevent database timeout issues during startup
// If you need to seed default data, use a seeder script or initialization function
// Example initialization function (call manually when needed):
/*
async function initializeEServices() {
  try {
    const count = await EService.count();
    if (count === 0) {
      await EService.bulkCreate([
        { service: 'SurePass' },
        { service: 'CashFree' }
      ]);
      console.log('Default services have been created.');
    }
  } catch (error) {
    console.error('Error initializing EServices:', error);
  }
}
*/

module.exports = EService;
