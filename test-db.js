const pool = require('./src/config/database').pool;
// if pool is not exported like that, let's just use whatever is in auth.service.js

async function check() {
  try {
    const [[user]] = await pool.query('SELECT * FROM users LIMIT 1');
    console.log("Users schema:", Object.keys(user));
    
    // Test forgot password query
    await pool.query(
      'UPDATE users SET reset_password_token = ?, reset_password_expires = ? WHERE id = ?',
      ['token', Date.now(), user.id]
    );
    console.log("Update success!");
  } catch(e) {
    console.error("Error:", e);
  } finally {
    process.exit();
  }
}
check();
