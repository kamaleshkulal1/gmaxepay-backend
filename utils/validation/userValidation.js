/**
 * userValidation.js
 * @description :: validate each post and put request as per user model
 */

const joi = require('joi');
const {
  options,
  isCountOnly,
  include,
  select
} = require('./commonFilterValidation');

const { USER_TYPES } = require('../../constants/authConstant');
const { convertObjectToEnum } = require('../common');

const authConstantDefault = require('../../constants/authConstant');

/** validation keys and properties of user */
exports.schemaKeys = joi
  .object({
    mobileNo: joi.string().required(),
    otpMobile: joi.string().allow(null).allow(''),
    password: joi.string().required(),
    email: joi.string().required(),
    otpEmail: joi.string().allow(null).allow(''),
    name: joi.string().required(),
    userRole: joi.string().required(),
    city: joi.string().required(),
    state: joi.string().required(),
    zipcode: joi.string().required(),
    country: joi.string().required(),
    isActive: joi.boolean(),
    isDeleted: joi.boolean()
  })
  .unknown(true);

/** validation keys and properties of user for updation */
exports.updateSchemaKeys = joi
  .object({
    mobileNo: joi.string().allow(null).allow(''),
    otpMobile: joi.string().allow(null).allow(''),
    password: joi.string().allow(null).allow(''),
    email: joi.string().allow(null).allow('').lowercase().email(),
    otpEmail: joi.string().allow(null).allow('').email(),
    name: joi.string().allow(null).allow(''),
    companyName: joi.string().allow(null).allow(''),
    city: joi.string().allow(null).allow(''),
    state: joi.string().allow(null).allow(''),
    zipcode: joi.string().allow(null).allow(''),
    country: joi.string().allow(null).allow(''),
    is2FAenabled: joi.boolean(),
    isActive: joi.boolean(),
    isDeleted: joi.boolean(),
    id: joi.number().integer()
  })
  .unknown(true);

let keys = ['query', 'where'];
/** validation keys and properties of user for filter documents from collection */
exports.findFilterKeys = joi
  .object({
    options: options,
    ...Object.fromEntries(
      keys.map((key) => [
        key,
        joi
          .object({
            mobileNo: joi.string().allow(null).allow(''),
            otpMobile: joi.string().allow(null).allow(''),
            password: joi.string().allow(null).allow(''),
            email: joi.string().allow(null).allow('').email(),
            otpEmail: joi.string().allow(null).allow('').email(),
            name: joi.string().allow(null).allow(''),
            companyName: joi.string().allow(null).allow(''),
            city: joi.string().allow(null).allow(''),
            state: joi.string().allow(null).allow(''),
            zipcode: joi.string().allow(null).allow(''),
            country: joi.string().allow(null).allow(''),
            isActive: joi.boolean(),
            isDeleted: joi
              .alternatives()
              .try(joi.array().items(), joi.boolean(), joi.object()),
            id: joi.any()
          })
          .unknown(true)
      ])
    ),
    isCountOnly: isCountOnly,
    include: joi.array().items(include),
    select: select
  })
  .unknown(true);
