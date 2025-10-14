/**
 * common.js
 * @description :: exports helper methods for project.
 */

const dbService = require('./dbService');
const { DataTypes } = require('sequelize');

/**
 * convertObjectToEnum : converts object to enum
 * @param {obj} obj : object to be converted
 * @return {array} : converted array
 */

/**
 * randomNumber : generate random numbers for given length
 * @param {number} length : length of random number to be generated (default 4)
 * @return {number} : generated random number
 */
function randomNumber(length = 4) {
  const numbers = '12345678901234567890';
  let result = '';
  for (let i = length; i > 0; i -= 1) {
    result += numbers[Math.round(Math.random() * (numbers.length - 1))];
  }
  return result;
}

/**
 * replaceAll: find and replace all occurrence of a string in a searched string
 * @param {string} string  : string to be replace
 * @param {string} search  : string which you want to replace
 * @param {string} replace : string with which you want to replace a string
 * @return {string} : replaced new string
 */
function replaceAll(string, search, replace) {
  return string.split(search).join(replace);
}

/**
 * uniqueValidation: check unique validation while user registration
 * @param {obj} model : sequelize model instance of table
 * @param {obj} data : data, coming from request
 * @return {boolean} : validation status
 */
async function uniqueValidation(Model, data) {
  let filter = { $or: [] };
  if (data && data['username']) {
    filter.$or.push(
      { username: data['username'] },
      { email: data['username'] }
    );
  }
  if (data && data['email']) {
    filter.$or.push({ username: data['email'] }, { email: data['email'] });
  }
  filter.isActive = true;
  filter.isDeleted = false;
  let found = await dbService.findOne(Model, filter);
  return !found;
}

/**
 * getDifferenceOfTwoDatesInTime : get difference between two dates in time
 * @param {date} currentDate  : current date
 * @param {date} toDate  : future date
 * @return {string} : difference of two date in time
 */
function getDifferenceOfTwoDatesInTime(currentDate, toDate) {
  let hours = toDate.diff(currentDate, 'hour');
  currentDate = currentDate.add(hours, 'hour');
  let minutes = toDate.diff(currentDate, 'minute');
  currentDate = currentDate.add(minutes, 'minute');
  let seconds = toDate.diff(currentDate, 'second');
  currentDate = currentDate.add(seconds, 'second');
  if (hours) {
    return `${hours} hour, ${minutes} minute and ${seconds} second`;
  }
  return `${minutes} minute and ${seconds} second`;
}

/**
 * checkUniqueFieldsInDatabase: check unique fields in database for insert or update operation.
 * @param {Object} model : mongoose model instance of collection
 * @param {Array} fieldsToCheck : array of fields to check in database.
 * @param {Object} data : data to insert or update.
 * @param {String} operation : operation identification.
 * @param {Object} filter : filter for query.
 * @return {Object} : information about duplicate fields.
 */
const checkUniqueFieldsInDatabase = async (
  model,
  fieldsToCheck,
  data,
  operation,
  filter = {}
) => {
  switch (operation) {
    case 'INSERT':
      for (const field of fieldsToCheck) {
        //Add unique field and it's value in filter.
        let query = {
          ...filter,
          isDeleted: false,
          [field]: {
            $like: data[field]
          }
        };
        let found = await dbService.findOne(model, query);
        if (found) {
          return {
            isDuplicate: true,
            field: field,
            value: data[field]
          };
        }
      }
      break;
    case 'BULK_INSERT':
      for (const dataToCheck of data) {
        for (const field of fieldsToCheck) {
          //Add unique field and it's value in filter.
          let query = {
            ...filter,
            isDeleted: false,
            [field]: dataToCheck[field]
          };
          let found = await dbService.findOne(model, query);
          if (found) {
            return {
              isDuplicate: true,
              field: field,
              value: dataToCheck[field]
            };
          }
        }
      }
      break;
    case 'UPDATE':
    case 'BULK_UPDATE':
      for (const field of fieldsToCheck) {
        if (Object.keys(data).includes(field)) {
          let query = {
            ...filter,
            isDeleted: false,
            [field]: {
              $like: data[field]
            }
          };
          let found = await dbService.findOne(model, query);
          if (found) {
            return {
              isDuplicate: true,
              field: field,
              value: data[field]
            };
          }
        }
      }
      break;
    case 'REGISTER':
      for (const field of fieldsToCheck) {
        //Add unique field and it's value in filter.
        let query = {
          ...filter,
          isDeleted: false,
          [field]: {
            $like: data[field]
          }
        };
        let found = await dbService.findOne(model, query);

        if (found) {
          return {
            isDuplicate: true,
            field: field,
            value: data[field]
          };
        }
      }
      break;
      //cross field validation required when login with multiple fields are present, to prevent wrong user logged in.

      let loginFieldFilter = { $or: [] };
      if (data && data['username']) {
        loginFieldFilter[$or].push(
          { username: data['username'] },
          { email: data['username'] }
        );
        loginFieldFilter.isActive = true;
        loginFieldFilter.isDeleted = false;
        let found = await dbService.findOne(model, loginFieldFilter);
        if (found) {
          return {
            isDuplicate: true,
            field: 'username and email',
            value: data['username']
          };
        }
      }
      if (data && data['email']) {
        loginFieldFilter[$or].push(
          { username: data['email'] },
          { email: data['email'] }
        );
        loginFieldFilter.isActive = true;
        loginFieldFilter.isDeleted = false;
        let found = await dbService.findOne(model, loginFieldFilter);
        if (found) {
          return {
            isDuplicate: true,
            field: 'username and email',
            value: data['email']
          };
        }
      }
      break;
    default:
      return { isDuplicate: false };
      break;
  }
  return { isDuplicate: false };
};

