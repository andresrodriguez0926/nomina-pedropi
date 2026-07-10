const fs = require('fs');
let content = fs.readFileSync('app.js', 'utf8');

// 1. Add department to the mapped object in renderChristmasSalary
const targetReturn = `            return {
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
            };`;

const newReturn = `            return {
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
            };`;

if (content.includes(targetReturn)) {
    content = content.replace(targetReturn, newReturn);
}

// 2. Fix the lookup in renderChristmasReportByDepartment
const targetDeptLookup = `            const deptName = fullEmp.department || 'Sin Departamento';`;
const newDeptLookup = `            const deptName = emp.department || fullEmp.department || 'Sin Departamento';`;

if (content.includes(targetDeptLookup)) {
    content = content.replace(targetDeptLookup, newDeptLookup);
}

// 3. Make sure 'depts' adds all departments from christmasData too
const targetDeptsInit = `    state.employees.forEach(e => {
        if (window.hasDepartmentAccess(e.department)) {
            const d = e.department || 'Sin Departamento';
            if (!depts[d]) depts[d] = [];
        }
    });`;

const newDeptsInit = `    state.employees.forEach(e => {
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
    });`;

if (content.includes(targetDeptsInit)) {
    content = content.replace(targetDeptsInit, newDeptsInit);
}

fs.writeFileSync('app.js', content, 'utf8');
console.log('Fixed report grouping!');
