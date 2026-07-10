const fs = require('fs');
let content = fs.readFileSync('app.js', 'utf8');

const target1 = `    // Calculate data for each employee
    const christmasData = window.getVisibleEmployees().filter(e => e.active !== false).map(emp => {
        try {
            const empId = String(emp.idNumber || '').trim();
            const empName = \`\${emp.firstName} \${emp.lastName}\`.trim();`;

console.log('Includes target1?', content.includes(target1));
