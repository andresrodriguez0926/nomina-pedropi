const fs = require('fs');
let content = fs.readFileSync('app.js', 'utf8');

// Normalize line endings
content = content.replace(/\\r\\n/g, '\\n');

const target1 = "    // Calculate data for each employee\\n    const christmasData = window.getVisibleEmployees().filter(e => e.active !== false).map(emp => {\\n        try {\\n            const empId = String(emp.idNumber || '').trim();\\n            const empName = `${emp.firstName} ${emp.lastName}`.trim();";

const replace1 = `    // Calculate data for each employee
    let baseEmployees = window.getVisibleEmployees().filter(e => e.active !== false);

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
                    const sameName = rName.toLowerCase() === empName.toLowerCase() || window.normalizeName(rName) === window.normalizeName(empName);
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

    const christmasData = baseEmployees.map(emp => {
        try {
            const empId = String(emp.idNumber || '').trim();
            let empName = \`\${emp.firstName || ''} \${emp.lastName || ''}\`.trim();
            if (empName.endsWith('undefined')) empName = empName.replace('undefined', '').trim();`;

if (content.indexOf(target1) !== -1) {
    content = content.replace(target1, replace1);
    console.log('Target 1 replaced!');
} else {
    console.log('Target 1 NOT found!');
}

const target2 = "                        const rId = String(r.idNumber || '').trim();\\n                        const sameId = (rId === empId && empId !== '');\\n                        const sameName = rName === empName.toLowerCase() || normalizeName(rName) === normalizeName(empName);\\n\\n                        // Strict: Must match ID AND (Name or part of Name), or Name exactly\\n                        if (sameName) return true;\\n                        if (sameId) {";

const replace2 = `                        const rId = String(r.idNumber || '').trim();
                        const rReg = String(r.regNumber || '').trim();
                        const empReg = String(emp.regNumber || '').trim();
                        
                        const sameId = (rId === empId && empId !== '');
                        const sameReg = (rReg === empReg && empReg !== '');
                        const sameName = rName === empName.toLowerCase() || window.normalizeName(rName) === window.normalizeName(empName);

                        // Strict: Must match ID AND (Name or part of Name), or Name exactly
                        if (sameName) return true;
                        if (sameId || sameReg) {`;

if (content.indexOf(target2) !== -1) {
    content = content.replace(target2, replace2);
    console.log('Target 2 replaced!');
} else {
    console.log('Target 2 NOT found!');
}

const target3 = "            return {\\n                id: empId,\\n                name: empName,\\n                startDate: startDate,\\n                endDate: endDate,\\n                accumulated: accumulated,\\n                calculated: calculated,\\n                agreement: 'si',\\n                manualAmount: calculated.toFixed(2),\\n                payrollsCounted: payrollsCounted,\\n                detailList: detailList\\n            };\\n        } catch (e) {\\n            console.error(\\"Error calculation:\\", e);\\n            return { name: emp.firstName + ' (Error)', startDate: '-', endDate: '-', accumulated: 0, calculated: 0, agreement: 'si', manualAmount: '0.00' };\\n        }\\n    });\\n\\n    container.innerHTML = `";

const replace3 = `            return {
                id: empId,
                name: empName,
                department: emp.department || 'Sin Departamento',
                startDate: startDate,
                endDate: endDate,
                accumulated: accumulated,
                calculated: calculated,
                agreement: 'si',
                manualAmount: calculated.toFixed(2),
                payrollsCounted: payrollsCounted,
                detailList: detailList
            };
        } catch (e) {
            console.error("Error calculation:", e);
            return { name: emp.firstName + ' (Error)', startDate: '-', endDate: '-', accumulated: 0, calculated: 0, agreement: 'si', manualAmount: '0.00' };
        }
    });

    window.lastChristmasData = christmasData;

    container.innerHTML = \``;

if (content.indexOf(target3) !== -1) {
    content = content.replace(target3, replace3);
    console.log('Target 3 replaced!');
} else {
    console.log('Target 3 NOT found!');
}

