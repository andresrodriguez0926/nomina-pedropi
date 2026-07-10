const fs = require('fs');
let content = fs.readFileSync('apply_christmas_fixes.js', 'utf8');

// Replace the string replacement with a robust indexOf replacement
content = content.replace(`if (content.includes(targetButtons)) {
    content = content.replace(targetButtons, replaceButtons);
}`, `
const btnIdx = content.indexOf('id="chr-refresh-btn">');
if (btnIdx !== -1) {
    const afterBtn = content.indexOf('</button>', btnIdx) + 9;
    const before = content.substring(0, afterBtn);
    const after = content.substring(afterBtn);
    content = before + '\\n                <button class="btn btn-info" style="height: 42px;" onclick="window.renderChristmasReportByDepartment()">' +
                     '\\n                    <i class="fas fa-sitemap"></i> Reporte por Depto' +
                     '\\n                </button>' +
                     '\\n                <button class="btn btn-warning" style="height: 42px;" onclick="' +
                     '\\n                    const chrData = window.lastChristmasData || [];' +
                     '\\n                    let msg = \\'Debug Christmas Data:\\\\\\n\\';' +
                     '\\n                    let count = 0;' +
                     '\\n                    chrData.forEach(emp => {' +
                     '\\n                        const ename = (emp.name || \\'\\').toUpperCase();' +
                     '\\n                        if (ename.includes(\\'MELLO\\') || ename.includes(\\'YODLEN\\') || emp.department === \\'FINCA GUAYUBIN\\' || emp.department === \\'DEPARTAMENTO LOGISTICA BRAVO\\' || ename.includes(\\'BRAVO\\') || ename.includes(\\'GUAYUBIN\\')) {' +
                     '\\n                            msg += emp.name + \\' (\\' + emp.department + \\') - Acc: \\' + emp.accumulated + \\' Calc: \\' + emp.calculated + \\' Details: \\' + (emp.detailList ? emp.detailList.length : 0) + \\'\\\\\\n\\';' +
                     '\\n                            count++;' +
                     '\\n                        }' +
                     '\\n                    });' +
                     '\\n                    alert(msg || \\'No data found in lastChristmasData!\\');' +
                     '\\n                "><i class="fas fa-bug"></i> Debug Bravo/Guayubin</button>' + after;
}`);

fs.writeFileSync('apply_christmas_fixes.js', content, 'utf8');
