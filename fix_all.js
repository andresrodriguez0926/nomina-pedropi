const fs = require('fs');
let content = fs.readFileSync('app.js', 'utf8');

// 1. Fix Christmas Salary Calculation source to ignore global search AND INCLUDE inactive employees
content = content.replace(
    'const christmasData = window.getVisibleEmployees().filter(e => e.active !== false).map(emp => {',
    'const christmasData = state.employees.filter(emp => window.hasDepartmentAccess(emp.department)).map(emp => {'
);
// In case the file already has the new line from a previous edit
content = content.replace(
    'const christmasData = state.employees.filter(emp => window.hasDepartmentAccess(emp.department) && emp.active !== false).map(emp => {',
    'const christmasData = state.employees.filter(emp => window.hasDepartmentAccess(emp.department)).map(emp => {'
);

// 2. Add lastChristmasData tracking
content = content.replace(
    '    });\n\n    container.innerHTML = `',
    '    });\n\n    window.lastChristmasData = christmasData;\n    container.innerHTML = `'
);

// 3. Add sameReg checking logic inside christmasData map
const targetStr = `const rId = String(r.idNumber || '').trim();
                        const sameId = (rId === empId && empId !== '');`;

const replacementStr = `const rId = String(r.idNumber || '').trim();
                        const rReg = String(r.regNumber || '').trim();
                        const empReg = String(emp.regNumber || '').trim();
                        
                        const sameId = (rId === empId && empId !== '');
                        const sameReg = (rReg === empReg && empReg !== '');`;

if(content.includes(targetStr)) {
    content = content.replace(targetStr, replacementStr);
    
    const ifTarget = `if (sameId) {`;
    const ifReplace = `if (sameId || sameReg) {`;
    content = content.replace(ifTarget, ifReplace);
}

// 4. Add the debug button with SAFE escaping
const debugBtn = `<button class="btn btn-warning" onclick="
    const history = state.payrollHistory || [];
    let msg = 'Debug Guayubin:\\\\n';
    let count = 0;
    history.forEach(run => {
        if(count > 10) return;
        (run.results || []).forEach(r => {
            const empName = (r.fullName || r.employeeName || '').toUpperCase();
            if(r.dept === 'FINCA GUAYUBIN' || r.dept === 'DEPARTAMENTO LOGISTICA BRAVO' || empName.includes('BRAVO')) {
                msg += run.periodEnd + ' - ' + r.fullName + ' - brute:' + r.brute + ' net:' + r.net + '\\\\n';
                count++;
            }
        });
    });
    alert(msg || 'No data found for Guayubin/Bravo in history!');
">Debug Bravo/Guayubin</button>`.replace(/\n/g, '');

content = content.replace(
    '<button class="btn btn-info" onclick="window.renderChristmasReportByDepartment()">',
    '<button class="btn btn-info" onclick="window.renderChristmasReportByDepartment()">\n                    <i class="fas fa-sitemap"></i> Reporte por Depto\n                </button>\n                ' + debugBtn + '\n                <!-- temp -->'
);

fs.writeFileSync('app.js', content, 'utf8');
console.log('Applied fixes and injected debug button safely.');
