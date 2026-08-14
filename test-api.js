

async function test() {
  try {
    // Generate a valid JWT token for test
    const jwt = require('jsonwebtoken');
    const token = jwt.sign(
      { nama: 'admindemo', role: 'Admin', selectedPeriod: '2024/2025' },
      process.env.JWT_SECRET_KEY || 'NEXA_DEV_SECRET_KEY',
      { expiresIn: '1d' }
    );

    const res = await fetch('http://localhost:3000/api/crm/sekolah/list', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ page: 1, pageSize: 20 })
    });
    
    const data = await res.json();
    console.log("API STATUS:", res.status);
    console.log("API DATA:", JSON.stringify(data, null, 2));
  } catch(err) {
    console.error("API ERROR:", err.message);
  }
}
test();
