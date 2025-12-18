const model = require('../../../models')
const dbService = require('../../../utils/dbService')
const asl = require('../../../services/asl')

const alsWallet = async(req, res)=>{
    try{
        const existingUser = await dbService.findOne(model.user, {
            id: req.user.id,
            isActive: true
        });
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

module.exports = {
    alsWallet
}