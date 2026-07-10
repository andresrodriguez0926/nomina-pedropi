const fs = require('fs');
let content = fs.readFileSync('app.js', 'utf8');
content = content.replace('</button>\\n                <button class="btn btn-info"', '</button>\n                <button class="btn btn-info"');
content = content.replace('</button>\\n                <button class="btn btn-warning"', '</button>\n                <button class="btn btn-warning"');
fs.writeFileSync('app.js', content, 'utf8');
console.log('Fixed literal newlines');
