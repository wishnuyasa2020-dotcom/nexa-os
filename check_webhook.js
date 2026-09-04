require('dotenv').config();
const axios = require('axios');
const token = process.env.WA_ACCESS_TOKEN;
const wabaId = process.env.WA_WABA_ID;

async function check() {
  if (!wabaId) {
    console.log("No WABA_ID found in .env");
    return;
  }
  try {
    const res = await axios.get(`https://graph.facebook.com/v19.0/${wabaId}/subscribed_apps`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    console.log('Subscribed Apps:', JSON.stringify(res.data, null, 2));
  } catch (err) {
    console.log('Error WABA:', err.response?.data || err.message);
  }
}
check();
