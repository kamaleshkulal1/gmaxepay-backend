const { Op } = require('sequelize');
const model = require('./models');
const dbService = require('./utils/dbService');

async function checkUsers() {
    try {
        const searchPattern = 'ZPAYTRE%';
        const users = await model.user.findAll({
            where: {
                userId: {
                    [Op.like]: searchPattern
                }
            },
            order: [['createdAt', 'DESC']],
            limit: 20,
            attributes: ['userId', 'createdAt', 'mobileNo']
        });

        console.log('Existing users with prefix ZPAYTRE:');
        users.forEach(u => {
            console.log(`userId: ${u.userId}, createdAt: ${u.createdAt}, mobileNo: ${u.mobileNo}`);
        });
        process.exit(0);
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

checkUsers();
