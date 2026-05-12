const vendorPayoutServices = require('../../../services/paynidipro');

const createVendorPayout = async (req, res) => {
    try {
        const apiKey = req.headers['x-api-key'];
        const secretKey = req.headers['x-secret-key'];

        if (apiKey !== process.env.VENDOR_PAYOUT_API_KEY || secretKey !== process.env.VENDOR_PAYOUT_SECRET_KEY) {
            return res.failure({
                message: 'Unauthorized access: Invalid API Key or Secret Key',
            });
        }

        const { benIFSC, benAccount, benName, amount, benMobile, bankName, agentId } =
            req.body;

        const data = {
            benIFSC,
            benAccount,
            benName,
            amount,
            benMobile,
            bankName,
            agentId,
            dmtMode: 1
        }
        const vendorPayoutResponse = await vendorPayoutServices.doSettlement(data);

        const isSuccess = (vendorPayoutResponse.status === true || (vendorPayoutResponse.status && vendorPayoutResponse.status.toString().toUpperCase() === 'SUCCESS') || vendorPayoutResponse.code === 200) &&
            (vendorPayoutResponse.data !== null && vendorPayoutResponse.data !== undefined);

        if (!isSuccess) {
            return res.failure({
                message: vendorPayoutResponse.message || 'Vendor payout failed',
                data: vendorPayoutResponse
            });
        }

        return res.success({
            message: vendorPayoutResponse.message || 'Vendor payout created successfully',
            data: vendorPayoutResponse
        });
    } catch (error) {
        console.log(error);
        return res.failure({
            message: 'Failed to create vendor payout',
            error: error.message
        });
    }
}

const vendorWalletBalance = async (req, res) => {
    try {
        const apiKey = req.headers['x-api-key'];
        const secretKey = req.headers['x-secret-key'];

        if (apiKey !== process.env.VENDOR_PAYOUT_API_KEY || secretKey !== process.env.VENDOR_PAYOUT_SECRET_KEY) {
            return res.failure({
                message: 'Unauthorized access: Invalid API Key or Secret Key',
            });
        }

        const balanceResponse = await vendorPayoutServices.getWalletbalance();
        const isSuccess = (balanceResponse.status === true || (balanceResponse.status && balanceResponse.status.toString().toUpperCase() === 'SUCCESS') || balanceResponse.code === 200) &&
            (balanceResponse.data !== null && balanceResponse.data !== undefined);

        if (!isSuccess) {
            return res.failure({
                message: balanceResponse.message || 'Failed to fetch vendor wallet balance',
                data: balanceResponse
            });
        }

        return res.success({
            message: 'Vendor wallet balance fetched successfully',
            data: balanceResponse
        });
    } catch (error) {
        console.log(error);
        return res.failure({
            message: 'Failed to fetch vendor wallet balance',
            error: error.message
        });
    }
}
module.exports = {
    createVendorPayout,
    vendorWalletBalance
}
