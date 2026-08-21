const fs = require('fs');
const file = './src/modules/crm/crm.service.js';
let code = fs.readFileSync(file, 'utf8');

code = code.replace(/sp\.sp\.pj_sekolah/g, 'sp.pj_sekolah');
code = code.replace(/ AND pj_sekolah = \$\{pool\.escape/g, ' AND sp.pj_sekolah = ${pool.escape');
code = code.replace(/ AND cro = \$\{pool\.escape/g, ' AND sp.cro = ${pool.escape');

fs.writeFileSync(file, code);
console.log('Fixed crm.service.js');
