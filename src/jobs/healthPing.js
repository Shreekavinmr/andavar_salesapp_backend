const cron = require('node-cron');
const axios = require('axios');

const HEALTH_URL = process.env.HEALTH_URL || 'https://andavar-salesapp-backend.onrender.com/health';

// Every 2 minutes
cron.schedule('*/4 * * * *', async () => {
  try {
    const res = await axios.get(HEALTH_URL);
    console.log('✅ Health ping success:', res.status);
  } catch (err) {
    console.error('❌ Health ping failed:', err.message);
  }
});
