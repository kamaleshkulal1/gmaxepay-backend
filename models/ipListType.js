const { DataTypes } = require('sequelize');
const sequelize = require('../config/dbConnection');
const sequelizePaginate = require('sequelize-paginate');
const sequelizeTransforms = require('sequelize-transforms');

let IpListType = sequelize.define(
  'ipListType',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    ipType: {
      type: DataTypes.STRING,
      allowNull: false
    }
  },
  {
    freezeTableName: true,
    timestamps: true
  }
);

sequelizeTransforms(IpListType);
sequelizePaginate.paginate(IpListType);

// sequelize.sync().then(async () => {
//   const count = await IpListType.count();

//   if (count === 0) {
//     await IpListType.bulkCreate([
//       { ipType: 'Attendance IP' },
//       { ipType: 'API IP' },
//       { ipType: 'CallBack IP' },
//       { ipType: 'LongBack IP' },
//       { ipType: 'Shopping IP' }
//     ]);
//     console.log('Default Ip List have been created.');
//   }
// });

module.exports = IpListType;
