const multerLib = require('multer');
const path = require('path');

// Multer configuration for memory storage
const storage = multerLib.memoryStorage();

// Reusable multer configuration with 10MB file size limit
const upload = multerLib({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  },
  fileFilter: function (req, file, callback) {
    const allowedTypes = /jpeg|jpg|png|gif|webp|ico/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    
    // Check MIME type, including special handling for .ico files
    const allowedMimeTypes = /image\/(jpeg|jpg|png|gif|webp|x-icon|vnd\.microsoft\.icon)/;
    const mimetype = allowedMimeTypes.test(file.mimetype);
    
    if (mimetype && extname) {
      return callback(null, true);
    } else {
      callback(new Error('Only image files are allowed!'));
    }
  }
});

// Error handling middleware for multer errors (especially file size)
const multer = (err, req, res, next) => {
  if (err instanceof multerLib.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.failure({
        message: 'File size exceeds the maximum limit of 10MB. Please upload a smaller file.',
        error: err.message
      });
    }
    return res.failure({
      message: 'File upload error: ' + err.message,
      error: err.message
    });
  }
  if (err) {
    return res.failure({
      message: err.message || 'File upload failed',
      error: err.message
    });
  }
  next();
};

module.exports = {
  upload,
  multer
};

