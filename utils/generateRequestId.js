module.exports = function generateRequestId() {
  const now = new Date();
  const year = now.getFullYear().toString().slice(-1);
  const ddd = String(
    Math.floor((now - new Date(now.getFullYear(), 0, 0)) / 86400000)
  ).padStart(3, '0');
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const random = [...Array(27)]
    .map(() => Math.random().toString(36)[2])
    .join('');
  return `${random}${year}${ddd}${hh}${mm}`;
};
