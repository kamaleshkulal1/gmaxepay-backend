const model = require('../../../models');
const dbService = require('../../../utils/dbService');
const imageService = require('../../../services/imageService');
const { uploadImageToS3, deleteImageFromS3, getImageUrl, getImageFromS3 } = imageService;

/**
 * Upload image
 * @description Upload image to S3 and save metadata to database
 */
const uploadImage = async (req, res) => {
  try {
    const { name, type, subtype } = req.body;
    const companyId = req.user?.companyId || null;
    const userId = req.user?.id;

    if (!req.file) {
      return res.failure({ message: 'Image file is required' });
    }

    if (!type || !name) {
      return res.failure({ message: 'Name and type are required' });
    }

    // Validate type
    const validTypes = ['loginSlider', 'signature'];
    if (!validTypes.includes(type)) {
      return res.failure({ message: 'Invalid type. Must be loginSlider or signature' });
    }

    // Validate subtype for signature type
    if (type === 'signature') {
      const validSubtypes = ['logo', 'stamp', 'signature'];
      if (!subtype || !validSubtypes.includes(subtype)) {
        return res.failure({ message: 'Subtype is required for signature type. Must be logo, stamp, or signature' });
      }
    }

    // For signature type, check if image already exists (only one allowed per subtype)
    if (type === 'signature' && subtype) {
      const existingImage = await dbService.findOne(model.companyImage, {
        type: 'signature',
        subtype,
        companyId,
        isActive: true
      });

      if (existingImage) {
        // Delete old image from S3
        await deleteImageFromS3(existingImage.s3Key);
        // Mark old image as inactive
        await dbService.update(model.companyImage, 
          { id: existingImage.id }, 
          { isActive: false }
        );
      }
    }

    // Upload image to S3
    const fileBuffer = req.file.buffer;
    const fileName = req.file.originalname;
    const uploadResult = await uploadImageToS3(fileBuffer, fileName, type, companyId, subtype);

    // Save metadata to database
    const imageData = {
      name,
      image: uploadResult.url,
      s3Key: uploadResult.key,
      type,
      subtype: subtype || null,
      companyId,
      userId,
      isActive: true
    };

    const savedImage = await dbService.createOne(model.companyImage, imageData);

    return res.success({
      message: 'Image uploaded successfully',
      data: {
        ...savedImage.toJSON(),
        imageUrl: getImageUrl(savedImage.image)
      }
    });
  } catch (error) {
    console.error('Error uploading image:', error);
    return res.failure({ message: error.message });
  }
};

/**
 * Get all images
 * @description Get all images for a company with optional filters
 */
const getAllImages = async (req, res) => {
  try {
    const { type, subtype } = req.query;
    const companyId = req.user?.companyId || null;

    const whereClause = {
      companyId,
      isActive: true
    };

    if (type) {
      whereClause.type = type;
    }

    if (subtype) {
      whereClause.subtype = subtype;
    }

    const images = await dbService.findAll(model.companyImage, whereClause, {
      order: [['createdAt', 'DESC']]
    });

    // Add backend IP to image URLs
    const imagesWithBackendIP = images.map(img => ({
      ...img.toJSON(),
      imageUrl: getImageUrl(img.image)
    }));

    return res.success({
      message: 'Images fetched successfully',
      data: imagesWithBackendIP
    });
  } catch (error) {
    console.error('Error fetching images:', error);
    return res.failure({ message: error.message });
  }
};

/**
 * Get single image by ID
 * @description Get a specific image by its ID
 */
const getImageById = async (req, res) => {
  try {
    const { id } = req.params;
    const companyId = req.user?.companyId || null;

    const image = await dbService.findOne(model.companyImage, {
      id,
      companyId,
      isActive: true
    });

    if (!image) {
      return res.failure({ message: 'Image not found' });
    }

    return res.success({
      message: 'Image fetched successfully',
      data: {
        ...image.toJSON(),
        imageUrl: getImageUrl(image.image)
      }
    });
  } catch (error) {
    console.error('Error fetching image:', error);
    return res.failure({ message: error.message });
  }
};