const reportFuncStr = `
window.toggleChristmasDeptReport = (deptName) => {
    if (!window.currentChristmasDeptFilter) return;
    const idx = window.currentChristmasDeptFilter.indexOf(deptName);
    if (idx > -1) window.currentChristmasDeptFilter.splice(idx, 1);
    else window.currentChristmasDeptFilter.push(deptName);
    window.renderChristmasReportByDepartment();
};

window.selectAllChristmasDeptsReport = (all) => {
    if (all) {
        window.currentChristmasDeptFilter = [...(window.allChristmasDeptsReport || [])];
    } else {
        window.currentChristmasDeptFilter = [];
    }
    window.renderChristmasReportByDepartment();
};

window.renderChristmasReportByDepartment = () => {
    const container = document.getElementById('content-area');
    const filters = window.christmasSalaryFilters || { startDate: \`\${new Date().getFullYear()}-01-01\`, endDate: new Date().toISOString().split('T')[0] };

    const depts = {};
    
    // Original departments
    state.employees.forEach(e => {
        if (window.hasDepartmentAccess(e.department)) {
            const d = e.department || 'Sin Departamento';
            if (!depts[d]) depts[d] = [];
        }
    });

    // Departments from dynamic history employees
    const christmasData = window.lastChristmasData || [];
    christmasData.forEach(emp => {
        if (emp.department && !depts[emp.department] && window.hasDepartmentAccess(emp.department)) {
            depts[emp.department] = [];
        }
    });

    christmasData.forEach(emp => {
        if (emp.calculated > 0) {
            const deptName = emp.department || 'Sin Departamento';
            if (!depts[deptName]) depts[deptName] = [];
            
            if (!depts[deptName].some(e => e.name === emp.name)) {
                depts[deptName].push({
                    name: emp.name,
                    idNumber: emp.id || '-',
                    accumulated: emp.accumulated,
                    calculated: emp.calculated
                });
            }
        }
    });

    const sortedDepts = Object.keys(depts).sort((a, b) => a.localeCompare(b));
    window.allChristmasDeptsReport = sortedDepts;

    if (!window.currentChristmasDeptFilter) {
        window.currentChristmasDeptFilter = [...sortedDepts];
    }
    const currentFilter = window.currentChristmasDeptFilter;

    let reportHtml = \`
        <div class="header-action no-print">
            <h1>Reporte Salario de Navidad por Departamento</h1>
            <div>
                <button class="btn btn-secondary" onclick="renderSection('christmas-salary')">
                    <i class="fas fa-arrow-left"></i> Volver
                </button>
                <button class="btn btn-primary" onclick="window.print()">
                    <i class="fas fa-print"></i> Imprimir
                </button>
            </div>
        </div>

        <div class="no-print mb-4 mt-3" style="background: var(--glass-bg); padding: 15px; border-radius: 8px; border: 1px solid rgba(0,0,0,0.1);">
            <div class="multi-select-container" style="max-width: 400px; position: relative;">
                <div class="multi-select-header" onclick="this.nextElementSibling.classList.toggle('show')" style="cursor: pointer; padding: 10px; background: var(--card-bg, #1e1e2f); color: white; border: 1px solid rgba(255,255,255,0.2); border-radius: 5px;">
                    Filtrar Departamentos (\${currentFilter.length} seleccionados) <i class="fas fa-chevron-down" style="float: right; margin-top: 4px;"></i>
                </div>
                <div class="multi-select-content" style="display: none; position: absolute; z-index: 100; background: var(--card-bg, #1e1e2f); color: white; border: 1px solid rgba(255,255,255,0.2); border-radius: 5px; width: 100%; max-height: 300px; overflow-y: auto; margin-top: 5px; box-shadow: 0 4px 6px rgba(0,0,0,0.3);">
                    <div class="multi-select-actions" style="padding: 10px; border-bottom: 1px solid rgba(255,255,255,0.1); display: flex; gap: 10px;">
                        <button class="btn btn-sm btn-secondary" onclick="window.selectAllChristmasDeptsReport(true)" style="flex: 1;">Todos</button>
                        <button class="btn btn-sm btn-secondary" onclick="window.selectAllChristmasDeptsReport(false)" style="flex: 1;">Ninguno</button>
                    </div>
                    \${sortedDepts.map(d => \`
                        <div class="multi-select-item" onclick="window.toggleChristmasDeptReport('\${d}')" style="padding: 8px 10px; cursor: pointer; border-bottom: 1px solid rgba(255,255,255,0.05); display: flex; align-items: center; transition: background 0.2s;" onmouseover="this.style.background='rgba(255,255,255,0.05)'" onmouseout="this.style.background='transparent'">
                            <input type="checkbox" \${currentFilter.includes(d) ? 'checked' : ''} onclick="event.stopPropagation(); window.toggleChristmasDeptReport('\${d}')" style="margin: 0; cursor: pointer;">
                            <span style="margin-left: 8px;">\${d}</span>
                        </div>
                    \`).join('')}
                </div>
            </div>
            <style>
                .multi-select-content.show { display: block !important; }
            </style>
        </div>

        <div class="card mt-4 print-area">
            <h2 style="text-align: center; margin-bottom: 5px;">Reporte Salario de Navidad por Departamento</h2>
            <p style="text-align: center; font-weight: 500; color: var(--gray); margin-bottom: 20px;">
                Rango de Cálculo: \${filters.startDate} al \${filters.endDate}
            </p>
    \`;

    let totalGenCalculated = 0;
    const deptsToRender = sortedDepts.filter(d => currentFilter.includes(d));

    if (deptsToRender.length === 0) {
        reportHtml += \`<p style="text-align: center; margin-top: 30px;">No hay datos para mostrar con los filtros seleccionados.</p>\`;
    }

    deptsToRender.forEach(deptName => {
        let deptTotal = 0;
        let rows = '';

        depts[deptName].sort((a, b) => a.name.localeCompare(b.name)).forEach(emp => {
            deptTotal += emp.calculated;
            totalGenCalculated += emp.calculated;

            rows += \`
                <tr>
                    <td>\${emp.name}</td>
                    <td>\${emp.idNumber || '-'}</td>
                    <td class="td-numeric">$\${emp.accumulated.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td class="td-numeric" style="font-weight: bold; color: var(--primary);">$\${emp.calculated.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                </tr>
            \`;
        });

        reportHtml += \`
            <h3 style="margin-top: 30px; margin-bottom: 10px; color: var(--accent-color); border-bottom: 2px solid var(--accent-color); padding-bottom: 5px;">
                Departamento: \${deptName}
            </h3>
            <table class="data-table" style="table-layout: fixed; width: 100%;">
                <thead>
                    <tr>
                        <th style="width: 40%;">Empleado</th>
                        <th style="width: 20%;">Cédula</th>
                        <th class="text-right" style="width: 20%;">Total Acumulado</th>
                        <th class="text-right" style="width: 20%;">Navidad Calculada (1/12)</th>
                    </tr>
                </thead>
                <tbody>
                    \${rows || '<tr><td colspan="4" style="text-align:center">No hay empleados con cálculo mayor a 0</td></tr>'}
                </tbody>
                <tfoot style="display: table-row-group; font-weight: bold; border-top: 2px solid #ddd;">
                    <tr>
                        <td colspan="2" class="text-right">SUBTOTAL \${deptName}:</td>
                        <td class="td-numeric"></td>
                        <td class="td-numeric">$\${deptTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    </tr>
                </tfoot>
            </table>
        \`;
    });

    if (totalGenCalculated > 0) {
        reportHtml += \`
            <div style="margin-top: 30px; text-align: right; padding: 15px; background: var(--glass-bg); border-radius: 8px; border: 2px solid var(--accent-color);">
                <span style="font-size: 1.2rem; font-weight: bold; color: var(--gray);">TOTAL GENERAL NAVIDAD: </span>
                <span style="font-size: 1.5rem; font-weight: bold; color: var(--success); margin-left: 10px;">
                    $\${totalGenCalculated.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
            </div>
        \`;
    }

    reportHtml += \`</div>\`;
    container.innerHTML = reportHtml;
};
`;

