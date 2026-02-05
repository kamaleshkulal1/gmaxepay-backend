const multerLib = require('multer');
const path = require('path');

// Multer configuration for memory storage
const storage = multerLib.memoryStorage();

// File filter function
const fileFilter = function (req, file, callback) {
  const allowedTypes = /jpeg|jpg|png|gif|webp|ico|svg/;
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  
  // Check MIME type, including special handling for .ico and .svg files
  const allowedMimeTypes = /image\/(jpeg|jpg|png|gif|webp|x-icon|vnd\.microsoft\.icon|svg\+xml)|application\/image|text\/plain/;
  const mimetype = allowedMimeTypes.test(file.mimetype) || 
                   (path.extname(file.originalname).toLowerCase() === '.svg');
  
  if ((mimetype || extname === '.svg') && extname) {
    return callback(null, true);
  } else {
    callback(new Error('Only image files (including SVG) are allowed!'));
  }
};

// Base multer configuration with 10MB file size limit
const multerConfig = {
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  },
  fileFilter: fileFilter
};

// Reusable multer instance
const upload = multerLib(multerConfig);

// Helper function for single file upload
const uploadSingle = (fieldName) => {
  return upload.single(fieldName);
};

// Helper function for multiple files upload (same field name)
const uploadMultiple = (fieldName, maxCount = 10) => {
  return upload.array(fieldName, maxCount);
};

// Helper function for multiple fields upload (different field names)
const uploadFields = (fields) => {
  // Store expected field names in req for error handling
  const expectedFieldNames = fields.map(f => f.name);
  const middleware = upload.fields(fields);
  
  return (req, res, next) => {
    // Store expected fields on request object for error handling
    req.expectedFields = expectedFieldNames;
    // Call the multer middleware
    middleware(req, res, (err) => {
      // If there's an error, attach expected fields to error object for better error handling
      if (err && err instanceof multerLib.MulterError) {
        err.expectedFields = expectedFieldNames;
      }
      next(err);
    });
  };
};

// Error handling middleware for multer errors (especially file size)
const multer = (err, req, res, next) => {
  if (err instanceof multerLib.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.failure({
        message: 'File size exceeds the maximum limit of 10MB. Please upload a smaller file.',
        error: err.message
      });
    }
    if (err.code === 'LIMIT_FILE_COUNT') {
      return res.failure({
        message: 'Too many files uploaded. Please reduce the number of files.',
        error: err.message
      });
    }
    if (err.code === 'LIMIT_UNEXPECTED_FILE') {
      // Get expected field names from error object or request
      const expectedFields = err.expectedFields || req.expectedFields || [];
      const receivedField = err.field || 'unknown';
      const trimmedField = receivedField.trim();
      
      // Check if the issue is just whitespace
      const hasWhitespace = receivedField !== trimmedField;
      const matchesAfterTrim = expectedFields.includes(trimmedField);
      
      let errorMessage = `Unexpected file field "${receivedField}".`;
      let helpfulHint = '';
      
      if (hasWhitespace && matchesAfterTrim) {
        helpfulHint = ` The field name "${receivedField}" has extra spaces. Use "${trimmedField}" instead (no leading/trailing spaces).`;
      } else {
        const expectedFieldsMsg = expectedFields.length > 0 
          ? ` Expected field names: ${expectedFields.join(', ')}.`
          : ' Please check the API documentation for correct field names.';
        helpfulHint = expectedFieldsMsg;
      }
      
      // Log the error for debugging
      console.error('Multer LIMIT_UNEXPECTED_FILE error:', {
        message: err.message,
        receivedField: receivedField,
        trimmedField: trimmedField,
        hasWhitespace: hasWhitespace,
        matchesAfterTrim: matchesAfterTrim,
        expectedFields: expectedFields,
        url: req.url,
        method: req.method
      });
      
      return res.failure({
        message: errorMessage + helpfulHint,
        error: err.message,
        receivedField: receivedField,
        trimmedField: hasWhitespace ? trimmedField : undefined,
        expectedFields: expectedFields.length > 0 ? expectedFields : undefined,
        hint: hasWhitespace ? 'Remove leading/trailing spaces from field names in your request' : undefined
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
  uploadSingle,
  uploadMultiple,
  uploadFields,
  multer
};

