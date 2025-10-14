
const generateSystemReference = () => {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const prefixLength = 5; // length of the prefix
  let prefix = '';

  // Generate random uppercase prefix
  for (let i = 0; i < prefixLength; i++) {
    prefix += characters.charAt(Math.floor(Math.random() * characters.length));
  }

  // Generate a random 4-digit number and pad it
  const number = Math.floor(Math.random() * 100000);
  const paddedNumber = number.toString().padStart(5, '0');

  return `${prefix}${paddedNumber}`;
};

module.exports = {
    generateSystemReference
};
