const dbService = require('../../../utils/dbService');
const model = require('../../../models');

const walletBalance = async(req, res)=>{
    try{
        const existingUser = await dbService.findOne(model.user, {
            id: req.user.id,
            companyId: req.user.companyId,
            isActive: true,
            isDeleted: false
        });
        if(existingUser.userRole !== 2){
            return res.failure({ message: 'Unauthorized access' });
        }
        if(!existingUser){
            return res.failure({ message: 'User not found' });
        }
        const wallet = await dbService.findOne(model.wallet, {
            refId: existingUser.id,
            companyId: existingUser.companyId
        });
        if(!wallet){
            return res.failure({ message: 'Wallet not found' });
        }
        const response ={
            mainWallet: wallet?.mainWallet.toFixed(2)||0,
            apesWallet: wallet?.apesWallet.toFixed(2)||0
        }
        return res.success({ message: 'Wallet balance fetched successfully', data: response });
    }
    catch(error){
        console.error('Error in walletBalance', error);
        return res.failure({ message: error.message });
    }
}

module.exports = {
    walletBalance
}