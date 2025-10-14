const crypto = require('crypto');

const generateTransactionID = () => {
  const randomID = crypto.randomBytes(3).toString('hex').toUpperCase();

  const now = new Date();
  const formattedDate =
    now.toISOString().slice(2, 10).replace(/-/g, '') + // YYMMDD
    now.toISOString().slice(11, 13) + // HH
    now.toISOString().slice(14, 16); // MM

  const transactionID = 'GP' + formattedDate + randomID;

  return transactionID;
};

module.exports = {
  generateTransactionID
};