const SMScheckUniqueFieldsInDatabase = async (
  model,
  fieldsToCheck,
  data,
  operation,
  filter = {}
) => {
  switch (operation) {
    case 'UPDATE':
    case 'BULK_UPDATE':
      for (const field of fieldsToCheck) {
        if (Object.keys(data).includes(field)) {
          let query = {
            ...filter,
            [field]: {
              $like: data[field]
            }
          };
          let found = await dbService.findOne(model, query);
          if (found) {
            return {
              isDuplicate: true,
              field: field,
              value: data[field]
            };
          }
        }
      }
      break;
    case 'REGISTER':
      for (const field of fieldsToCheck) {
        //Add unique field and it's value in filter.
        let query = {
          ...filter,
          [field]: {
            $like: data[field]
          }
        };
        let found = await dbService.findOne(model, query);

        if (found) {
          return {
            isDuplicate: true,
            field: field,
            value: data[field]
          };
        }
      }
      break;
    default:
      return { isDuplicate: false };
      break;
  }
  return { isDuplicate: false };
};

const reusableModelAttribute = {
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  isDeleted: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  createdAt: { type: DataTypes.DATE },
  updatedAt: { type: DataTypes.DATE },
  addedBy: { type: DataTypes.INTEGER },
  updatedBy: { type: DataTypes.INTEGER },
  type: { type: DataTypes.INTEGER }
};

function convertObjectToEnum(obj) {
  const enumArr = [];
  Object.values(obj).map((val) => enumArr.push(val));
  return enumArr;
}
function convertObjectToString(obj) {
  return JSON.stringify(obj);
}

const reusableSMSAttribute = {
  isActive: { type: DataTypes.BOOLEAN },
  isDefault: { type: DataTypes.BOOLEAN },
  isDelete: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  createdAt: { type: DataTypes.DATE },
  updatedAt: { type: DataTypes.DATE },
  addedBy: { type: DataTypes.INTEGER },
  updatedBy: { type: DataTypes.INTEGER },
  type: { type: DataTypes.INTEGER }
};
const reusableTransactionAttribute = {
  isActive: { type: DataTypes.BOOLEAN },
  isDefault: { type: DataTypes.BOOLEAN },
  isSwitch: { type: DataTypes.BOOLEAN },
  createdAt: { type: DataTypes.DATE },
  updatedAt: { type: DataTypes.DATE },
  addedBy: { type: DataTypes.INTEGER },
  updatedBy: { type: DataTypes.INTEGER },
  type: { type: DataTypes.INTEGER }
};

const reusableAttributes = {
  isActive: { type: DataTypes.BOOLEAN },
  createdAt: { type: DataTypes.DATE },
  updatedAt: { type: DataTypes.DATE },
  addedBy: { type: DataTypes.INTEGER }
};

module.exports = {
  randomNumber,
  replaceAll,
  uniqueValidation,
  getDifferenceOfTwoDatesInTime,
  checkUniqueFieldsInDatabase,
  SMScheckUniqueFieldsInDatabase,
  reusableModelAttribute,
  reusableSMSAttribute,
  reusableTransactionAttribute,
  reusableAttributes,
  convertObjectToEnum,
  convertObjectToString
};
