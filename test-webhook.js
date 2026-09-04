const http = require('http');

// Ganti parameter di bawah ini kalau mau ngetes pesan/nomor lain!
const testData = JSON.stringify({
  phone: "6281234567890",
  message: "Halo min, ini ngetes webhook dari script lokal tanpa Postman!",
  studentName: "John Doe"
});

const options = {
  hostname: 'localhost',
  port: 3001,
  path: '/webhook/test/derma-indonesia',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': testData.length
  }
};

const req = http.request(options, (res) => {
  let data = '';
  res.on('data', (chunk) => data += chunk);
  res.on('end', () => {
    console.log("=== HASIL DARI SERVER ===");
    console.log("Status Code:", res.statusCode);
    console.log("Response:", data);
    console.log("=========================");
  });
});

req.on('error', (error) => {
  console.error("Gagal nyambung ke localhost:3001. Pastikan backend lokal udah nyala ya bro!");
  console.error(error.message);
});

req.write(testData);
req.end();
