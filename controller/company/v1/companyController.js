const model = require('../../../models');
const dbService = require('../../../utils/dbService');
const imageService = require('../../../services/imageService');
const { uploadImageToS3, deleteImageFromS3, getImageUrl } = imageService;

const getCompanyDetails = async (req, res) => {
  try {
    let companyDomain = req.query.domain;

    // Map localhost to zpay.gmaxepay.in for development
    if (companyDomain === 'localhost') {
      companyDomain = 'app.gmaxepay.in';
    }

    // Set default domain for development environment
    if (process.env.NODE_ENV === 'development' && !companyDomain) {
      companyDomain = 'app.gmaxepay.in';
    }

    if (!companyDomain) return res.failure({ message: 'Company domain is required' });
    const company = await dbService.findOne(model.company, { customDomain: companyDomain });
    if (!company) return res.failure({ message: 'Company not found' });

    // Fetch slider images for the company with limit to prevent memory issues
    const sliderImages = await dbService.findAll(
      model.companyImage,
      {
        companyId: company.id,
        type: 'loginSlider',
        isActive: true
      },
      {
        order: [['createdAt', 'ASC']],
        limit: 50 // Limit to 50 slider images to prevent memory issues
      }
    );

    // Fetch logo and favicon in parallel for better performance
    const [logoImage, faviconImage] = await Promise.all([
      dbService.findOne(model.companyImage, {
        companyId: company.id,
        type: 'signature',
        subtype: 'logo',
        isActive: true
      }, {
        order: [['createdAt', 'DESC']]
      }),
      dbService.findOne(model.companyImage, {
        companyId: company.id,
        type: 'signature',
        subtype: 'favicon',
        isActive: true
      }, {
        order: [['createdAt', 'DESC']]
      })
    ]);

    // Format slider images with backend API URL (proxy endpoint with CORS)
    // Use toJSON() to convert Sequelize instances to plain objects and reduce memory
    const formattedSliderImages = sliderImages.map(img => {
      const imgData = img.toJSON ? img.toJSON() : img;
      return {
        id: imgData.id,
        name: imgData.name,
        type: imgData.type,
        image: getImageUrl(imgData.s3Key || imgData.image)
      };
    });


    // Convert company to JSON to reduce memory footprint
    const companyData = company.toJSON ? company.toJSON() : company;

    const data = {
      companyId: companyData.id,
      companyDomain: companyData.customDomain,
      companyName: companyData.companyName,
      logo: logoImage ? getImageUrl(logoImage.s3Key || logoImage.image) : null,
      favicon: faviconImage ? getImageUrl(faviconImage.s3Key || faviconImage.image) : null,
      primaryColor: companyData.primaryColor,
      secondaryColor: companyData.secondaryColor,
      singupPageDesign: companyData.singupPageDesign,
      navigationBar: companyData.navigationBar,
      supportPhoneNumbers: companyData.supportPhoneNumbers,
      customerSupportEmail: companyData.customerSupportEmail,
      isActive: companyData.isActive,
      sliderImages: formattedSliderImages,
    }
    return res.success({ message: 'Company details fetched successfully', data });
  } catch (error) {
    console.error(error);
    return res.failure({ message: error.message });
  }
}