if (content.indexOf('window.renderChristmasReportByDepartment = () => {') === -1) {
    const insertIdx = content.indexOf('window.quickAddChristmasSalary = (');
    if (insertIdx !== -1) {
        const before = content.substring(0, insertIdx);
        const after = content.substring(insertIdx);
        content = before + '\\n' + reportFuncStr + '\\n' + after;
        console.log('Report function inserted!');
    }
}

const btnIdx = content.indexOf('id="chr-refresh-btn">');
if (btnIdx !== -1) {
    const afterBtn = content.indexOf('</button>', btnIdx) + 9;
    const before = content.substring(0, afterBtn);
    const after = content.substring(afterBtn);
    const btns = `
                <button class="btn btn-info" style="height: 42px;" onclick="window.renderChristmasReportByDepartment()">
                    <i class="fas fa-sitemap"></i> Reporte por Depto
                </button>
                <button class="btn btn-warning" style="height: 42px;" onclick="
                    const chrData = window.lastChristmasData || [];
                    let msg = 'Debug Christmas Data:\\\\n';
                    let count = 0;
                    chrData.forEach(emp => {
                        const ename = (emp.name || '').toUpperCase();
                        if (ename.includes('MELLO') || ename.includes('YODLEN') || emp.department === 'FINCA GUAYUBIN' || emp.department === 'DEPARTAMENTO LOGISTICA BRAVO' || ename.includes('BRAVO') || ename.includes('GUAYUBIN')) {
                            msg += emp.name + ' (' + emp.department + ') - Acc: ' + emp.accumulated + ' Calc: ' + emp.calculated + ' Details: ' + (emp.detailList ? emp.detailList.length : 0) + '\\\\n';
                            count++;
                        }
                    });
                    alert(msg || 'No data found in lastChristmasData!');
                "><i class="fas fa-bug"></i> Debug Bravo/Guayubin</button>`;
    
    content = before + btns + after;
    console.log('Buttons inserted!');
}

fs.writeFileSync('app.js', content, 'utf8');
console.log('ALL FIXES APPLIED SUCCESSFULLY!');
