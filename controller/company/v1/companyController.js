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
        }
        return res.success({ message: 'Company details fetched successfully', data });
    } catch (error) {
        console.error(error);
        return res.failure({ message: error.message });
    }
}

module.exports = { getCompanyDettails };