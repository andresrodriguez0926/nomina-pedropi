const fs = require('fs');
let content = fs.readFileSync('app.js', 'utf8');

const debugBtn = `<button class="btn btn-warning" style="height: 42px;" onclick="
    const history = state.payrollHistory || [];
    let msg = 'Debug Guayubin:\\\\n';
    let count = 0;
    history.forEach(run => {
        if(count > 10) return;
        (run.results || []).forEach(r => {
            const empName = (r.fullName || r.employeeName || '').toUpperCase();
            if(r.dept === 'FINCA GUAYUBIN' || r.dept === 'DEPARTAMENTO LOGISTICA BRAVO' || empName.includes('BRAVO') || empName.includes('GUAYUBIN')) {
                msg += run.periodEnd + ' - ' + r.fullName + ' - brute:' + r.brute + ' net:' + r.net + '\\\\n';
                count++;
            }
        });
    });
    alert(msg || 'No data found for Guayubin/Bravo in history!');
"><i class="fas fa-bug"></i> Debug Bravo/Guayubin</button>`.replace(/\n/g, '');

const reportBtn = `<button class="btn btn-info" style="height: 42px;" onclick="window.renderChristmasReportByDepartment()">
                    <i class="fas fa-sitemap"></i> Reporte por Depto
                </button>`.replace(/\n/g, '');

const injectStr = '<button class="btn btn-secondary" style="height: 42px;" id="chr-refresh-btn">\n                    <i class="fas fa-sync-alt"></i> Recalcular con Fechas\n                </button>';

if (content.includes(injectStr)) {
    content = content.replace(injectStr, injectStr + '\n                ' + reportBtn + '\n                ' + debugBtn);
    fs.writeFileSync('app.js', content, 'utf8');
    console.log('Injected buttons!');
} else {
    // try removing indentation
    const idx = content.indexOf('id="chr-refresh-btn">');
    if (idx !== -1) {
        const afterBtn = content.indexOf('</button>', idx) + 9;
        const before = content.substring(0, afterBtn);
        const after = content.substring(afterBtn);
        content = before + '\n                ' + reportBtn + '\n                ' + debugBtn + after;
        fs.writeFileSync('app.js', content, 'utf8');
        console.log('Injected buttons using indexOf fallback!');
    } else {
        console.log('Could not find injection point');
    }
}
