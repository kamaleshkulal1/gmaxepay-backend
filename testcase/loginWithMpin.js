const axios = require('axios');

const BASE_URL = 'https://api-dev.gmaxepay.in/api/v1/auth';
const COMPANY_ID = '2';

const commonHeaders = {
    'x-company-id': COMPANY_ID,
    'Content-Type': 'application/json',
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Origin': 'https://nspay.gmaxepay.in',
    'Referer': 'https://nspay.gmaxepay.in/'
};

let results = { passed: 0, failed: 0, cases: [] };

async function runTest(name, scenarioFn) {
    const boxWidth = 60;
    const border = '━'.repeat(boxWidth);
    console.log(`\n┏${border}┓`);
    console.log(`┃  🚀 RUNNING TEST: ${name.padEnd(boxWidth - 19)}  ┃`);
    console.log(`┗${border}┛`);
    
    try {
        await scenarioFn();
        results.passed++;
        results.cases.push({ name, status: 'PASSED' });
        console.log(`✅ ${name} completed successfully.`);
    } catch (error) {
        results.failed++;
        results.cases.push({ name, status: 'FAILED', error: error.message });
        console.error(`❌ ${name} Failed:`, error.message);
    }
    console.log(`━`.repeat(boxWidth + 2));
}

async function testSuccessFlow() {
    // Step 1: Login
    const loginRes = await axios.post(`${BASE_URL}/login`, {
        mobileNo: "9071138349",
        password: "Kamalesh6521&_",
        latitude: "13.038174619999996",
        longitude: "74.95649718999996"
    }, { headers: commonHeaders });

    console.log('Step 1 (Login) Response:', JSON.stringify(loginRes.data, null, 2));

    if (loginRes.data.status !== 'SUCCESS') throw new Error('Login failed');

    // Step 2: Verify MPIN
    const token = loginRes.data.data.token;
    const mpinRes = await axios.post(`${BASE_URL}/verify-mpin`, {
        mpin: "1234",
        latitude: "13.038174619999996",
        longitude: "74.95649718999996",
        ipAddress: "127.0.0.1"
    }, { headers: { ...commonHeaders, 'token': token } });

    console.log('Step 2 (Verify MPIN) Response:', JSON.stringify(mpinRes.data, null, 2));
    if (mpinRes.data.status !== 'SUCCESS') throw new Error('MPIN verification failed');
}

async function testInvalidPassword() {
    try {
        const res = await axios.post(`${BASE_URL}/login`, {
            mobileNo: "9071138349",
            password: "WrongPassword123",
            latitude: "13.038174619999996",
            longitude: "74.95649718999996"
        }, { headers: commonHeaders });
        console.log('Response:', JSON.stringify(res.data, null, 2));
        if (res.data.status === 'SUCCESS') throw new Error('Should have failed with wrong password');
    } catch (err) {
        if (err.response) {
            console.log('Expected Error Response:', JSON.stringify(err.response.data, null, 2));
        } else throw err;
    }
}

async function testInvalidMpin() {
    const loginRes = await axios.post(`${BASE_URL}/login`, {
        mobileNo: "9071138349",
        password: "Kamalesh6521&_",
        latitude: "13.038174619999996",
        longitude: "74.95649718999996"
    }, { headers: commonHeaders });

    const token = loginRes.data.data.token;
    try {
        const res = await axios.post(`${BASE_URL}/verify-mpin`, {
            mpin: "0000", // Wrong MPIN
            latitude: "13.038174619999996",
            longitude: "74.95649718999996",
            ipAddress: "127.0.0.1"
        }, { headers: { ...commonHeaders, 'token': token } });
        console.log('Response:', JSON.stringify(res.data, null, 2));
        if (res.data.status === 'SUCCESS') throw new Error('Should have failed with wrong MPIN');
    } catch (err) {
        if (err.response) {
            console.log('Expected Error Response:', JSON.stringify(err.response.data, null, 2));
        } else throw err;
    }
}

async function startTests() {
    await runTest('Valid Login & MPIN Flow', testSuccessFlow);
    await runTest('Invalid Password Check', testInvalidPassword);
    await runTest('Invalid MPIN Check', testInvalidMpin);

    const total = results.passed + results.failed;
    
    const boxWidth = 60;
    const line = '═'.repeat(boxWidth);
    
    console.log(`\n╔${line}╗`);
    console.log(`║${'📊 FINAL TEST SUMMARY'.padStart((boxWidth + 21) / 2).padEnd(boxWidth)}║`);
    console.log(`╠${line}╣`);
    console.log(`║  TOTAL TESTS : ${total.toString().padEnd(boxWidth - 17)}║`);
    console.log(`║  PASSED      : ${results.passed.toString().padEnd(boxWidth - 17)}✓ ║`);
    console.log(`║  FAILED      : ${results.failed.toString().padEnd(boxWidth - 17)}✗ ║`);
    console.log(`╠${line}╣`);
    
    results.cases.forEach(c => {
        const statusIcon = c.status.includes('PASSED') ? '✓' : '✗';
        const formattedCase = `${statusIcon} ${c.name}`;
        console.log(`║  ${formattedCase.padEnd(boxWidth - 4)}  ║`);
    });
    
    console.log(`╚${line}╝`);
}



startTests();
