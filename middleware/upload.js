let path = require('path');
const multer = require('multer');

/*
 *Upload Images of Admin Profile
 */

let storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads');
  },
  filename: function (req, file, cb) {
    let ext = path.extname(file.originalname);
    cb(null, Date.now() + ext);
  }
});

let uploadKyc = multer({
  storage: storage,
  fileFilter: function (req, file, callback) {
    if (
      file.mimetype == 'image/png' ||
      file.mimetype == 'image/jpg' ||
      file.mimetype == 'image/jpeg' ||
      file.mimetype == 'image/gif' ||
      file.mimetype == 'application/octet-stream'
    ) {
      callback(null, true);
    } else {
      console.log('Only jpeg and png extension allowed !');
      callback(null, false);
    }
  },
  limits: {
    fileSize: 1024 * 1024 * 20
  }
});

module.exports = uploadKyc;
