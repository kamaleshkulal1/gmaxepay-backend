const fs = require('fs');
const mime = require('mime-types');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const model = require('../models');
const File = model.File;
const dotenv = require('dotenv');
dotenv.config({ path: './config.env' });
const dayjs = require('dayjs');
const { S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, NODE_ENV, S3_REGION } =
  process.env;

const s3Client = new S3Client({
  region: S3_REGION,
  credentials: {
    accessKeyId: S3_ACCESS_KEY_ID,
    secretAccessKey: S3_SECRET_ACCESS_KEY,
  }
});
/**
 * upload File
 * @param {file} file
 * @returns {Promise<File>}
 */
const uploadFile = async (file, id) => {
  const fileContent = fs.readFileSync(file.path);
  const params = {
    Bucket: process.env.AWS_BUCKET,
    Key: `${process.env.AWS_FOLDER}/${file.filename}`, // File name you want to save as in S3
    Body: fileContent,
    ContentType: file.mimetype,
    key: function (req, file, cb) {
      const folderPath = `${process.env.AWS_FOLDER}/${file.path}`;
      cb(null, folderPath + id + '.pdf');
    }
  };
  try {
    return await s3Client.send(new PutObjectCommand(params));
  } catch (error) {
    console.log(error);
  }
};

const uploadBinaryFiles = async (file, filename) => {
  const params = {
    Bucket: process.env.AWS_BUCKET,
    Key: `${process.env.AWS_FOLDER}/${file.filename}`, // File name you want to save as in S3
    Body: file.buffer,
    ContentType: file.mimetype,
    key: function (req, file, cb) {
      const folderPath = `${process.env.AWS_FOLDER}/${file.path}`; // Set the folder path here
      const fileName = filename;
      cb(null, folderPath + fileName);
    }
  };
  try {
    return await s3Client.send(new PutObjectCommand(params));
  } catch (error) {
    console.log(error);
  }
};

module.exports = {
  uploadFile,
  uploadBinaryFiles
};
