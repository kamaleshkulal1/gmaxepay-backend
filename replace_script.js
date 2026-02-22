const fs = require('fs');
const targetFile = '/Users/apple/gmaxepay/gmaxepay-backend/controller/user/v1/aslAepsController.js';
let content = fs.readFileSync(targetFile, 'utf8');
const replacement = fs.readFileSync('/Users/apple/gmaxepay/gmaxepay-backend/controller/user/v1/aeps_temp.js', 'utf8');

// We injected several helper functions and then cashWithdrawal, balanceEnquiry, miniStatement and checkStatus.
// Since checkStatus is also in aeps_temp.js, we should replace from the first helper up to the end of checkStatus.
const startMarkerStr = 'const buildAslRequestPayload =';
const endOfTargetRegex = /const checkStatus = async \([^)]+\) => \{[\s\S]*?catch \([^)]+\) \{[\s\S]*?\}\s*\}/;

const startIndex = content.indexOf(startMarkerStr);
if (startIndex === -1) {
    console.error('Could not find start index (buildAslRequestPayload)');
    process.exit(1);
}

const afterStart = content.substring(startIndex);
const match = endOfTargetRegex.exec(afterStart);
if (!match) {
    console.error('Could not find end index (end of checkStatus)');
    process.exit(1);
}

const endIndex = startIndex + match.index + match[0].length;

content = content.substring(0, startIndex) + replacement + "\n" + content.substring(endIndex);

// Fix the module.exports section
content = content.replace(/cashWithdrawal,\s*balanceEnquiry,\s*miniStatement,/gi, 'aepsTransaction,');

fs.writeFileSync(targetFile, content);
console.log('Success replacing unified aepsTransaction');
