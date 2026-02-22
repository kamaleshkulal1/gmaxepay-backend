const fs = require('fs');
const targetFile = '/Users/apple/gmaxepay/gmaxepay-backend/controller/user/v1/aslAepsController.js';
const content = fs.readFileSync(targetFile, 'utf8');
const replacement = fs.readFileSync('/Users/apple/gmaxepay/gmaxepay-backend/controller/user/v1/aeps_temp.js', 'utf8');

// The code I injected previously started with "const buildAslRequestPayload = "
// and ended right before "const getOnboardingStatus = "

const startIndex = content.indexOf('const buildAslRequestPayload =');
const endIndex = content.indexOf('const getOnboardingStatus =');

if (startIndex === -1 || endIndex === -1) {
    console.error('Could not find start or end index for replacement');
    process.exit(1);
}

const newContent = content.substring(0, startIndex) + replacement + "\n" + content.substring(endIndex);

fs.writeFileSync(targetFile, newContent);

// Fix the exports
let updatedContent = fs.readFileSync(targetFile, 'utf8');
updatedContent = updatedContent.replace(/cashWithdrawal,\s*balanceEnquiry,\s*miniStatement,/gi, 'aepsTransaction,');
fs.writeFileSync(targetFile, updatedContent);
console.log('Successfully replaced functions in aslAepsController.js')