/**
 * Update image
 * @description Update image name or replace the image
 */
const updateImage = async (req, res) => {
  try {
    const { id } = req.params;
    const { name } = req.body;
    const companyId = req.user?.companyId || null;

    const image = await dbService.findOne(model.companyImage, {
      id,
      companyId,
      isActive: true
    });

    if (!image) {
      return res.failure({ message: 'Image not found' });
    }

    const updateData = {};
    if (name) {
      updateData.name = name;
    }

    // If new image is uploaded, replace the old one
    if (req.file) {
      // Delete old image from S3
      await deleteImageFromS3(image.s3Key);

      // Upload new image to S3
      const uploadResult = await uploadImageToS3(
        req.file.buffer,
        req.file.originalname,
        image.type,
        companyId,
        image.subtype
      );

      updateData.image = uploadResult.url;
      updateData.s3Key = uploadResult.key;
    }

    // Update database
    const updatedImage = await dbService.update(
      model.companyImage,
      { id },
      updateData
    );

    return res.success({
      message: 'Image updated successfully',
      data: {
        ...updatedImage.toJSON(),
        imageUrl: getImageUrl(updatedImage.image)
      }
    });
  } catch (error) {
    console.error('Error updating image:', error);
    return res.failure({ message: error.message });
  }
};

/**
 * Delete image
 * @description Delete image from S3 and mark as inactive in database
 */
const deleteImage = async (req, res) => {
  try {
    const { id } = req.params;
    const companyId = req.user?.companyId || null;

    const image = await dbService.findOne(model.companyImage, {
      id,
      companyId,
      isActive: true
    });

    if (!image) {
      return res.failure({ message: 'Image not found' });
    }

    // Delete from S3
    await deleteImageFromS3(image.s3Key);

    // Mark as inactive in database
    await dbService.update(
      model.companyImage,
      { id },
      { isActive: false }
    );

    return res.success({
      message: 'Image deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting image:', error);
    return res.failure({ message: error.message });
  }
};

/**
 * Get images by category
 * @description Get images grouped by type and subtype
 */
const getImagesByCategory = async (req, res) => {
  try {
    const companyId = req.user?.companyId || null;

    const images = await dbService.findAll(model.companyImage, {
      companyId,
      isActive: true
    });

    // Group images by type
    const groupedImages = {
      loginSlider: [],
      signature: {
        logo: null,
        stamp: null,
        signature: null
      }
    };

    images.forEach(img => {
      const imageData = {
        ...img.toJSON(),
        imageUrl: getImageUrl(img.image)
      };

      if (img.type === 'loginSlider') {
        groupedImages.loginSlider.push(imageData);
      } else if (img.type === 'signature' && img.subtype) {
        groupedImages.signature[img.subtype] = imageData;
      }
    });

    return res.success({
      message: 'Images fetched successfully',
      data: groupedImages
    });
  } catch (error) {
    console.error('Error fetching images by category:', error);
    return res.failure({ message: error.message });
  }
};

/**
 * Serve image from S3
 * @description Proxy endpoint to serve images from S3 bucket
 */
const serveImage = async (req, res) => {
  try {
    // Extract s3Key from the wildcard path
    // The route is /images/*, so everything after /images/ is captured
    const s3Key = req.params[0];
    
    console.log('Image request - s3Key:', s3Key);
    console.log('Image request - full path:', req.path);
    
    if (!s3Key) {
      return res.status(404).send('Image not found');
    }

    // Get image from S3
    const imageBuffer = await getImageFromS3(s3Key);
    
    // Set appropriate content type
    res.set({
      'Content-Type': 'image/jpeg',
      'Cache-Control': 'public, max-age=31536000' // Cache for 1 year
    });
    
    res.send(imageBuffer);
  } catch (error) {
    console.error('Error serving image:', error);
    res.status(404).send('Image not found');
  }
};

module.exports = {
  uploadImage,
  getAllImages,
  getImageById,
  updateImage,
  deleteImage,
  getImagesByCategory,
  serveImage
};

