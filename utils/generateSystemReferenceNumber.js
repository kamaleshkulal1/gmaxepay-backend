
const generateSystemReference = () => {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const prefixLength = 5;
  let prefix = '';

  for (let i = 0; i < prefixLength; i++) {
    prefix += characters.charAt(Math.floor(Math.random() * characters.length));
  }

  const number = Math.floor(Math.random() * 100000);
  const paddedNumber = number.toString().padStart(5, '0');

  return `${prefix}${paddedNumber}`;
};

module.exports = {
  generateSystemReference
};
