const fetch = require('node-fetch');

const API_URL = 'http://localhost:5000/api/profit/stats';

async function testProfitAPI() {
  console.log('Testing Profit API...');
  try {
    const response = await fetch(API_URL);
    if (!response.ok) {
      console.error(`Status ${response.status}: ${await response.text()}`);
      return;
    }
    const data = await response.json();
    console.log('Profit Summary:', JSON.stringify(data.summary, null, 2));
    console.log(`Monthly Records: ${data.monthly.length}`);
    console.log(`Daily Records: ${data.daily.length}`);
    
    if (data.monthly.length > 0) {
      console.log('First Monthly Record:', JSON.stringify(data.monthly[0], null, 2));
    }
  } catch (error) {
    if (error.code === 'ECONNREFUSED') {
      console.log('Server is not running. Please start the server at http://localhost:5000');
    } else {
      console.error('Test failed:', error);
    }
  }
}

testProfitAPI();
