const model = require('./models');
const dbService = require('./utils/dbService');

async function testConcurrency() {
    const companyId = 2; // Zpay
    const company = await model.company.findByPk(companyId);

    if (!company) {
        console.error('Company not found');
        process.exit(1);
    }

    const baseMobile = '999999';
    const userData = (i) => ({
        mobileNo: baseMobile + i.toString().padStart(4, '0'),
        companyId: companyId,
        userRole: 5,
        isActive: true,
        userType: 1,
        isDeleted: false,
        kycStatus: 'NO_KYC',
        kycSteps: 0,
        signupStep: 1,
        companyName: company.companyName // For hook
    });

    console.log('Attempting to create 5 users concurrently...');

    try {
        const results = await Promise.allSettled([
            dbService.createOne(model.user, userData(1001)),
            dbService.createOne(model.user, userData(1002)),
            dbService.createOne(model.user, userData(1003)),
            dbService.createOne(model.user, userData(1004)),
            dbService.createOne(model.user, userData(1005))
        ]);

        results.forEach((res, i) => {
            if (res.status === 'fulfilled') {
                console.log(`User ${i + 1} created: ${res.value.userId}`);
            } else {
                console.error(`User ${i + 1} failed: ${res.reason.message}`);
                if (res.reason.errors) {
                    res.reason.errors.forEach(e => console.error(`  - ${e.message}`));
                }
            }
        });

        // Cleanup
        const userIds = results.filter(r => r.status === 'fulfilled').map(r => r.value.id);
        if (userIds.length > 0) {
            await model.user.destroy({ where: { id: userIds } });
            console.log('Cleaned up test users');
        }

        process.exit(0);
    } catch (error) {
        console.error('Test error:', error);
        process.exit(1);
    }
}

// Note: This test won't trigger the CONTROLLER retry logic, only the MODEL hook changes.
// To test controller retry, we'd need to bypass the model hook or use a more complex setup.
// But the model hook improvement (descending order) already significantly reduces collisions.

testConcurrency();