const updateCompany = async (req, res) => {
  try {
    // Get company ID from params or body (depending on route structure)
    const { id } = req.params;
    const companyId = id ? parseInt(id) : (req.body.id ? parseInt(req.body.id) : req.user?.companyId);
    let updateData = req.body;
    const userId = req.user?.id;

    if (!companyId) {
      return res.failure({ message: 'Company ID is required' });
    }

    // Get files from multer (logo, favicon, sliders)
    const files = req.files || {};
    const logoFile = files.logo && files.logo[0];
    const faviconFile = files.favicon && files.favicon[0];
    const sliderFiles = files.sliders || [];

    // Find company
    const company = await dbService.findOne(model.company, { id: companyId });
    if (!company) return res.failure({ message: 'Company not found' });

    // Handle logo upload
    if (logoFile) {
      try {
        // Find existing logo images (all of them - active and inactive)
        const existingLogos = await dbService.findAll(model.companyImage, {
          companyId: companyId,
          type: 'signature',
          subtype: 'logo'
        });

        // Delete all old logo images from S3 and mark as inactive
        if (existingLogos && existingLogos.length > 0) {
          for (const oldImage of existingLogos) {
            try {
              if (oldImage.s3Key) {
                await deleteImageFromS3(oldImage.s3Key);
              }
              await dbService.update(
                model.companyImage,
                { id: oldImage.id },
                { isActive: false }
              );
            } catch (error) {
              console.error(`Error deleting old logo ${oldImage.id}:`, error);
            }
          }
        }

        // Upload new logo to S3
        const uploadResult = await uploadImageToS3(
          logoFile.buffer,
          logoFile.originalname,
          'signature',
          companyId,
          'logo'
        );

        // Save new logo to database
        const logoData = {
          name: 'Logo',
          image: uploadResult.url,
          s3Key: uploadResult.key,
          type: 'signature',
          subtype: 'logo',
          companyId: companyId,
          userId: userId,
          isActive: true
        };

        await dbService.createOne(model.companyImage, logoData);

        // Update company table with logo S3 key
        await dbService.update(
          model.company,
          { id: companyId },
          { logo: uploadResult.key }
        );
      } catch (error) {
        console.error('Error uploading logo:', error);
        return res.failure({ message: `Error uploading logo: ${error.message}` });
      }
    }

    // Handle favicon upload
    if (faviconFile) {
      try {
        // Find existing favicon images (all of them - active and inactive)
        const existingFavicons = await dbService.findAll(model.companyImage, {
          companyId: companyId,
          type: 'signature',
          subtype: 'favicon'
        });

        // Delete all old favicon images from S3 and mark as inactive
        if (existingFavicons && existingFavicons.length > 0) {
          for (const oldImage of existingFavicons) {
            try {
              if (oldImage.s3Key) {
                await deleteImageFromS3(oldImage.s3Key);
              }
              await dbService.update(
                model.companyImage,
                { id: oldImage.id },
                { isActive: false }
              );
            } catch (error) {
              console.error(`Error deleting old favicon ${oldImage.id}:`, error);
            }
          }
        }

        // Upload new favicon to S3
        const uploadResult = await uploadImageToS3(
          faviconFile.buffer,
          faviconFile.originalname,
          'signature',
          companyId,
          'favicon'
        );

        // Save new favicon to database
        const faviconData = {
          name: 'Favicon',
          image: uploadResult.url,
          s3Key: uploadResult.key,
          type: 'signature',
          subtype: 'favicon',
          companyId: companyId,
          userId: userId,
          isActive: true
        };

        await dbService.createOne(model.companyImage, faviconData);

        // Update company table with favicon S3 key
        await dbService.update(
          model.company,
          { id: companyId },
          { favicon: uploadResult.key }
        );
      } catch (error) {
        console.error('Error uploading favicon:', error);
        return res.failure({ message: `Error uploading favicon: ${error.message}` });
      }
    }

    // Handle slider images upload
    if (sliderFiles && sliderFiles.length > 0) {
      try {
        // Get slider names from body (should be an array or comma-separated string)
        const sliderNames = req.body.sliderNames;
        let namesArray = [];

        if (typeof sliderNames === 'string') {
          namesArray = sliderNames.split(',').map(name => name.trim());
        } else if (Array.isArray(sliderNames)) {
          namesArray = sliderNames;
        }

        for (let i = 0; i < sliderFiles.length; i++) {
          const sliderFile = sliderFiles[i];
          const sliderName = namesArray[i] || `Slider ${i + 1}`;

          // Upload slider to S3
          const uploadResult = await uploadImageToS3(
            sliderFile.buffer,
            sliderFile.originalname,
            'loginSlider',
            companyId,
            null
          );

          // Save slider to database
          const sliderData = {
            name: sliderName,
            image: uploadResult.url,
            s3Key: uploadResult.key,
            type: 'loginSlider',
            subtype: null,
            companyId: companyId,
            userId: userId,
            isActive: true
          };

          await dbService.createOne(model.companyImage, sliderData);
        }
      } catch (error) {
        console.error('Error uploading sliders:', error);
        return res.failure({ message: `Error uploading sliders: ${error.message}` });
      }
    }

    // Handle other company data updates
    if (
      updateData.modulesEnabled &&
      typeof updateData.modulesEnabled === 'string'
    ) {
      updateData.modulesEnabled = JSON.parse(
        updateData.modulesEnabled.replace(/'/g, '"')
      );
    }

    // Remove image-related fields from updateData as they're handled separately
    delete updateData.logo;
    delete updateData.favicon;
    delete updateData.sliders;
    delete updateData.sliderNames;

    // Update company data (excluding images)
    const updated = await dbService.update(model.company, { id: companyId }, updateData);

    return res.success({
      message: 'Company updated successfully',
      data: updated
    });
  } catch (error) {
    console.error('Error updating company:', error);
    return res.failure({ message: error.message });
  }
};

const getAllCompanyImages = async (req, res) => {
  try {
    const dataToFind = req.body || {};
    let query = {};

    if (dataToFind.query) {
      query = { ...query, ...dataToFind.query };
      // Default to active images only if not explicitly specified
      if (query.isActive === undefined) {
        query.isActive = true;
      }
    } else {
      // Fallback for old/direct flat payload
      if (dataToFind.type) query.type = dataToFind.type;
      if (dataToFind.subtype) query.subtype = dataToFind.subtype;
      query.isActive = dataToFind.isActive !== undefined ? dataToFind.isActive : true; // Default to active
    }

    const companyId = req.user?.companyId || query.companyId || req.body.companyId;

    if (!companyId) {
      return res.failure({ message: 'Company ID is required' });
    }

    query.companyId = companyId;

    let options = dataToFind.options || {};
    if (!options.order) {
      options.order = [['createdAt', 'DESC']];
    }

    if (dataToFind.isCountOnly) {
      const count = await dbService.count(model.companyImage, query);
      return res.success({
        message: 'Company images count fetched successfully',
        data: count
      });
    }

    const images = await dbService.findAll(
      model.companyImage,
      query,
      options
    );

    const formattedImages = images.map(img => {
      const imgData = img.toJSON ? img.toJSON() : img;
      return {
        id: imgData.id,
        name: imgData.name,
        type: imgData.type,
        subtype: imgData.subtype,
        isActive: imgData.isActive,
        createdAt: imgData.createdAt,
        image: getImageUrl(imgData.s3Key || imgData.image)
      };
    });

    return res.success({
      message: 'Company images fetched successfully',
      data: formattedImages
    });
  } catch (error) {
    console.error('Error fetching company images:', error);
    return res.failure({ message: error.message });
  }
};

const deleteCompany = async (req, res) => {
  try {
    const id = req.params.id || req.body.id;
    if (!id) {
      return res.failure({ message: 'Company ID is required' });
    }

    // Find all images for this company
    const existingImages = await dbService.findAll(model.companyImage, {
      id
    });

    // Delete images from S3
    if (existingImages && existingImages.length > 0) {
      for (const image of existingImages) {
        if (image.s3Key) {
          try {
            await deleteImageFromS3(image.s3Key);
          } catch (err) {
            console.error(`Error deleting image ${image.s3Key} from S3:`, err);
          }
        }
      }

      await dbService.destroy(model.companyImage, { id });
    }

    const company = await dbService.findOne(model.company, { id });
    if (company) {
      if (company.logo && !existingImages.find(img => img.s3Key === company.logo)) {
        try { await deleteImageFromS3(company.logo); } catch (e) { }
      }
      if (company.favicon && !existingImages.find(img => img.s3Key === company.favicon)) {
        try { await deleteImageFromS3(company.favicon); } catch (e) { }
      }
    }
    return res.success({ message: 'Company Slider deleted successfully' });
  } catch (error) {
    console.error('Error deleting company:', error);
    return res.failure({ message: error.message });
  }
};


module.exports = { getCompanyDetails, updateCompany, getAllCompanyImages, deleteCompany };