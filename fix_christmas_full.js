const fs = require('fs');
let content = fs.readFileSync('app.js', 'utf8');

// 1. Replace the start of renderChristmasSalary
const target1 = `    // Calculate data for each employee
    const christmasData = window.getVisibleEmployees().filter(e => e.active !== false).map(emp => {
        try {
            const empId = String(emp.idNumber || '').trim();
            const empName = \`\${emp.firstName} \${emp.lastName}\`.trim();`;

const replace1 = `    // Calculate data for each employee
    let baseEmployees = window.getVisibleEmployees().filter(e => e.active !== false);
    
    // Dynamically inject mobile/finca employees that are not in state.employees
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

content = content.replace(target1, replace1);

// 2. Add sameReg logic in the matching loop
const target2 = `                        const rId = String(r.idNumber || '').trim();
                        const sameId = (rId === empId && empId !== '');
                        const sameName = rName === empName.toLowerCase() || normalizeName(rName) === normalizeName(empName);

                        // Strict: Must match ID AND (Name or part of Name), or Name exactly
                        if (sameName) return true;
                        if (sameId) {`;

const replace2 = `                        const rId = String(r.idNumber || '').trim();
                        const rReg = String(r.regNumber || '').trim();
                        const empReg = String(emp.regNumber || '').trim();
                        const sameId = (rId === empId && empId !== '');
                        const sameReg = (rReg === empReg && empReg !== '');
                        const sameName = rName === empName.toLowerCase() || window.normalizeName(rName) === window.normalizeName(empName);

                        // Strict: Must match ID AND (Name or part of Name), or Name exactly
                        if (sameName) return true;
                        if (sameId || sameReg) {`;

content = content.replace(target2, replace2);

// 3. Add department to the mapped object AND save window.lastChristmasData
const target3 = `            return {
                id: empId,
                name: empName,
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

    container.innerHTML = \``;

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

content = content.replace(target3, replace3);

// 4. Fix renderChristmasReportByDepartment ENTIRE FUNCTION
const target4Start = `window.renderChristmasReportByDepartment = () => {`;
const target4End = `    container.appendChild(contentDiv);
};`;

const startIndex = content.indexOf(target4Start);
const endIndex = content.indexOf(target4End, startIndex) + target4End.length;

const replace4 = `window.renderChristmasReportByDepartment = () => {
    const container = document.getElementById('content-area');
    const filters = window.christmasSalaryFilters || { startDate: \`\${new Date().getFullYear()}-01-01\`, endDate: new Date().toISOString().split('T')[0] };

    const depts = {};
    
    state.employees.forEach(e => {
        if (window.hasDepartmentAccess(e.department)) {
            const d = e.department || 'Sin Departamento';
            if (!depts[d]) depts[d] = [];
        }
    });

    // Also include departments from dynamically added history employees
    (window.lastChristmasData || []).forEach(emp => {
        if (emp.department && !depts[emp.department] && window.hasDepartmentAccess(emp.department)) {
            depts[emp.department] = [];
        }
    });

    const christmasData = window.lastChristmasData || [];

    christmasData.forEach(emp => {
        if (emp.calculated > 0) {
            const empId = String(emp.id || '').trim();
            const empName = emp.name;
            const fullEmp = state.employees.find(e => 
                (e.idNumber === empId && empId !== '') || 
                ((e.firstName + ' ' + e.lastName).trim() === empName)
            ) || {};

            const deptName = emp.department || fullEmp.department || 'Sin Departamento';
            if (!depts[deptName]) depts[deptName] = [];
            
            if (!depts[deptName].some(e => e.name === emp.name)) {
                depts[deptName].push({
                    name: emp.name + (fullEmp.active === false ? ' (Inactivo)' : ''),
                    idNumber: emp.id || fullEmp.idNumber || '-',
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
        
        <div class="card mt-4 no-print">
            <div class="form-group mb-0" style="max-width: 400px">
                <label>Filtrar Departamentos (\${currentFilter.length} seleccionados)</label>
                <div class="dropdown">
                    <button class="btn btn-secondary dropdown-toggle" style="width: 100%; text-align: left; display: flex; justify-content: space-between; align-items: center;" type="button" onclick="this.nextElementSibling.classList.toggle('show')">
                        <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                            \${currentFilter.length === sortedDepts.length ? 'Todos los departamentos' : currentFilter.length + ' departamentos'}
                        </span>
                        <i class="fas fa-chevron-down"></i>
                    </button>
                    <div class="dropdown-menu" style="width: 100%; max-height: 300px; overflow-y: auto; padding: 10px; background: #2a2a35; color: white;">
                        <label style="display: block; margin-bottom: 8px; cursor: pointer;">
                            <input type="checkbox" onchange="window.selectAllChristmasDeptsReport(this.checked)" \${currentFilter.length === sortedDepts.length ? 'checked' : ''}>
                            <strong style="color: white;">Seleccionar Todos</strong>
                        </label>
                        <hr style="border-color: #444; margin: 5px 0;">
                        \${sortedDepts.map(d => \`
                            <label style="display: block; margin-bottom: 5px; cursor: pointer; color: white;">
                                <input type="checkbox" value="\${d}" \${currentFilter.includes(d) ? 'checked' : ''} onchange="window.toggleChristmasDeptReport('\${d}')">
                                \${d}
                            </label>
                        \`).join('')}
                    </div>
                </div>
            </div>
        </div>

        <div class="card mt-4" id="christmas-dept-report-content">
            <div style="text-align: center; margin-bottom: 30px;">
                <h2>Reporte Salario de Navidad por Departamento</h2>
                <p>Rango de Cálculo: \${filters.startDate} al \${filters.endDate}</p>
            </div>
    \`;

    const deptsToRender = currentFilter.sort((a, b) => a.localeCompare(b));
    let grandTotal = 0;

    deptsToRender.forEach(deptName => {
        let deptTotal = 0;
        let rows = '';

        depts[deptName].sort((a, b) => a.name.localeCompare(b.name)).forEach(emp => {
            deptTotal += emp.calculated;
            rows += \`
                <tr>
                    <td>\${emp.name}</td>
                    <td>\${emp.idNumber || '-'}</td>
                    <td style="text-align: right">\$\${emp.accumulated.toFixed(2)}</td>
                    <td style="text-align: right"><strong>\$\${emp.calculated.toFixed(2)}</strong></td>
                </tr>
            \`;
        });

        grandTotal += deptTotal;

        reportHtml += \`
            <h4 style="color: #4da3ff; margin-top: 30px; border-bottom: 1px solid #4da3ff; padding-bottom: 5px;">Departamento: \${deptName}</h4>
            <table class="table">
                <thead>
                    <tr>
                        <th>EMPLEADO</th>
                        <th>CÉDULA</th>
                        <th style="text-align: right">TOTAL ACUMULADO</th>
                        <th style="text-align: right">NAVIDAD CALCULADA (1/12)</th>
                    </tr>
                </thead>
                <tbody>
                    \${rows || '<tr><td colspan="4" style="text-align:center">No hay empleados con cálculo mayor a 0</td></tr>'}
                </tbody>
                <tfoot>
                    <tr>
                        <td colspan="3" style="text-align: right; border-top: 2px solid #555;"><strong>SUBTOTAL \${deptName}:</strong></td>
                        <td style="text-align: right; border-top: 2px solid #555;"><strong>\$\${deptTotal.toFixed(2)}</strong></td>
                    </tr>
                </tfoot>
            </table>
        \`;
    });

    reportHtml += \`
            <div style="margin-top: 40px; padding-top: 20px; border-top: 3px double #4da3ff; text-align: right;">
                <h3 style="color: #4da3ff; margin: 0;">TOTAL GENERAL NAVIDAD: \$\${grandTotal.toFixed(2)}</h3>
            </div>
        </div>
    \`;

    container.innerHTML = '';
    const contentDiv = document.createElement('div');
    contentDiv.innerHTML = reportHtml;
    container.appendChild(contentDiv);
};`;

content = content.substring(0, startIndex) + replace4 + content.substring(endIndex);

// Add the buttons to renderChristmasSalary UI
const targetButtons = `<button class="btn btn-secondary" style="height: 42px;" id="chr-refresh-btn">
                    <i class="fas fa-sync-alt"></i> Recalcular con Fechas
                </button>
            </div>`;
const replaceButtons = `<button class="btn btn-secondary" style="height: 42px;" id="chr-refresh-btn">
                    <i class="fas fa-sync-alt"></i> Recalcular con Fechas
                </button>
                <button class="btn btn-info" style="height: 42px;" onclick="window.renderChristmasReportByDepartment()">
                    <i class="fas fa-sitemap"></i> Reporte por Depto
                </button>
                <button class="btn btn-warning" style="height: 42px;" onclick="
                    const chrData = window.lastChristmasData || [];
                    let msg = 'Debug Christmas Data:\\n';
                    let count = 0;
                    chrData.forEach(emp => {
                        const ename = (emp.name || '').toUpperCase();
                        if (ename.includes('MELLO') || ename.includes('YODLEN') || emp.department === 'FINCA GUAYUBIN' || emp.department === 'DEPARTAMENTO LOGISTICA BRAVO' || ename.includes('BRAVO') || ename.includes('GUAYUBIN')) {
                            msg += emp.name + ' (' + emp.department + ') - Acc: ' + emp.accumulated + ' Calc: ' + emp.calculated + ' Details: ' + (emp.detailList ? emp.detailList.length : 0) + '\\n';
                            count++;
                        }
                    });
                    alert(msg || 'No data found in lastChristmasData!');
                "><i class="fas fa-bug"></i> Debug Bravo/Guayubin</button>
            </div>`;

if (content.includes(targetButtons)) {
    content = content.replace(targetButtons, replaceButtons);
}

fs.writeFileSync('app.js', content, 'utf8');
console.log('Fixed ALL OF IT AT ONCE');
