// import model from '../../../models';
// import dbService from '../../../utils/dbService';
import  aslService from '../../../services/asl';
const registerSender = async (req, res) => {
    try{
        const {senderMobileNo,senderName,senderGender}= req.body;
        const response = await aslService.aslDmtSenderRegistration(req.body);
        return res.success({ message: 'Sender registration successful', data: response });
    }catch(error){
        console.error(error);
        return res.failure({ message: error.message });
    }
}

module.exports = {
    registerSender
  };