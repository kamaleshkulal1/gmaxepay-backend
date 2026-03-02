const { DataTypes } = require('sequelize');
const sequelize = require('../config/dbConnection');
const sequelizePaginate = require('sequelize-paginate');
const sequelizeTransforms = require('sequelize-transforms');
const { reusableSMSAttribute } = require('../utils/common');

let Operator = sequelize.define(
  'operator',
  {
    operatorName: {
      type: DataTypes.STRING,
      allowNull: false
    },
    operatorCode: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: false
    },
    custConvFee: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: 0
    },
    flatFee: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    isCCF1Category: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    percentFee: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    gstRate: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    commSettingType: {
      type: DataTypes.STRING
    },
    allowedChannel: {
      type: DataTypes.STRING
    },
    length: {
      type: DataTypes.INTEGER
    },
    maxLength: {
      type: DataTypes.INTEGER
    },
    operatorType: {
      type: DataTypes.STRING
    },
    businessModel: {
      type: DataTypes.STRING
    },
    minValue: {
      type: DataTypes.INTEGER
    },
    maxValue: {
      type: DataTypes.INTEGER
    },
    hsnCode: {
      type: DataTypes.STRING
    },
    startWithValue: {
      type: DataTypes.STRING
    },
    isAccountNumeric: {
      type: DataTypes.BOOLEAN
    },
    isBBPS: {
      type: DataTypes.BOOLEAN
    },
    accountName: {
      type: DataTypes.STRING
    },
    accountRemark: {
      type: DataTypes.STRING
    },
    isBillingAllowed: {
      type: DataTypes.BOOLEAN
    },
    exactness: {
      type: DataTypes.STRING
    },
    inSlab: {
      type: DataTypes.BOOLEAN
    },
    isTakeCustomerNum: {
      type: DataTypes.BOOLEAN
    },
    image: {
      type: DataTypes.JSON
    },
    tollFree: {
      type: DataTypes.STRING
    },
    comm: {
      type: DataTypes.FLOAT,
      defaultValue: 0
    },
    commType: {
      type: DataTypes.STRING,
      allowNull: true,
      validate: {
        isIn: [['com', 'sur']]
      }
    },
    amtType: {
      type: DataTypes.STRING,
      allowNull: true,
      validate: {
        isIn: [['fix', 'per']]
      }
    },
    billerId: {
      type: DataTypes.STRING
    },
    planService: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    circleValidationType: {
      type: DataTypes.STRING,
      allowNull: true,
      validate: {
        isIn: [['NO', 'API', 'TABLE']]
      }
    },
    // --- AEPS commercials (optional; can be null) ---
    // Store per-transaction commercial amounts (simple fixed values).
    // Used by AEPS transaction controller to credit retailer AEPS wallet and write AEPS history.
    superadminComm: {
      type: DataTypes.FLOAT,
      allowNull: true
    },
    whitelabelComm: {
      type: DataTypes.FLOAT,
      allowNull: true
    },
    masterDistributorCom: {
      type: DataTypes.FLOAT,
      allowNull: true
    },
    masterDistrbutorCom: {
      type: DataTypes.FLOAT,
      allowNull: true
    },
    distributorCom: {
      type: DataTypes.FLOAT,
      allowNull: true
    },
    retailerCom: {
      type: DataTypes.FLOAT,
      allowNull: true
    },
    // Typo-friendly alias
    reatilerCom: {
      type: DataTypes.FLOAT,
      allowNull: true
    },
    ...reusableSMSAttribute
  },
  {
    freezeTableName: true,
    indexes: [
      {
        unique: true,
        fields: ['operatorCode', 'operatorType']
      }
    ]
  }
);

sequelizeTransforms(Operator);
sequelizePaginate.paginate(Operator);
module.exports = Operator;
