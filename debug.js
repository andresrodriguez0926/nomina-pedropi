const fs = require('fs');
let content = fs.readFileSync('app.js', 'utf8');

const debugBtn = `
<button class="btn btn-warning" onclick="
    const history = state.payrollHistory || [];
    let msg = 'Debug Guayubin:\\n';
    let count = 0;
    history.forEach(run => {
        if(count > 10) return;
        (run.results || []).forEach(r => {
            const empName = (r.fullName || r.employeeName || '').toUpperCase();
            if(r.dept === 'FINCA GUAYUBIN' || r.dept === 'DEPARTAMENTO LOGISTICA BRAVO' || empName.includes('BRAVO')) {
                msg += run.periodEnd + ' - ' + r.fullName + ' - brute:' + r.brute + ' net:' + r.net + '\\n';
                count++;
            }
        });
    });
    alert(msg || 'No data found for Guayubin/Bravo in history!');
">Debug Bravo/Guayubin</button>
`;

content = content.replace(
    '<button class="btn btn-info" onclick="window.renderChristmasReportByDepartment()">',
    '<button class="btn btn-info" onclick="window.renderChristmasReportByDepartment()">\n                    <i class="fas fa-sitemap"></i> Reporte por Depto\n                </button>\n                ' + debugBtn.replace(/\n/g, '') + '\n                <!-- temp -->'
);
fs.writeFileSync('app.js', content, 'utf8');
console.log('Added debug button');
