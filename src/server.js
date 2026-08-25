'use strict';

require('dotenv').config();

const app                      = require('./app');
const { testConnection }       = require('./config/database');

const PORT = parseInt(process.env.PORT || '3000');

async function start() {
  // Uji koneksi database sebelum server menerima request
  await testConnection();

  app.listen(PORT, '127.0.0.1', () => {
    console.log('');
    console.log('╔══════════════════════════════════════════╗');
    console.log('║       Nexa OS Backend — Running          ║');
    console.log('╠══════════════════════════════════════════╣');
    console.log(`║  🌐 http://localhost:${PORT}                 ║`);
    console.log(`║  🔧 ENV: ${(process.env.NODE_ENV || 'development').padEnd(32)}║`);
    console.log('╚══════════════════════════════════════════╝');
    console.log('');
  });
}

start().catch(err => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
