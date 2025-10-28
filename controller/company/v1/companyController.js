const model = require('../../../models');
const dbService = require('../../../utils/dbService');

const getCompanyDettails = async (req, res) => {
    try {
        let companyDomain = req.query.domain;
        
        // Map localhost to zpay.gmaxepay.in for development
        if(companyDomain === 'localhost') {
            companyDomain = 'app.gmaxepay.in';
        }
        
        // Set default domain for development environment
        if(process.env.NODE_ENV === 'development' && !companyDomain) {
            companyDomain = 'app.gmaxepay.in';
        }
        
        if(!companyDomain) return res.failure({ message: 'Company domain is required' });
        const company = await dbService.findOne(model.company, { customDomain: companyDomain });
        if(!company) return res.failure({ message: 'Company not found' });
        
        // Fetch slider images for the company
        const sliderImages = await dbService.findAll(
            model.companyImage, 
            { 
                companyId: company.id, 
                type: 'loginSlider',
                isActive: true 
            },
            {
                order: [['createdAt', 'ASC']]
            }
        );
        
        const logoImage = await dbService.findOne(model.companyImage, {
            companyId: company.id,
            type: 'signature',
            subtype: 'logo',
            isActive: true
        });
        const faviconImage = await dbService.findOne(model.companyImage, {
            companyId: company.id,
            type: 'signature',
            subtype: 'favicon',
            isActive: true
        });
        
        // Format slider images with full domain URL
        const formattedSliderImages = sliderImages.map(img => ({
            id: img.id,
            name: img.name,
            type: img.type,
            image: `${process.env.AWS_CDN_URL}/${img.s3Key}`
        }));

        
        const data = {
            companyId: company.id,
            companyDomain: company.customDomain,
            companyName: company.companyName,
            logo: company.logo,
            favicon: company.favicon,
            primaryColor: company.primaryColor,
            secondaryColor: company.secondaryColor,
            singupPageDesign: company.singupPageDesign,
            navigationBar: company.navigationBar,
            supportPhoneNumbers: company.supportPhoneNumbers,
            customerSupportEmail: company.customerSupportEmail,
            isActive: company.isActive,
            sliderImages: formattedSliderImages,
            logo: logoImage ? `${process.env.AWS_CDN_URL}/${logoImage.s3Key}` : null,
            favicon: faviconImage ? `${process.env.AWS_CDN_URL}/${faviconImage.s3Key}` : null,
        }
        return res.success({ message: 'Company details fetched successfully', data });
    } catch (error) {
        console.error(error);
        return res.failure({ message: error.message });
    }
}


module.exports = { getCompanyDettails };