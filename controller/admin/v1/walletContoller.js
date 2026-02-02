const model = require('../../../models')
const dbService = require('../../../utils/dbService')
const asl = require('../../../services/asl')
const inspayService = require('../../../services/inspayService')

const alsWallet = async(req, res)=>{
    try{
        if(req.user.userRole !== 1){
            return res.failure({ message: 'Unauthorized access' });
        }
        const response = await asl.alsWallet();

        if(response?.status === 'true' || response?.status === true){
            return res.success({ message: 'Wallet fetched successfully', data: response });
        }
        
        return res.failure({ message: response?.message || 'Unable to fetch wallet balance' });
    }catch(error){
        console.error('Error in alsWallet', error);
        return res.failure({ message: error.message || 'Unable to fetch wallet balance' });
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
        
        // Fetch admin wallet and sum all aeps1Wallet and aeps2Wallet amounts in parallel for better performance
        const [wallet, totalAeps1Wallet, totalAeps2Wallet] = await Promise.all([
            dbService.findOne(model.wallet, {
                refId: existingUser.id,
                companyId: existingUser.companyId
            }),
            model.wallet.sum('apes1Wallet', {
                where: {
                    isDelete: false
                }
            }),
            model.wallet.sum('apes2Wallet', {
                where: {
                    isDelete: false
                }
            })
        ]);

        if(!wallet){
            return res.failure({ message: 'Wallet not found' });
        }

        const response = {
            mainWallet: wallet?.mainWallet ? parseFloat(wallet.mainWallet).toFixed(2) : '0.00',
            apes1Wallet: (totalAeps1Wallet || 0).toFixed(2),
            apes2Wallet: (totalAeps2Wallet || 0).toFixed(2)
        }

        return res.success({ message: 'Wallet balance fetched successfully', data: response });
    }catch(error){
        console.error('Error in walletBalance', error);
        return res.failure({ message: error.message });
    }
}

const inspayWallet = async(req, res)=>{
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
        const response = await inspayService.checkBalance();
        return res.success({ message: 'Balance fetched successfully', data: response });
    } catch (error) {
        console.error('Error in inspayWallet', error);
        return res.failure({ message: error.message });
    }
};

module.exports = {
    alsWallet,
    walletBalance,
    inspayWallet
};