const model = require('../../../models')
const dbService = require('../../../utils/dbService')
const asl = require('../../../services/asl')

const alsWallet = async(req, res)=>{
    try{
        const existingUser = await dbService.findOne(model.user, {
            id: req.user.id,
            isActive: true
        });
        if(existingUser.userRole !== 1){
            return res.failure({ message: 'Unauthorized access' });
        }
        if(!existingUser){
            return res.failure({ message: 'User not found' });
        }
        const response = await asl.alsWallet();
        console.log("response",response);
        if(response.status === 'true' || response.status === true){
            return res.success({ message: 'Wallet fetched successfully', data: response });
        }else{
            return res.failure({ message: response.message });
        }
    }catch(error){
        console.error('Error in alsWallet', error);
        return res.failure({ message: error.message });
    }
}

const walletBalance = async(req, res)=>{
    try{
        const existingUser = await dbService.findOne(model.user, {
            id: req.user.id,
            companyId: req.user.companyId,
            isActive: true
        });
        if(!existingUser){
            return res.failure({ message: 'User not found' });
        }
        if(existingUser.userRole !== 1){
            return res.failure({ message: 'Unauthorized access' });
        }
        
        const wallet = await dbService.findOne(model.wallet, {
            refId: existingUser.id,
            companyId: existingUser.companyId
        });
        if(!wallet){
            return res.failure({ message: 'Wallet not found' });
        }

        // Sum all aepsWallet amounts from all users in the company
        // Use findAll to get all wallets and sum manually
        const allWallets = await dbService.findAll(model.wallet, {
            companyId: existingUser.companyId,
            isDelete: false
        }, {
            attributes: ['apesWallet']
        });

        // Calculate sum of all aepsWallet amounts
        const totalAepsWallet = allWallets.reduce((sum, wallet) => {
            const aepsWallet = parseFloat(wallet.apesWallet || 0);
            return sum + aepsWallet;
        }, 0);

        const response = {
            mainWallet: wallet?.mainWallet ? parseFloat(wallet.mainWallet).toFixed(2) : '0.00',
            apesWallet: totalAepsWallet ? parseFloat(totalAepsWallet).toFixed(2) : '0.00'
        }

        return res.success({ message: 'Wallet balance fetched successfully', data: response });
    }catch(error){
        console.error('Error in walletBalance', error);
        return res.failure({ message: error.message });
    }
}

module.exports = {
    alsWallet,
    walletBalance
}