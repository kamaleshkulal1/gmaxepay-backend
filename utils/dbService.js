/**
 * dbService.js
 * @description: exports all database related methods
 */
const { Op, fn, col } = require('sequelize');

const OPERATORS = [
  '$and',
  '$or',
  '$like',
  '$in',
  '$eq',
  '$gt',
  '$lt',
  '$gte',
  '$lte',
  '$any',
  '$between',
  '$iLike'
];

// create one record
const createOne = async (model, data) => model.create(data);

// create multiple records
const createMany = async (model, data, options = { validate: true }) =>
  model.bulkCreate(data, options);

// update record(s) when query matches
const update = async (model, query, data) => {
  query = queryBuilderParser(query);
  let result = await model.update(data, {
    where: query,
    individualHooks: true
  });
  result = await model.findAll({ where: query });
  return result;
};

// delete record(s) when query matches
const destroy = async (model, query) => {
  query = queryBuilderParser(query);
  const result = await model.findAll({ where: query });
  await model.destroy({ where: query });
  return result;
};

// find single record
const findOne = async (model, query, options = {}) => {
  query = queryBuilderParser(query);
  return model.findOne({
    where: query,
    ...options
  });
};
// find multiple records with pagination
const paginate = async (model, query, options = {}) => {
  query = queryBuilderParser(query);
  // query.isDeleted = false;
  if (options && options.select && options.select.length) {
    options.attributes = options.select;
    delete options.select;
  }
  if (query.startDate && query.endDate) {
    const startDate = new Date(query.startDate);
    startDate.setHours(0, 0, 0, 0);

    const endDate = new Date(query.endDate);
    endDate.setHours(23, 59, 59, 999);

    query.createdAt = {
      [Op.between]: [startDate, endDate]
    };
    delete query.startDate;
    delete query.endDate;
  }
  if (options && options.sort) {
    options.order = sortParser(options.sort);
    delete options.sort;
  }
  if (options && options.include && options.include.length) {
    const include = [];
    options.include.forEach((i) => {
      // i.model = model[i.model];
      if (i.query) {
        i.where = queryBuilderParser(i.query);
      }
      include.push(i);
    });
    options.include = include;
  }
  options = {
    where: query,
    ...options
  };
  const result = await model.paginate(options);
  const data = {
    total: result.total,
    data: result.docs,
    paginator: {
      itemCount: result.total,
      perPage: options.paginate || 25,
      pageCount: result.pages,
      currentPage: options.page || 1
    }
  };
  return data;
};
const smspaginate = async (model, query, options = {}) => {
  query = queryBuilderParser(query);
  if (options && options.select && options.select.length) {
    options.attributes = options.select;
    delete options.select;
  }
  if (options && options.sort) {
    options.order = sortParser(options.sort);
    delete options.sort;
  }
  if (query.startDate && query.endDate) {
    const startDate = new Date(query.startDate);
    startDate.setHours(0, 0, 0, 0);

    const endDate = new Date(query.endDate);
    endDate.setHours(23, 59, 59, 999);

    query.createdAt = {
      [Op.between]: [startDate, endDate]
    };
    delete query.startDate;
    delete query.endDate;
  }
  if (options && options.include && options.include.length) {
    const include = [];
    options.include.forEach((i) => {
      // i.model = model[i.model];
      if (i.query) {
        i.where = queryBuilderParser(i.query);
      }
      include.push(i);
    });
    options.include = include;
  }
  options = {
    where: query,
    ...options
  };
  const result = await model.paginate(options);
  const data = {
    total: result.total,
    data: result.docs,
    paginator: {
      itemCount: result.total,
      perPage: options.paginate || 25,
      pageCount: result.pages,
      currentPage: options.page || 1
    }
  };
  return data;
};
// find multiple records without pagination
const findAll = async (model, query, options = {}) => {
  query = queryBuilderParser(query);
  // query.isDeleted = false;
  if (options && options.select && options.select.length) {
    options.attributes = options.select;
    delete options.select;
  }
  if (options && options.sort) {
    options.order = sortParser(options.sort);
    delete options.sort;
  }
  if (options && options.include && options.include.length) {
    const include = [];
    options.include.forEach((i) => {
      // i.model = models[i.model];
      if (i.query) {
        i.where = queryBuilderParser(i.query);
      }
      include.push(i);
    });
    options.include = include;
  }
  options = {
    where: query,
    ...options
  };
  return model.findAll(options);
};

// count records for specified query
const count = async (model, query, options = {}) => {
  query = queryBuilderParser(query);

  query.isDeleted = { [Op.ne]: true };

  return model.count({
    where: query,
    ...options
  });
};

//
const upsert = async (model, data, options = {}) => model.upsert(data, options);

const increment = async (model, query, field, incrementValue = 1) => {
  // Parse the query to ensure it matches your database structure
  query = queryBuilderParser(query);

  // Set the options for the increment operation
  const options = {
    where: query
  };

  // Perform the increment operation
  return await model.increment(field, { by: incrementValue, ...options });
};

/*
 * @description : parser for query builder
 * @param  {obj} data : {}
 * @return {obj} data : query
 */
const queryBuilderParser = (data) => {
  if (data) {
    Object.entries(data).forEach(([key]) => {
      if (typeof data[key] === 'object') {
        queryBuilderParser(data[key]);
      }
      if (OPERATORS.includes(key)) {
        const opKey = key.replace('$', '');
        data[Op[opKey]] = data[key];
        delete data[key];
      } else if (key === '$ne') {
        data[Op.not] = data[key];
        delete data[key];
      } else if (key === '$nin') {
        data[Op.notIn] = data[key];
        delete data[key];
      }
    });
  }

  return data;
};

/*
 * @description : parser for query builder of sort
 * @param  {obj} input : {}
 * @return {obj} data : query
 */
const sortParser = (input) => {
  const newSortedObject = [];
  if (input) {
    Object.entries(input).forEach(([key, value]) => {
      if (value === 1) {
        newSortedObject.push([key, 'ASC']);
      } else if (value === -1) {
        newSortedObject.push([key, 'DESC']);
      }
    });
  }
  return newSortedObject;
};

// aggregate totals
const aggregateTotals = async (model, columns) => {
  if (!Array.isArray(columns) || columns.length === 0) {
    throw new Error('columns must be a non-empty array');
  }

  const attributes = columns.map((column) => [
    fn('SUM', col(column)),
    `total${column.charAt(0).toUpperCase() + column.slice(1)}`
  ]);

  const result = await model.findAll({
    attributes,
    raw: true
  });

  return result[0];
};

module.exports = {
  createOne,
  createMany,
  update,
  destroy,
  findOne,
  paginate,
  findAll,
  count,
  upsert,
  queryBuilderParser,
  sortParser,
  smspaginate,
  increment,
  aggregateTotals
};
