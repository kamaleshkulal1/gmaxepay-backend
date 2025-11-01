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

// SECURITY: Enhanced file upload validation
let uploadKyc = multer({
  storage: storage,
  fileFilter: function (req, file, callback) {
    // SECURITY: Whitelist only safe image MIME types (removed application/octet-stream)
    const allowedMimeTypes = [
      'image/png',
      'image/jpg',
      'image/jpeg',
      'image/gif'
    ];
    
    // SECURITY: Validate both MIME type and file extension
    const fileExtension = path.extname(file.originalname).toLowerCase();
    const allowedExtensions = ['.png', '.jpg', '.jpeg', '.gif'];
    
    if (allowedMimeTypes.includes(file.mimetype) && allowedExtensions.includes(fileExtension)) {
      callback(null, true);
    } else {
      console.warn(`SECURITY: Blocked file upload - MIME: ${file.mimetype}, Extension: ${fileExtension}`);
      callback(new Error('Only PNG, JPG, JPEG, and GIF images are allowed!'), false);
    }
  },
  limits: {
    fileSize: 5 * 1024 * 1024, // SECURITY: Reduced to 5MB (was 20MB)
    files: 5 // Maximum 5 files per request
  }
});

module.exports = uploadKyc;
