const fs = require('fs');
let content = fs.readFileSync('app.js', 'utf8');

const targetStr = `    const christmasData = state.employees.filter(emp => window.hasDepartmentAccess(emp.department)).map(emp => {`;

const replacementStr = `    let baseEmployees = state.employees.filter(emp => window.hasDepartmentAccess(emp.department));
    
    // Add missing employees from history
    (state.payrollHistory || []).forEach(run => {
        const runDate = run.closedAt ? run.closedAt.split('T')[0] : (run.periodEnd || '');
        if (runDate >= filters.startDate && runDate <= filters.endDate) {
            (run.results || []).forEach(r => {
                if (!window.hasDepartmentAccess(r.dept)) return;
                const rName = (r.fullName || r.employeeName || '').trim();
                if (!rName) return;
                
                const rId = String(r.idNumber || '').trim();
                const rReg = String(r.regNumber || '').trim();
                
                const exists = baseEmployees.some(emp => {
                    let empName = \`\${emp.firstName || ''} \${emp.lastName || ''}\`.trim();
                    if (empName.endsWith('undefined')) empName = empName.replace('undefined', '').trim();
                    const sameName = rName.toLowerCase() === empName.toLowerCase() || normalizeName(rName) === normalizeName(empName);
                    const empId = String(emp.idNumber || '').trim();
                    const empReg = String(emp.regNumber || '').trim();
                    const sameId = (rId === empId && empId !== '');
                    const sameReg = (rReg === empReg && empReg !== '');
                    return sameName || sameId || sameReg;
                });
                
                if (!exists) {
                    baseEmployees.push({
                        firstName: rName,
                        lastName: '',
                        idNumber: rId,
                        regNumber: rReg,
                        department: r.dept || 'Sin Departamento'
                    });
                }
            });
        }
    });

    const christmasData = baseEmployees.map(emp => {`;

if(content.includes(targetStr)) {
    content = content.replace(targetStr, replacementStr);
    
    // ALSO FIX empName IN THE MAP!
    const targetEmpName = "const empName = `${emp.firstName} ${emp.lastName}`.trim();";
    const replaceEmpName = `let empName = \`\${emp.firstName || ''} \${emp.lastName || ''}\`.trim();\n            if (empName.endsWith('undefined')) empName = empName.replace('undefined', '').trim();`;
    
    if (content.includes(targetEmpName)) {
        content = content.replace(targetEmpName, replaceEmpName);
    }

    fs.writeFileSync('app.js', content, 'utf8');
    console.log('Fixed missing employees!');
} else {
    console.log('Could not find injection point');
}
