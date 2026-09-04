require('dotenv').config();
const axios = require('axios');
const token = process.env.WA_ACCESS_TOKEN;
const wabaId = process.env.WA_WABA_ID;

async function fix() {
  try {
    const res = await axios.post(`https://graph.facebook.com/v19.0/${wabaId}/subscribed_apps`, {}, {
      headers: { Authorization: `Bearer ${token}` }
    });
    console.log('Fixed Webhook:', JSON.stringify(res.data, null, 2));
    
    // Check again
    const checkRes = await axios.get(`https://graph.facebook.com/v19.0/${wabaId}/subscribed_apps`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    console.log('Subscribed Apps Now:', JSON.stringify(checkRes.data, null, 2));
  } catch (err) {
    console.log('Error WABA:', err.response?.data || err.message);
  }
}
fix();
