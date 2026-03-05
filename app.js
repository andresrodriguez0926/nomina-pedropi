/**
         * Payroll App Core Engine
         * Handles routing, state, and UI rendering
         */

// --- State Management ---
window.addEventListener('error', function (e) {
    const contentArea = document.getElementById('content-area');
    if (contentArea) {
        contentArea.innerHTML = `<div style="padding: 20px; color: #ef4444; background: #fff; border: 1px solid #ef4444; border-radius: 8px; margin: 20px;">
                    <h3>Error Interno</h3>
                    <p>${e.message}</p>
                    <small>Línea: ${e.lineno}</small>
                </div>`;
    } else {
        alert("Error: " + e.message);
    }
});

const state = {
    currentSection: 'dashboard',
    departments: JSON.parse(localStorage.getItem('payroll_departments') || '[]'),
    operations: JSON.parse(localStorage.getItem('payroll_operations') || '[]'),
    activities: JSON.parse(localStorage.getItem('payroll_activities') || '[]'),
    employees: JSON.parse(localStorage.getItem('payroll_employees') || '[]'),
    periods: JSON.parse(localStorage.getItem('payroll_periods') || '[]'),
    activePayrolls: (() => {
        const stored = localStorage.getItem('payroll_active');
        if (!stored || stored === 'null') return [];
        try {
            const parsed = JSON.parse(stored);
            return Array.isArray(parsed) ? parsed : [parsed];
        } catch { return []; }
    })(),
    overtime: JSON.parse(localStorage.getItem('payroll_overtime') || '[]'),
    discounts: JSON.parse(localStorage.getItem('payroll_discounts') || '[]'),
    incentives: JSON.parse(localStorage.getItem('payroll_incentives') || '[]'),
    christmasSalary: JSON.parse(localStorage.getItem('payroll_christmas') || '[]'),
    payrollHistory: JSON.parse(localStorage.getItem('payroll_history') || '[]'),
    vacations: JSON.parse(localStorage.getItem('payroll_vacations') || '[]'),
    globalSearchQuery: '',
    settings: JSON.parse(localStorage.getItem('payroll_settings') || JSON.stringify({
        tss_rate: 0.05,
        payrollAccounts: {},
        isrThresholds: {
            exempt: 416220.00,
            mid: 624329.00,
            high: 867123.00,
            base1: 31216.00,
            base2: 79776.00
        }
    }))
};

window.globalState = state; // Allow firebase-backend to write directly to it
window.state = state; // Backup explicit reference

// --- Access Control Utilities ---
window.hasDepartmentAccess = (deptName) => {
    if (!window.globalState || !window.globalState.currentUser) return true;
    const user = window.globalState.currentUser;
    if (user.role === 'admin') return true;
    if (!user.allowedDepartments || user.allowedDepartments.length === 0) return true; // Default to all if nothing selected
    return user.allowedDepartments.includes(deptName);
};

window.getVisibleEmployees = () => {
    let emps = state.employees.filter(emp => window.hasDepartmentAccess(emp.department));

    if (state.globalSearchQuery && state.globalSearchQuery.trim() !== '') {
        const q = state.globalSearchQuery.toLowerCase().trim();
        emps = emps.filter(emp => {
            const fullName = `${emp.firstName} ${emp.lastName}`.toLowerCase();
            const idNumber = (emp.idNumber || '').toLowerCase();
            const regNumber = (emp.regNumber || '').toString();
            return fullName.includes(q) || idNumber.includes(q) || regNumber.includes(q);
        });
    }

    return emps;
};

// --- Migration & Utilities ---
window.assignSequentialNumbers = () => {
    const modules = [
        { key: 'departments', numKey: 'deptNumber' },
        { key: 'operations', numKey: 'opNumber' },
        { key: 'activities', numKey: 'actNumber' },
        { key: 'employees', numKey: 'regNumber' },
        { key: 'discounts', numKey: 'loanNumber' },
        { key: 'overtime', numKey: 'otNumber' },
        { key: 'incentives', numKey: 'incNumber' },
        { key: 'payrollHistory', numKey: 'payrollNumber' }
    ];

    modules.forEach(m => {
        if (!state[m.key]) return;
        let max = 0;
        state[m.key].forEach(item => {
            const num = parseInt(item[m.numKey]);
            if (!isNaN(num) && num > max) max = num;
        });

        state[m.key].forEach(item => {
            if (!item[m.numKey]) {
                max++;
                item[m.numKey] = max;
            }
            if (!item.createdBy) {
                item.createdBy = m.key === 'payrollHistory' ? 'Sistema (Cierre)' : 'Sistema';
            }
        });
    });

    // Handle nested daily logs in active payrolls
    if (state.activePayrolls) {
        state.activePayrolls.forEach(payroll => {
            if (payroll && payroll.dailyLogs) {
                let maxLog = 0;
                payroll.dailyLogs.forEach(log => {
                    const num = parseInt(log.logNumber);
                    if (!isNaN(num) && num > maxLog) maxLog = num;
                });
                payroll.dailyLogs.forEach(log => {
                    if (!log.logNumber) {
                        maxLog++;
                        log.logNumber = maxLog;
                    }
                    if (!log.createdBy) log.createdBy = 'Sistema';
                    if (!log.id) log.id = Date.now().toString(36) + Math.random().toString(36).substring(2);
                });
            }
        });
    }
};

// Initial run
window.assignSequentialNumbers();

window.syncToLocalStorage = () => {
    localStorage.setItem('payroll_departments', JSON.stringify(state.departments || []));
    localStorage.setItem('payroll_operations', JSON.stringify(state.operations || []));
    localStorage.setItem('payroll_activities', JSON.stringify(state.activities || []));
    localStorage.setItem('payroll_employees', JSON.stringify(state.employees || []));
    localStorage.setItem('payroll_periods', JSON.stringify(state.periods || []));
    localStorage.setItem('payroll_active', JSON.stringify(state.activePayrolls || []));
    localStorage.setItem('payroll_discounts', JSON.stringify(state.discounts || []));
    localStorage.setItem('payroll_incentives', JSON.stringify(state.incentives || []));
    localStorage.setItem('payroll_overtime', JSON.stringify(state.overtime || []));
    localStorage.setItem('payroll_christmas', JSON.stringify(state.christmasSalary || []));
    localStorage.setItem('payroll_history', JSON.stringify(state.payrollHistory || []));
    localStorage.setItem('payroll_vacations', JSON.stringify(state.vacations || []));
    localStorage.setItem('payroll_settings', JSON.stringify(state.settings || {}));
};

const saveState = () => {
    // Local Storage Persistence (Always execute for safety and offline support)
    window.syncToLocalStorage();

    // Prevent attempting to save state before Firebase has loaded the actual production data
    if (window.isFirebaseStateLoaded === false) {
        console.warn("Carga inicial de la nube en proceso. Guardado prevenido para no borrar datos en Firebase, aunque se guardaron localmente.");
        return;
    }

    if (window.saveStateToFirebase) {
        window.saveStateToFirebase();
    } else {
        console.log("Saving state locally (pending firebase link)");
    }
};

const calculateLegislativeDays = (start, end) => {
    let current = new Date(start.getTime());
    let total = 0;
    // Ensure we are comparing dates only, reset time to 00:00:00
    current.setHours(0, 0, 0, 0);
    const endDate = new Date(end.getTime());
    endDate.setHours(0, 0, 0, 0);

    while (current <= endDate) {
        const day = current.getDay(); // 0: Sun, 1: Mon, ..., 6: Sat
        if (day >= 1 && day <= 5) {
            total += 1; // Mon-Fri
        } else if (day === 6) {
            total += 0.5; // Sat
        }
        // Sunday (0) is implicit 0
        current.setDate(current.getDate() + 1);
    }
    return total;
};

const getPayrollBounds = (payrollId) => {
    if (!state.activePayrolls || state.activePayrolls.length === 0) return null;
    let payroll = state.activePayrolls[0];
    if (payrollId) {
        const found = state.activePayrolls.find(p => p.id === payrollId || p.id == payrollId);
        if (found) payroll = found;
    }

    if (!payroll) return null;
    const startStr = payroll.startDate;
    const pType = (payroll.periodType || '').toLowerCase();
    const period = state.periods.find(p => p.name.toLowerCase() === pType || pType.includes(p.name.toLowerCase()));

    if (!period) {
        // Infer end date if period object is missing
        let inferredEnd = new Date(startStr + 'T00:00:00');
        if (pType.includes('bisemanal')) inferredEnd.setDate(inferredEnd.getDate() + 13);
        else if (pType.includes('quincenal')) inferredEnd.setDate(inferredEnd.getDate() + 14);
        else if (pType.includes('semanal')) inferredEnd.setDate(inferredEnd.getDate() + 6);
        else if (pType.includes('mensual')) {
            inferredEnd.setMonth(inferredEnd.getMonth() + 1);
            inferredEnd.setDate(0);
        } else {
            return { min: startStr, max: '' };
        }
        return { min: startStr, max: inferredEnd.toISOString().split('T')[0] };
    }

    const start = new Date(startStr + 'T00:00:00');
    let end = new Date(start);

    switch (period.frequency) {
        case 'Semanal': end.setDate(start.getDate() + 6); break;
        case 'Bisemanal': end.setDate(start.getDate() + 13); break;
        case 'Quincenal': end.setDate(start.getDate() + 14); break;
        case 'Mensual':
            end.setMonth(start.getMonth() + 1);
            end.setDate(0);
            break;
    }

    return {
        min: startStr,
        max: end.toISOString().split('T')[0]
    };
};

const calculateMonthlyISR = (monthlyTaxableIncome) => {
    const annualIncome = monthlyTaxableIncome * 12;
    const t = state.settings.isrThresholds;
    let annualISR = 0;

    if (annualIncome <= t.exempt) {
        annualISR = 0;
    } else if (annualIncome <= t.mid) {
        annualISR = (annualIncome - (t.exempt + 0.01)) * 0.15;
    } else if (annualIncome <= t.high) {
        annualISR = t.base1 + (annualIncome - (t.mid + 0.01)) * 0.20;
    } else {
        annualISR = t.base2 + (annualIncome - (t.high + 0.01)) * 0.25;
    }

    return annualISR / 12;
};

// --- Router ---
const initRouter = () => {
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
        item.addEventListener('click', () => {
            const section = item.getAttribute('data-section');
            if (section) {
                switchSection(section);
            }
        });
    });
};

window.switchSection = (sectionId) => {
    state.currentSection = sectionId;

    // Update Sidebar
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.toggle('active', item.getAttribute('data-section') === sectionId);
    });

    window.renderSection(sectionId);
};

// --- Rendering Logic ---
window.renderSection = (sectionId) => {
    const contentArea = document.getElementById('content-area');
    contentArea.innerHTML = '<div class="loading-spinner"><div class="spinner"></div></div>';

    // Small delay for smooth transition feel
    setTimeout(() => {
        contentArea.classList.remove('content-fade');
        void contentArea.offsetWidth; // Trigger reflow
        contentArea.classList.add('content-fade');

        switch (sectionId) {
            case 'dashboard': renderDashboard(contentArea); break;
            case 'users': renderUsers(contentArea); break;
            case 'departments': renderDepartments(contentArea); break;
            case 'operations': renderOperations(contentArea); break;
            case 'activities': renderActivities(contentArea); break;
            case 'employees': renderEmployees(contentArea); break;
            case 'tss': renderTSS(contentArea); break;
            case 'periods': renderPeriods(contentArea); break;
            case 'discounts': renderDiscounts(contentArea); break;
            case 'overtime': renderOvertime(contentArea); break;
            case 'incentives': renderIncentives(contentArea); break;
            case 'christmas-salary': renderChristmasSalary(contentArea); break;
            case 'payroll-runs': renderPayrollRuns(contentArea); break;
            case 'daily-registration': renderDailyRegistration(contentArea); break;
            case 'closing': renderClosing(contentArea); break;
            case 'reports': renderReports(contentArea); break;
            case 'employee-record': renderEmployeeRecord(contentArea); break;
            case 'payroll-entry': renderPayrollEntry(contentArea); break;
            case 'benefits': renderBenefits(contentArea); break;
            case 'vacations': renderVacations(contentArea); break;
            case 'isr': renderISR(contentArea); break;
            default:
                contentArea.innerHTML = `<h2>Módulo ${sectionId} en construcción</h2>`;
        }
    }, 150);
};

// --- Data Migration (Export / Import) ---
window.exportLocalData = () => {
    const dump = {
        departments: state.departments,
        operations: state.operations,
        activities: state.activities,
        employees: state.employees,
        periods: state.periods,
        activePayrolls: state.activePayrolls,
        discounts: state.discounts,
        incentives: state.incentives,
        overtime: state.overtime,
        christmasSalary: state.christmasSalary,
        payrollHistory: state.payrollHistory,
        settings: state.settings
    };
    const json = JSON.stringify(dump);
    navigator.clipboard.writeText(json).then(() => {
        alert("¡Tus datos locales han sido copiados! Ve a la versión de la nube (Netlify), dale a 'Importar' y pégalos.");
    }).catch(err => {
        prompt("Hubo un error al copiar automáticamente. Copia el siguiente texto manualmente:", json);
    });
};

window.importLocalData = () => {
    const json = prompt("Pega aquí los datos que exportaste de tu PC:");
    if (!json) return;
    try {
        const dump = JSON.parse(json);
        state.departments = dump.departments || [];
        state.operations = dump.operations || [];
        state.activities = dump.activities || [];
        state.employees = dump.employees || [];
        state.periods = dump.periods || [];
        state.activePayrolls = dump.activePayrolls || (dump.activePayroll ? [dump.activePayroll] : []);
        state.discounts = dump.discounts || [];
        state.incentives = dump.incentives || [];
        state.overtime = dump.overtime || [];
        state.christmasSalary = dump.christmasSalary || [];
        state.payrollHistory = dump.payrollHistory || [];
        state.settings = dump.settings || {};

        saveState(); // Trigger a Firebase save
        alert("¡Datos importados y subidos a la nube exitosamente! La página se recargará.");
        setTimeout(() => window.location.reload(), 1000);
    } catch (e) {
        alert("Código inválido. Asegúrate de pegar el texto exacto.");
    }
};

// --- Module: Dashboard ---
const renderDashboard = (container) => {
    // --- Data Extraction for Charts ---
    const monthlyExpenses = {};
    state.payrollHistory.forEach(run => {
        if (!run.periodStart) return;
        const monthKey = run.periodStart.substring(0, 7);
        const runTotalBrute = run.results.reduce((sum, res) => sum + (res.brute || 0), 0);
        if (!monthlyExpenses[monthKey]) monthlyExpenses[monthKey] = 0;
        monthlyExpenses[monthKey] += runTotalBrute;
    });

    const sortedMonths = Object.keys(monthlyExpenses).sort();
    const monthlyLabels = sortedMonths.map(m => {
        const [year, month] = m.split('-');
        const date = new Date(year, parseInt(month) - 1, 1);
        return date.toLocaleDateString('es-DO', { month: 'short', year: 'numeric' });
    });
    const monthlyData = sortedMonths.map(m => monthlyExpenses[m]);

    const selectedPayrollValue = window.dashboardPayrollFilter || 'all';

    const activityExpenses = {};
    const opStats = {};
    const processCost = (opName, actName, amount) => {
        const op = opName || 'Sin Operación';
        const act = actName || 'Sin Actividad';
        if (!opStats[op]) opStats[op] = { total: 0, activities: {} };
        if (!opStats[op].activities[act]) opStats[op].activities[act] = 0;
        opStats[op].total += amount;
        opStats[op].activities[act] += amount;

        if (!activityExpenses[act]) activityExpenses[act] = 0;
        activityExpenses[act] += amount;
    };

    // Helper to extract data from a payroll object (active)
    const processActivePayroll = (payroll) => {
        if (payroll.dailyLogs) {
            payroll.dailyLogs.forEach(log => {
                const emp = state.employees.find(e => `${e.firstName} ${e.lastName}` === log.employee);
                if (emp && !window.hasDepartmentAccess(emp.department)) return;
                processCost(log.op, log.act, parseFloat(log.amount) || 0);
            });
        }
        window.getVisibleEmployees().filter(e => e.type === 'fixed' && e.active !== false).forEach(emp => {
            const res = calculateEmployeePayrollData(emp, payroll);
            processCost(emp.operation, emp.activity, res.base || 0);
        });
    };

    // Helper to extract data from a historical run
    const processHistoricalRun = (run) => {
        if (run.results) {
            run.results.forEach(res => {
                const emp = state.employees.find(e => e.idNumber === res.idNumber || `${e.firstName} ${e.lastName}` === res.fullName);
                if (emp && !window.hasDepartmentAccess(emp.department)) return;
                const actName = emp ? (emp.activity || 'Sin Actividad') : 'Sin Actividad';
                const opName = emp ? (emp.operation || 'Sin Operación') : 'Sin Operación';
                processCost(opName, actName, res.brute || 0);
            });
        }
    };

    if (selectedPayrollValue === 'all') {
        // Show aggregate of ALL active payrolls
        if (state.activePayrolls) {
            state.activePayrolls.forEach(p => processActivePayroll(p));
        }
    } else if (selectedPayrollValue.startsWith('active_')) {
        const pid = selectedPayrollValue.replace('active_', '');
        const payroll = state.activePayrolls.find(p => String(p.id) === pid);
        if (payroll) processActivePayroll(payroll);
    } else if (selectedPayrollValue.startsWith('history_')) {
        const hIdx = parseInt(selectedPayrollValue.replace('history_', ''));
        const run = state.payrollHistory[hIdx];
        if (run) processHistoricalRun(run);
    }

    const sortedActivities = Object.keys(activityExpenses).sort((a, b) => activityExpenses[b] - activityExpenses[a]);
    const topActivitiesCount = 5;
    const activityLabels = sortedActivities.slice(0, topActivitiesCount);
    const activityDataSeries = activityLabels.map(a => activityExpenses[a]);

    window.dashboardOpStats = opStats;
    let reportHtml = '';
    if (Object.keys(opStats).length > 0) {
        reportHtml = '<div class="card mt-4 print-area" id="op-comparison-card"></div>';
    }

    // Prepare filter options
    const activeOptions = (state.activePayrolls || []).map(p =>
        `<option value="active_${p.id}" ${selectedPayrollValue === 'active_' + p.id ? 'selected' : ''}>[Abierta] ${p.name}</option>`
    ).join('');

    const historyOptions = (state.payrollHistory || []).slice().reverse().map((run, i) => {
        const realIdx = state.payrollHistory.length - 1 - i;
        const name = run.payrollName || run.name || `Histórica #${realIdx + 1}`;
        return `<option value="history_${realIdx}" ${selectedPayrollValue === 'history_' + realIdx ? 'selected' : ''}>[Cerrada] ${name} (${run.periodEnd})</option>`;
    }).join('');

    container.innerHTML = `
        <div class="dashboard-grid">
            <div class="header-action mb-4" style="background: var(--glass-bg); padding: 15px; border-radius: var(--radius-md); border: 1px solid var(--border-color); flex-wrap: wrap; gap: 15px;">
                <h1 style="margin:0; font-size: 1.5rem;"><i class="fas fa-chart-line text-accent"></i> Resumen de Nómina</h1>
                <div style="display: flex; gap: 10px; align-items: center;" class="no-print">
                    <label style="font-size: 0.9rem; font-weight: 600; color: var(--text-secondary);">Periodo:</label>
                    <select class="form-control" style="width: auto; min-width: 250px; background: var(--bg-color);" onchange="window.dashboardPayrollFilter = this.value; renderSection('dashboard')">
                        <option value="all" ${selectedPayrollValue === 'all' ? 'selected' : ''}>Resumen General (Nóminas Abiertas)</option>
                        <optgroup label="Nóminas en Curso">
                            ${activeOptions}
                        </optgroup>
                        <optgroup label="Historial de Nóminas">
                            ${historyOptions}
                        </optgroup>
                    </select>
                </div>
            </div>
            
            <div class="stats-row">
                <div class="card stat-card">
                    <div class="stat-label">Total Empleados</div>
                    <div class="stat-value">
                        ${window.getVisibleEmployees().filter(e => e.active !== false).length} 
                        <span style="font-size: 0.9rem; opacity: 0.7;">/ ${window.getVisibleEmployees().length}</span>
                    </div>
                </div>
                <div class="card stat-card" style="display: flex; flex-direction: column; justify-content: center;">
                    <div class="stat-label" style="margin-bottom: 5px;">Por Género (Activos)</div>
                    <div class="stat-value" style="font-size: 1.3rem; display: flex; justify-content: space-around; width: 100%;">
                        <span title="Masculino" style="color: #60a5fa;"><i class="fas fa-mars"></i> ${window.getVisibleEmployees().filter(e => e.active !== false && e.gender === 'M').length}</span>
                        <span title="Femenino" style="color: #f472b6;"><i class="fas fa-venus"></i> ${window.getVisibleEmployees().filter(e => e.active !== false && e.gender === 'F').length}</span>
                    </div>
                </div>
                <div class="card stat-card">
                    <div class="stat-label">Departamentos</div>
                    <div class="stat-value">${state.departments.length}</div>
                </div>
                <div class="card stat-card">
                    <div class="stat-label">Nóminas Abiertas</div>
                    <div class="stat-value ${(state.activePayrolls && state.activePayrolls.length > 0) ? 'text-success' : 'text-danger'}" id="dash-active-payroll">
                        ${(state.activePayrolls && state.activePayrolls.length > 0) ? state.activePayrolls.length : 'NO'}
                    </div>
                </div>
                <div class="card stat-card" style="display: flex; flex-direction: column; justify-content: center; align-items: stretch; gap: 8px;">
                    <button class="btn btn-secondary w-100" onclick="exportLocalData()" title="Copiar datos de esta PC" style="font-size: 0.85rem; padding: 6px;">
                        <i class="fas fa-file-export"></i> Exportar Datos (Local)
                    </button>
                    <button class="btn btn-secondary w-100" onclick="importLocalData()" title="Pegar datos de otra PC aquí" style="font-size: 0.85rem; padding: 6px;">
                        <i class="fas fa-file-import"></i> Importar Datos
                    </button>
                    <button class="btn btn-danger admin-only w-100" onclick="wipeProductionDatabase()" title="Borrar Todos los Datos" style="font-size: 0.85rem; padding: 6px;">
                        <i class="fas fa-trash"></i> Limpiar Sistema
                    </button>
                </div>
            </div>
            
            <div class="charts-row mt-4" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(400px, 1fr)); gap: 20px;">
                <div class="card">
                    <h3 class="mb-3" style="font-size: 1.1rem; color: var(--gray);">Gasto de Nómina por Mes (Histórico)</h3>
                    ${sortedMonths.length > 0 ? `<div style="position: relative; height:300px; width:100%"><canvas id="monthlyChart"></canvas></div>` : '<p class="text-gray" style="text-align: center; padding: 40px 0;">No hay datos históricos suficientes.</p>'}
                </div>
                <div class="card">
                    <h3 class="mb-3" style="font-size: 1.1rem; color: var(--gray);">Top ${topActivitiesCount} Actividades con Mayor Gasto</h3>
                    ${activityLabels.length > 0 ? `<div style="position: relative; height:300px; width:100%"><canvas id="activityChart"></canvas></div>` : '<p class="text-gray" style="text-align: center; padding: 40px 0;">No hay datos de actividades suficientes.</p>'}
                </div>
            </div>
            
            ${reportHtml}
        </div>
    `;

    window.renderOpComparison = () => {
        const card = document.getElementById('op-comparison-card');
        if (!card) return;
        const stats = window.dashboardOpStats;
        const ops = Object.keys(stats).sort();

        if (ops.length === 0) {
            card.innerHTML = '<p class="text-center text-gray" style="padding: 20px;">No hay datos de operaciones.</p>';
            return;
        }

        if (!window.dashboardOp1 && ops.length > 0) window.dashboardOp1 = ops[0];
        if (!window.dashboardOp2 && ops.length > 1) window.dashboardOp2 = ops[1];
        if (!window.dashboardOp2 && ops.length === 1) window.dashboardOp2 = ops[0];

        // Make sure selected ops exist
        if (!stats[window.dashboardOp1]) window.dashboardOp1 = ops[0];
        if (!stats[window.dashboardOp2]) window.dashboardOp2 = ops[0];

        let op1 = window.dashboardOp1;
        let op2 = window.dashboardOp2;

        const actMap = {};
        if (stats[op1]) {
            Object.keys(stats[op1].activities).forEach(act => actMap[act] = true);
        }
        if (stats[op2]) {
            Object.keys(stats[op2].activities).forEach(act => actMap[act] = true);
        }

        const allActs = Object.keys(actMap).sort();

        let html = `
                    <div class="header-action mb-3" style="border:none; flex-wrap: wrap;">
                        <h3 style="font-size: 1.1rem; color: var(--gray); margin: 0;">Comparativa de Operaciones</h3>
                        <div style="display: flex; gap: 15px; align-items: center;" class="no-print">
                            <select class="form-control" style="width: auto;" onchange="window.dashboardOp1 = this.value; window.renderOpComparison()">
                                ${ops.map(o => `<option value="${o}" ${o === op1 ? 'selected' : ''}>${o}</option>`).join('')}
                            </select>
                            <span style="font-weight: bold; color: var(--gray);">VS</span>
                            <select class="form-control" style="width: auto;" onchange="window.dashboardOp2 = this.value; window.renderOpComparison()">
                                ${ops.map(o => `<option value="${o}" ${o === op2 ? 'selected' : ''}>${o}</option>`).join('')}
                            </select>
                            <button class="btn btn-secondary" onclick="window.print()"><i class="fas fa-print"></i> Imprimir</button>
                        </div>
                    </div>
                    
                    <div style="overflow-x: auto;">
                        <table class="data-table">
                            <thead>
                                <tr>
                                    <th>Actividad</th>
                                    <th class="text-right" style="color: var(--primary);">${op1}</th>
                                    <th class="text-right" style="color: var(--accent-color);">${op2}</th>
                                    <th class="text-right">Diferencia</th>
                                </tr>
                            </thead>
                            <tbody>
                `;

        let tot1 = 0, tot2 = 0, totDiff = 0;

        allActs.forEach(act => {
            const val1 = (stats[op1] && stats[op1].activities[act]) ? stats[op1].activities[act] : 0;
            const val2 = (stats[op2] && stats[op2].activities[act]) ? stats[op2].activities[act] : 0;
            const diff = val1 - val2;

            tot1 += val1;
            tot2 += val2;
            totDiff += diff;

            html += `
                        <tr>
                            <td>${act}</td>
                            <td class="td-numeric" style="font-weight: bold;">$${val1.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                            <td class="td-numeric" style="font-weight: bold;">$${val2.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                            <td class="td-numeric" style="color: ${diff > 0 ? 'var(--danger)' : (diff < 0 ? 'var(--success)' : 'inherit')}; font-weight: ${Math.abs(diff) > 0 ? 'bold' : 'normal'}">
                                $${diff.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                        </tr>
                    `;
        });

        html += `
                            </tbody>
                            <tfoot style="display: table-row-group; font-weight: bold; border-top: 2px solid #333;">
                                <tr>
                                    <td class="text-right">TOTALES:</td>
                                    <td class="td-numeric" style="font-size: 1.1rem; color: var(--primary);">$${tot1.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                    <td class="td-numeric" style="font-size: 1.1rem; color: var(--accent-color);">$${tot2.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                    <td class="td-numeric" style="font-size: 1.1rem; color: ${totDiff > 0 ? 'var(--danger)' : (totDiff < 0 ? 'var(--success)' : 'inherit')};">
                                        $${totDiff.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                `;

        card.innerHTML = html;
    };

    setTimeout(() => {
        window.renderOpComparison();
        const currencyTooltip = {
            callbacks: {
                label: function (context) {
                    let label = context.dataset.label || '';
                    if (label) label += ': ';
                    if (context.parsed.y !== null) {
                        label += new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(context.parsed.y).replace('$', 'RD$');
                    }
                    return label;
                }
            }
        };
        const chartCommonOptions = {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { labels: { color: 'rgba(255, 255, 255, 0.7)' } }, tooltip: currencyTooltip },
            scales: {
                x: { ticks: { color: 'rgba(255, 255, 255, 0.5)' }, grid: { color: 'rgba(255, 255, 255, 0.05)' } },
                y: {
                    ticks: {
                        color: 'rgba(255, 255, 255, 0.5)',
                        callback: function (value) { return value >= 1000 ? 'RD$' + (value / 1000) + 'k' : 'RD$' + value; }
                    },
                    grid: { color: 'rgba(255, 255, 255, 0.1)' }
                }
            }
        };

        const monthlyCanvas = document.getElementById('monthlyChart');
        if (monthlyCanvas) {
            new Chart(monthlyCanvas, {
                type: 'line',
                data: {
                    labels: monthlyLabels,
                    datasets: [{
                        label: 'Gasto Total Bruto', data: monthlyData,
                        borderColor: '#60a5fa', backgroundColor: 'rgba(96, 165, 250, 0.2)',
                        borderWidth: 2, tension: 0.3, fill: true, pointBackgroundColor: '#3b82f6',
                    }]
                },
                options: chartCommonOptions
            });
        }

        const activityCanvas = document.getElementById('activityChart');
        if (activityCanvas) {
            new Chart(activityCanvas, {
                type: 'bar',
                data: {
                    labels: activityLabels,
                    datasets: [{
                        label: 'Gasto Generado (Aprox. Bruto)', data: activityDataSeries,
                        backgroundColor: ['rgba(248, 113, 113, 0.8)', 'rgba(52, 211, 153, 0.8)', 'rgba(251, 191, 36, 0.8)', 'rgba(167, 139, 250, 0.8)', 'rgba(56, 189, 248, 0.8)'],
                        borderWidth: 0, borderRadius: 4
                    }]
                },
                options: chartCommonOptions
            });
        }
    }, 100);
};

// --- Module: Usuarios ---
const renderUsers = (container) => {
    const users = state.users || [];
    container.innerHTML = `
                <div class="header-actions">
                    <h2>Gestión de Usuarios</h2>
                    <button class="btn btn-primary admin-only" onclick="showAddUserModal()">
                        <i class="fas fa-plus"></i> Nuevo Usuario
                    </button>
                </div>
                <div class="card mt-4">
                    <table class="table">
                        <thead>
                            <tr>
                                <th>Nombre</th>
                                <th>Usuario</th>
                                <th>Rol / Permisos</th>
                                <th style="width: 100px;">Acciones</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${users.length === 0 ? '<tr><td colspan="4" class="text-center text-gray">No hay usuarios adicionales (Solo Admin Base).</td></tr>' : ''}
                            ${users.map((u, index) => `
                                <tr>
                                    <td style="font-weight: 500;">${u.name}</td>
                                    <td>${u.email}</td>
                                    <td>
                                        <span class="badge ${u.role === 'admin' ? 'bg-primary' : (u.role === 'editor' ? 'bg-success' : 'bg-gray')}">
                                            ${u.role.toUpperCase()}
                                        </span>
                                    </td>
                                    <td>
                                        <div class="action-buttons">
                                            <button class="btn-icon edit admin-only" onclick="showEditUserModal('${u.uid}')" title="Editar Usuario">
                                                <i class="fas fa-edit"></i>
                                            </button>
                                            <button class="btn-icon delete admin-only" onclick="deleteUser('${u.uid}')" title="Eliminar Acceso">
                                                <i class="fas fa-trash"></i>
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            `;
};

// --- User Module Logic ---
window.showEditUserModal = (uid) => {
    const user = state.users.find(u => u.uid === uid);
    if (!user) return;

    showModal('Editar Usuario', `
                <div class="form-group">
                    <label>Nombre Completo</label>
                    <input type="text" id="edit-user-name" class="form-control" value="${user.name || ''}" placeholder="Ej. Juan Pérez">
                </div>
                <div class="form-group">
                    <label>Nombre de Usuario</label>
                    <input type="text" id="edit-user-email" class="form-control" value="${user.email || user.username || ''}" placeholder="Ej. jperez">
                </div>
                <div class="form-group">
                    <label>Nueva Contraseña (Opcional)</label>
                    <input type="password" id="edit-user-password" class="form-control" placeholder="Dejar en blanco para no cambiar">
                </div>
                <div class="form-group">
                    <label>Rol / Nivel de Acceso</label>
                    <select id="edit-user-role" class="form-control">
                        <option value="viewer" ${user.role === 'viewer' ? 'selected' : ''}>Lector (Solo ver reportes)</option>
                        <option value="editor" ${user.role === 'editor' ? 'selected' : ''}>Editor (Registrar nómina, sin borrar)</option>
                        <option value="admin" ${user.role === 'admin' ? 'selected' : ''}>Administrador (Acceso total)</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>Módulos Autorizados</label>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 5px; max-height: 200px; overflow-y: auto; padding: 10px; border: 1px solid #444; border-radius: 4px;">
                        ${[
            { id: 'dashboard', name: 'Dashboard' },
            { id: 'users', name: 'Usuarios' },
            { id: 'departments', name: 'Departamentos' },
            { id: 'operations', name: 'Operaciones' },
            { id: 'activities', name: 'Actividades' },
            { id: 'tss', name: 'TSS / Seguros' },
            { id: 'employees', name: 'Empleados' },
            { id: 'employee-record', name: 'Récord de Empleado' },
            { id: 'discounts', name: 'Descuentos' },
            { id: 'overtime', name: 'Horas Extras' },
            { id: 'incentives', name: 'Incentivos' },
            { id: 'christmas-salary', name: 'Salario Navidad' },
            { id: 'benefits', name: 'Prestaciones' },
            { id: 'vacations', name: 'Vacaciones' },
            { id: 'periods', name: 'Periodos' },
            { id: 'payroll-runs', name: 'Abrir Nómina' },
            { id: 'daily-registration', name: 'Registro Diario' },
            { id: 'closing', name: 'Cierre Nómina' },
            { id: 'reports', name: 'Reportes' },
            { id: 'payroll-entry', name: 'Entrada de Nómina' }
        ].map(m => `
                            <label style="display: flex; align-items: center; gap: 8px; font-weight: normal; cursor: pointer; font-size: 0.85rem;">
                                <input type="checkbox" class="user-module-check" value="${m.id}" ${(!user.allowedModules || user.allowedModules.includes(m.id)) ? 'checked' : ''}> ${m.name}
                            </label>
                        `).join('')}
                    </div>
                </div>
                <div class="form-group">
                    <label>Departamentos Permitidos</label>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 5px; max-height: 200px; overflow-y: auto; padding: 10px; border: 1px solid #444; border-radius: 4px;">
                        ${state.departments.map(d => `
                            <label style="display: flex; align-items: center; gap: 8px; font-weight: normal; cursor: pointer; font-size: 0.85rem;">
                                <input type="checkbox" class="user-dept-check" value="${d.name}" ${(!user.allowedDepartments || user.allowedDepartments.includes(d.name)) ? 'checked' : ''}> ${d.name}
                            </label>
                        `).join('')}
                    </div>
                </div>
                <div class="form-group" style="margin-top: 15px; border-top: 1px solid #444; padding-top: 10px;">
                    <label style="display: flex; align-items: center; gap: 8px; font-weight: normal; cursor: pointer;">
                        <input type="checkbox" id="edit-user-can-create-emp" ${user.canCreateEmployees ? 'checked' : ''}> Permitir Crear Empleados
                    </label>
                </div>
            `, () => {
        const name = document.getElementById('edit-user-name').value;
        const email = document.getElementById('edit-user-email').value;
        const password = document.getElementById('edit-user-password').value;
        const role = document.getElementById('edit-user-role').value;
        const allowedModules = Array.from(document.querySelectorAll('.user-module-check:checked')).map(cb => cb.value);
        const allowedDepartments = Array.from(document.querySelectorAll('.user-dept-check:checked')).map(cb => cb.value);
        const canCreateEmployees = document.getElementById('edit-user-can-create-emp').checked;

        if (name && email) {
            if (window.updateUserAccess) {
                const updatedData = { name, email, role, allowedModules, allowedDepartments, canCreateEmployees };
                if (password.length >= 6) {
                    updatedData.password = password;
                } else if (password.length > 0) {
                    alert("La contraseña debe tener al menos 6 caracteres.");
                    return;
                }

                window.updateUserAccess(uid, updatedData);
                hideModal();
            } else {
                alert("Error: Script de Firebase Backend no responde.");
            }
        } else {
            alert("El nombre y el usuario no pueden estar vacíos.");
        }
    });
};

window.showAddUserModal = () => {
    showModal('Crear Nuevo Usuario', `
                <div class="form-group">
                    <label>Nombre Completo</label>
                    <input type="text" id="new-user-name" class="form-control" placeholder="Ej. Juan Pérez">
                </div>
                <div class="form-group">
                    <label>Nombre de Usuario</label>
                    <input type="text" id="new-user-email" class="form-control" placeholder="Ej. jperez">
                </div>
                <div class="form-group">
                    <label>Contraseña Provisional</label>
                    <input type="password" id="new-user-password" class="form-control" placeholder="Mínimo 6 caracteres">
                </div>
                <div class="form-group">
                    <label>Rol / Nivel de Acceso</label>
                    <select id="new-user-role" class="form-control">
                        <option value="viewer">Lector (Solo ver reportes)</option>
                        <option value="editor">Editor (Registrar nómina, sin borrar)</option>
                        <option value="admin">Administrador (Acceso total)</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>Módulos Autorizados</label>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 5px; max-height: 200px; overflow-y: auto; padding: 10px; border: 1px solid #444; border-radius: 4px;">
                        ${[
            { id: 'dashboard', name: 'Dashboard' },
            { id: 'users', name: 'Usuarios' },
            { id: 'departments', name: 'Departamentos' },
            { id: 'operations', name: 'Operaciones' },
            { id: 'activities', name: 'Actividades' },
            { id: 'tss', name: 'TSS / Seguros' },
            { id: 'employees', name: 'Empleados' },
            { id: 'employee-record', name: 'Récord de Empleado' },
            { id: 'discounts', name: 'Descuentos' },
            { id: 'overtime', name: 'Horas Extras' },
            { id: 'incentives', name: 'Incentivos' },
            { id: 'christmas-salary', name: 'Salario Navidad' },
            { id: 'benefits', name: 'Prestaciones' },
            { id: 'vacations', name: 'Vacaciones' },
            { id: 'periods', name: 'Periodos' },
            { id: 'payroll-runs', name: 'Abrir Nómina' },
            { id: 'daily-registration', name: 'Registro Diario' },
            { id: 'closing', name: 'Cierre Nómina' },
            { id: 'reports', name: 'Reportes' },
            { id: 'payroll-entry', name: 'Entrada de Nómina' }
        ].map(m => `
                            <label style="display: flex; align-items: center; gap: 8px; font-weight: normal; cursor: pointer; font-size: 0.85rem;">
                                <input type="checkbox" class="user-module-check" value="${m.id}" checked> ${m.name}
                            </label>
                        `).join('')}
                    </div>
                </div>
                <div class="form-group">
                    <label>Departamentos Permitidos</label>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 5px; max-height: 200px; overflow-y: auto; padding: 10px; border: 1px solid #444; border-radius: 4px;">
                        ${state.departments.map(d => `
                            <label style="display: flex; align-items: center; gap: 8px; font-weight: normal; cursor: pointer; font-size: 0.85rem;">
                                <input type="checkbox" class="user-dept-check" value="${d.name}" checked> ${d.name}
                            </label>
                        `).join('')}
                    </div>
                </div>
                <div class="form-group" style="margin-top: 15px; border-top: 1px solid #444; padding-top: 10px;">
                    <label style="display: flex; align-items: center; gap: 8px; font-weight: normal; cursor: pointer;">
                        <input type="checkbox" id="new-user-can-create-emp"> Permitir Crear Empleados
                    </label>
                </div>
            `, () => {
        const name = document.getElementById('new-user-name').value;
        const email = document.getElementById('new-user-email').value;
        const password = document.getElementById('new-user-password').value;
        const role = document.getElementById('new-user-role').value;
        const allowedModules = Array.from(document.querySelectorAll('.user-module-check:checked')).map(cb => cb.value);
        const allowedDepartments = Array.from(document.querySelectorAll('.user-dept-check:checked')).map(cb => cb.value);
        const canCreateEmployees = document.getElementById('new-user-can-create-emp').checked;

        if (name && email && password.length >= 6) {
            if (window.registerSecondaryUser) {
                window.registerSecondaryUser(email, password, name, role, allowedModules, allowedDepartments, canCreateEmployees);
                hideModal();
            } else {
                alert("Error: Script de Firebase Backend no responde.");
            }
        } else {
            alert("Complete todos los campos. La contraseña debe tener al menos 6 caracteres.");
        }
    });
};

window.deleteUser = (uid) => {
    if (confirm('¿Está seguro de revocar el acceso a este usuario?')) {
        if (window.removeUserAccess) {
            window.removeUserAccess(uid);
        }
    }
};

// --- Module: Departments ---
const renderDepartments = (container) => {
    container.innerHTML = `
        <div class="header-action">
            <h1>Departamentos</h1>
            <button class="btn btn-primary admin-only" id="add-dept-btn">
                <i class="fas fa-plus"></i> Nuevo Departamento
            </button>
        </div>
        <div class="card mt-4">
            <table class="data-table">
                <thead>
                    <tr>
                        <th style="width: 50px">Nº</th>
                        <th>Nombre</th>
                        <th>Registrado por</th>
                        <th style="width: 100px">Acciones</th>
                    </tr>
                </thead>
                <tbody id="dept-table-body">
                    ${state.departments.map((dept, index) => `
                        <tr>
                            <td>D-${dept.deptNumber || (index + 1)}</td>
                            <td>${dept.name}</td>
                            <td><small>${dept.createdBy || 'Sistema'}</small></td>
                            <td>
                                <button class="btn-icon delete admin-only" onclick="deleteItem('departments', ${index})">
                                    <i class="fas fa-trash"></i>
                                </button>
                            </td>
                        </tr>
                    `).join('')}
                    ${state.departments.length === 0 ? '<tr><td colspan="2" style="text-align:center">No hay departamentos registrados</td></tr>' : ''}
                </tbody>
            </table>
        </div>
    `;

    document.getElementById('add-dept-btn').onclick = () => {
        showModal('Nuevo Departamento', `
            <div class="form-group">
                <label>Nombre del Departamento</label>
                <input type="text" id="dept-name" class="form-control" placeholder="Ej: Producción">
            </div>
        `, () => {
            const name = document.getElementById('dept-name').value;
            if (name) {
                const nextNum = state.departments.length > 0 ? Math.max(0, ...state.departments.map(d => parseInt(d.deptNumber) || 0)) + 1 : 1;
                state.departments.push({
                    id: Date.now().toString(36) + Math.random().toString(36).substring(2),
                    name,
                    deptNumber: nextNum,
                    createdBy: window.globalState.currentUser?.name || 'Desconocido'
                });
                saveState();
                renderSection('departments');
                hideModal();
            }
        });
    };
};

// --- Module: Operations ---
const renderOperations = (container) => {
    container.innerHTML = `
        <div class="header-action">
            <h1>Operaciones</h1>
            <button class="btn btn-primary" id="add-op-btn">
                <i class="fas fa-plus"></i> Nueva Operación
            </button>
        </div>
        <div class="card mt-4">
            <table class="data-table">
                <thead>
                    <tr>
                        <th style="width: 50px">Nº</th>
                        <th>Nombre</th>
                        <th>Cuenta Contable</th>
                        <th>Propósito</th>
                        <th>Registrado por</th>
                        <th style="width: 100px">Acciones</th>
                    </tr>
                </thead>
                <tbody>
                    ${state.operations.map((op, index) => `
                        <tr>
                            <td>OP-${op.opNumber || (index + 1)}</td>
                            <td>${op.name}</td>
                            <td>${op.account}</td>
                            <td>
                                <div style="display: flex; gap: 5px; flex-wrap: wrap;">
                                    ${(op.useInAccounting === undefined || op.useInAccounting) ? '<span class="status-badge fixed" style="font-size: 0.6rem">Contabilidad</span>' : ''}
                                    ${(op.useInLabor === undefined || op.useInLabor) ? '<span class="status-badge mobile" style="font-size: 0.6rem">Fijos/Móviles</span>' : ''}
                                </div>
                            </td>
                            <td><small>${op.createdBy || 'Sistema'}</small></td>
                            <td>
                                <button class="btn-icon edit" onclick="editOperation(${index})">
                                    <i class="fas fa-edit"></i>
                                </button>
                                <button class="btn-icon delete admin-only" onclick="deleteItem('operations', ${index})">
                                    <i class="fas fa-trash"></i>
                                </button>
                            </td>
                        </tr>
                    `).join('')}
                    ${state.operations.length === 0 ? '<tr><td colspan="5" style="text-align:center">No hay operaciones registradas</td></tr>' : ''}
                </tbody>
            </table>
        </div>
    `;

    document.getElementById('add-op-btn').onclick = () => {
        showModal('Nueva Operación', `
            <div class="form-group">
                <label>Nombre de la Operación</label>
                <input type="text" id="op-name" class="form-control" placeholder="Ej: Cosecha">
            </div>
            <div class="form-group">
                <label>Número de Cuenta Contable</label>
                <input type="text" id="op-account" class="form-control" placeholder="Ej: 6010101">
            </div>
            <div class="form-group">
                <label>Propósitos de la Operación:</label>
                <div style="display: flex; flex-direction: column; gap: 8px; margin-top: 5px;">
                    <label style="display: flex; align-items: center; gap: 8px; font-weight: normal; cursor: pointer;">
                        <input type="checkbox" id="op-use-acc" checked> Utilizar en contabilidad
                    </label>
                    <label style="display: flex; align-items: center; gap: 8px; font-weight: normal; cursor: pointer;">
                        <input type="checkbox" id="op-use-labor" checked> Utilizar en empleados fijos y móviles
                    </label>
                </div>
            </div>
        `, () => {
            const name = document.getElementById('op-name').value;
            const account = document.getElementById('op-account').value;
            const useInAccounting = document.getElementById('op-use-acc').checked;
            const useInLabor = document.getElementById('op-use-labor').checked;
            if (name && account) {
                const nextNum = state.operations.length > 0 ? Math.max(0, ...state.operations.map(o => parseInt(o.opNumber) || 0)) + 1 : 1;
                state.operations.push({
                    id: Date.now().toString(36) + Math.random().toString(36).substring(2),
                    name,
                    account,
                    useInAccounting,
                    useInLabor,
                    opNumber: nextNum,
                    createdBy: window.globalState.currentUser?.name || 'Desconocido'
                });
                saveState();
                renderSection('operations');
                hideModal();
            }
        });
    };
};

// --- Module: Activities ---
const renderActivities = (container) => {
    container.innerHTML = `
        <div class="header-action">
            <h1>Actividades</h1>
            <button class="btn btn-primary" id="add-act-btn">
                <i class="fas fa-plus"></i> Nueva Actividad
            </button>
        </div>
        <div class="card mt-4">
            <table class="data-table">
                <thead>
                    <tr>
                        <th style="width: 50px">Nº</th>
                        <th>Nombre</th>
                        <th>Valor/Número</th>
                        <th>Salario Diario</th>
                        <th style="width: 100px">Acciones</th>
                    </tr>
                </thead>
                <tbody>
                    ${state.activities.map((act, index) => `
                        <tr>
                            <td>ACT-${act.actNumber || (index + 1)}</td>
                            <td>${act.name}</td>
                            <td>$${parseFloat(act.value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                            <td>$${parseFloat(act.dailySalary || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                            <td><small>${act.createdBy || 'Sistema'}</small></td>
                            <td>
                                <button class="btn-icon edit" onclick="editActivity(${index})">
                                    <i class="fas fa-edit"></i>
                                </button>
                                <button class="btn-icon delete admin-only" onclick="deleteItem('activities', ${index})">
                                    <i class="fas fa-trash"></i>
                                </button>
                            </td>
                        </tr>
                    `).join('')}
                    ${state.activities.length === 0 ? '<tr><td colspan="5" style="text-align:center">No hay actividades registradas</td></tr>' : ''}
                </tbody>
            </table>
        </div>
    `;

    document.getElementById('add-act-btn').onclick = () => {
        showModal('Nueva Actividad', `
            <div class="form-group">
                <label>Nombre de la Actividad</label>
                <input type="text" id="act-name" class="form-control" placeholder="Ej: Limpieza">
            </div>
            <div class="form-group">
                <label>Valor / Número (Otro objetivo)</label>
                <input type="number" id="act-value" class="form-control" placeholder="Ej: 50.00">
            </div>
            <div class="form-group">
                <label>Salario Diario (Para Registro Diario)</label>
                <input type="number" id="act-daily-salary" class="form-control" placeholder="Ej: 800.00">
            </div>
        `, () => {
            const name = document.getElementById('act-name').value;
            const value = document.getElementById('act-value').value;
            const dailySalary = document.getElementById('act-daily-salary').value;
            if (name) {
                const nextNum = state.activities.length > 0 ? Math.max(0, ...state.activities.map(a => parseInt(a.actNumber) || 0)) + 1 : 1;
                state.activities.push({
                    id: Date.now().toString(36) + Math.random().toString(36).substring(2),
                    name,
                    value: parseFloat(value) || 0,
                    dailySalary: parseFloat(dailySalary) || 0,
                    actNumber: nextNum,
                    createdBy: window.globalState.currentUser?.name || 'Desconocido'
                });
                saveState();
                renderSection('activities');
                hideModal();
            }
        });
    };
};

// --- Module: Employees ---
const renderEmployees = (container) => {
    container.innerHTML = `
        <div class="header-action">
            <h1>Empleados</h1>
            <button class="btn btn-primary" id="add-emp-btn" style="${window.globalState?.currentUser?.role === 'admin' || window.globalState?.currentUser?.canCreateEmployees ? '' : 'display: none;'}">
                <i class="fas fa-user-plus"></i> Nuevo Empleado
            </button>
        </div>
        <div class="card mt-4">
            <table class="data-table">
                <thead>
                    <tr>
                        <th>Nº Reg.</th>
                        <th>Nombre Completo</th>
                        <th>Cédula/Pasaporte</th>
                        <th>Género</th>
                        <th>Tipo</th>
                        <th>Estado</th>
                        <th>Departamento</th>
                        <th>Registrado por</th>
                        <th style="width: 120px">Acciones</th>
                    </tr>
                </thead>
                <tbody>
                    ${window.getVisibleEmployees().map((emp) => {
        const index = state.employees.indexOf(emp);
        return `
                        <tr>
                            <td>${emp.regNumber || '-'}</td>
                            <td>${emp.firstName} ${emp.lastName}</td>
                            <td>${emp.idNumber}</td>
                            <td>${emp.gender === 'M' ? 'Masculino' : (emp.gender === 'F' ? 'Femenino' : '-')}</td>
                            <td><span class="status-badge ${emp.type}">${emp.type === 'fixed' ? 'Fijo' : 'Móvil'}</span></td>
                            <td>
                                <span class="status-badge ${emp.active !== false ? 'success' : 'gray'}" style="cursor: pointer" onclick="window.toggleEmployeeStatus(${index})">
                                    ${emp.active !== false ? 'Activo' : 'Inactivo'}
                                </span>
                            </td>
                            <td>${emp.department || '-'}</td>
                                <td><small>${emp.createdBy || 'Sistema'}</small></td>
                            <td>
                                <div class="action-group">
                                    <button class="btn-icon" onclick="quickAddIncentive('${emp.firstName} ${emp.lastName}')" title="Aplicar Incentivo">
                                        <i class="fas fa-gift"></i>
                                    </button>
                                    <button class="btn-icon" onclick="quickAddOvertime('${emp.firstName} ${emp.lastName}')" title="Horas Extras">
                                        <i class="fas fa-clock"></i>
                                    </button>
                                    <button class="btn-icon" onclick="quickAddDiscount('${emp.firstName} ${emp.lastName}')" title="Registrar Descuento">
                                        <i class="fas fa-money-bill-wave-alt"></i>
                                    </button>
                                    <button class="btn-icon" onclick="quickAddChristmasSalary('${emp.firstName} ${emp.lastName}')" title="Salario Navidad">
                                        <i class="fas fa-tree"></i>
                                    </button>
                                    <button class="btn-icon edit" onclick="editEmployee(${index})" title="Editar">
                                        <i class="fas fa-edit"></i>
                                    </button>
                                    <button class="btn-icon delete admin-only" onclick="deleteItem('employees', ${index})" title="Eliminar">
                                        <i class="fas fa-trash"></i>
                                    </button>
                                </div>
                            </td>
                        </tr>
                    `}).join('')}
                    ${window.getVisibleEmployees().length === 0 ? '<tr><td colspan="9" style="text-align:center">No hay empleados registrados para su visualización</td></tr>' : ''}
                </tbody>
            </table>
        </div>
    `;

    document.getElementById('add-emp-btn').onclick = () => {
        const nextRegNum = state.employees.length > 0 ? Math.max(0, ...state.employees.map(e => parseInt(e.regNumber) || 0)) + 1 : 1;
        showModal('Nuevo Empleado', `
            <div class="form-row">
                <div class="form-group">
                    <label>Nº de Registro</label>
                    <input type="number" id="emp-reg" class="form-control" value="${nextRegNum}">
                </div>
                <div class="form-group">
                    <label>Género</label>
                    <select id="emp-gender" class="form-control">
                        <option value="">Seleccionar...</option>
                        <option value="M">Masculino</option>
                        <option value="F">Femenino</option>
                    </select>
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label>Nombres</label>
                    <input type="text" id="emp-fn" class="form-control">
                </div>
                <div class="form-group">
                    <label>Apellidos</label>
                    <input type="text" id="emp-ln" class="form-control">
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label>Cédula o Pasaporte</label>
                    <input type="text" id="emp-id" class="form-control">
                </div>
                <div class="form-group">
                    <label>Tipo de Empleado</label>
                    <select id="emp-type" class="form-control">
                        <option value="fixed">Fijo</option>
                        <option value="mobile">Móvil</option>
                    </select>
                </div>
            </div>
            <div class="form-group">
                <label>Salario a Ganar</label>
                <input type="number" id="emp-salary" class="form-control" placeholder="0.00">
            </div>
            <div class="form-group">
                <label>Dirección</label>
                <input type="text" id="emp-address" class="form-control">
            </div>
            <div class="form-group">
                <label>Fecha de Ingreso</label>
                <input type="date" id="emp-hire-date" class="form-control" value="${new Date().toISOString().split('T')[0]}">
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label>Departamento</label>
                    <select id="emp-dept" class="form-control">
                        <option value="">Seleccionar...</option>
                        ${state.departments.map(d => `<option value="${d.name}">${d.name}</option>`).join('')}
                    </select>
                </div>
                <div class="form-group">
                    <label>Operación Defecto</label>
                    <select id="emp-op" class="form-control">
                        <option value="">Seleccionar...</option>
                        ${state.operations.filter(o => o.useInLabor === undefined || o.useInLabor).map(o => `<option value="${o.name}">${o.name}</option>`).join('')}
                    </select>
                </div>
            </div>
            <div class="form-group">
                <label>Actividad Defecto</label>
                <select id="emp-act" class="form-control">
                    <option value="">Seleccionar...</option>
                    ${state.activities.map(a => `<option value="${a.name}">${a.name}</option>`).join('')}
                </select>
            </div>
            <div class="form-group">
                <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                    <input type="checkbox" id="emp-active" checked> Empleado Activo (Aparece en Nómina)
                </label>
            </div>
            <div class="form-group">
                <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                    <input type="checkbox" id="emp-isr" checked> Aplicar Retención de ISR (Impuesto Sobre la Renta)
                </label>
            </div>
        `, () => {
            const emp = {
                id: 'emp_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 5),
                regNumber: document.getElementById('emp-reg').value,
                gender: document.getElementById('emp-gender').value,
                firstName: document.getElementById('emp-fn').value,
                lastName: document.getElementById('emp-ln').value,
                idNumber: document.getElementById('emp-id').value,
                type: document.getElementById('emp-type').value,
                salary: document.getElementById('emp-salary').value,
                address: document.getElementById('emp-address').value,
                hireDate: document.getElementById('emp-hire-date').value,
                department: document.getElementById('emp-dept').value,
                operation: document.getElementById('emp-op').value,
                activity: document.getElementById('emp-act').value,
                active: document.getElementById('emp-active').checked,
                applyISR: document.getElementById('emp-isr').checked,
                createdBy: window.globalState.currentUser?.name || 'Desconocido'
            };

            if (emp.firstName && emp.idNumber) {
                emp.id = Date.now().toString(36) + Math.random().toString(36).substring(2);
                state.employees.push(emp);
                saveState();
                renderSection('employees');
                hideModal();
            }
        });

        // Conditional salary field logic
        const typeSelect = document.getElementById('emp-type');
        const salaryInput = document.getElementById('emp-salary');
        typeSelect.onchange = () => {
            salaryInput.disabled = (typeSelect.value === 'mobile');
            if (salaryInput.disabled) salaryInput.value = '';
        };
    };
};

// --- Module: TSS ---
const renderTSS = (container) => {
    container.innerHTML = `
                <h1>Configuración General y Contable</h1>
                <div class="card mt-4">
                    <div style="max-width: 500px">
                        <div class="form-group">
                            <label>Nombre de la Empresa</label>
                            <input type="text" id="company-name" class="form-control" value="${state.settings.companyName || 'NóminaApp'}">
                        </div>
                        <div class="form-group">
                            <label>Tasa de Retención Seguro (%)</label>
                            <input type="number" id="tss-rate" class="form-control" value="${(state.settings.tss_rate || 0.0591) * 100}">
                        </div>
                        
                        <h3 class="mt-4 mb-2">Cuentas Contables por Defecto</h3>
                        <p class="text-sm text-gray mb-4">Seleccione la cuenta (Operación) que se asociará automáticamente a cada rubro de nómina.</p>
                        
                        <div class="form-group">
                            <label>Cuenta para Cuadre de Incentivos</label>
                            <select id="acc-inc" class="form-control">
                                <option value="">Seleccionar...</option>
                                ${state.operations.filter(o => o.useInAccounting === undefined || o.useInAccounting).map(op => `<option value="${op.name}" ${state.settings.payrollAccounts?.incentives === op.name ? 'selected' : ''}>${op.name}</option>`).join('')}
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Cuenta para Horas Extras</label>
                            <select id="acc-ot" class="form-control">
                                <option value="">Seleccionar...</option>
                                ${state.operations.filter(o => o.useInAccounting === undefined || o.useInAccounting).map(op => `<option value="${op.name}" ${state.settings.payrollAccounts?.overtime === op.name ? 'selected' : ''}>${op.name}</option>`).join('')}
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Cuenta para Descuentos / Cuentas por Cobrar</label>
                            <select id="acc-disc" class="form-control">
                                <option value="">Seleccionar...</option>
                                ${state.operations.filter(o => o.useInAccounting === undefined || o.useInAccounting).map(op => `<option value="${op.name}" ${state.settings.payrollAccounts?.discounts === op.name ? 'selected' : ''}>${op.name}</option>`).join('')}
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Cuenta para Salario de Navidad</label>
                            <select id="acc-chr" class="form-control">
                                <option value="">Seleccionar...</option>
                                ${state.operations.filter(o => o.useInAccounting === undefined || o.useInAccounting).map(op => `<option value="${op.name}" ${state.settings.payrollAccounts?.christmas === op.name ? 'selected' : ''}>${op.name}</option>`).join('')}
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Cuenta para Retención TSS (Crédito)</label>
                            <select id="acc-tss" class="form-control">
                                <option value="">Seleccionar...</option>
                                ${state.operations.filter(o => o.useInAccounting === undefined || o.useInAccounting).map(op => `<option value="${op.name}" ${state.settings.payrollAccounts?.tss === op.name ? 'selected' : ''}>${op.name}</option>`).join('')}
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Cuenta para Retención ISR (Crédito)</label>
                            <select id="acc-isr" class="form-control">
                                <option value="">Seleccionar...</option>
                                ${state.operations.filter(o => o.useInAccounting === undefined || o.useInAccounting).map(op => `<option value="${op.name}" ${state.settings.payrollAccounts?.isr === op.name ? 'selected' : ''}>${op.name}</option>`).join('')}
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Cuenta para Nómina por Pagar (Neto - Crédito)</label>
                            <select id="acc-payable" class="form-control">
                                <option value="">Seleccionar...</option>
                                ${state.operations.filter(o => o.useInAccounting === undefined || o.useInAccounting).map(op => `<option value="${op.name}" ${state.settings.payrollAccounts?.payable === op.name ? 'selected' : ''}>${op.name}</option>`).join('')}
                            </select>
                        </div>
                        
                        <h3 class="mt-4 mb-2">Escalas de ISR (Escala Anual)</h3>
                        <p class="text-sm text-gray mb-4">Configure los límites anuales para el cálculo del Impuesto Sobre la Renta.</p>
                        
                        <div class="form-group">
                            <label>Límite Exento Anual (RD$)</label>
                            <input type="number" id="isr-exempt" class="form-control" value="${state.settings.isrThresholds.exempt}">
                        </div>
                        <div class="form-group">
                            <label>Límite Tramo 15% (RD$)</label>
                            <input type="number" id="isr-mid" class="form-control" value="${state.settings.isrThresholds.mid}">
                        </div>
                        <div class="form-group">
                            <label>Límite Tramo 20% (RD$)</label>
                            <input type="number" id="isr-high" class="form-control" value="${state.settings.isrThresholds.high}">
                        </div>
                        <div class="form-row">
                            <div class="form-group">
                                <label>Base Fija Tramo 2 (RD$)</label>
                                <input type="number" id="isr-base1" class="form-control" value="${state.settings.isrThresholds.base1}">
                            </div>
                            <div class="form-group">
                                <label>Base Fija Tramo 3 (RD$)</label>
                                <input type="number" id="isr-base2" class="form-control" value="${state.settings.isrThresholds.base2}">
                            </div>
                        </div>
                        
                        <button class="btn btn-primary mt-4" id="save-settings">Guardar Todas las Configuraciones</button>
                    </div>
                </div>
            `;

    document.getElementById('save-settings').onclick = () => {
        state.settings.companyName = document.getElementById('company-name').value;
        state.settings.tss_rate = parseFloat(document.getElementById('tss-rate').value) / 100;
        state.settings.payrollAccounts = {
            incentives: document.getElementById('acc-inc').value,
            overtime: document.getElementById('acc-ot').value,
            discounts: document.getElementById('acc-disc').value,
            christmas: document.getElementById('acc-chr').value,
            tss: document.getElementById('acc-tss').value,
            isr: document.getElementById('acc-isr').value,
            payable: document.getElementById('acc-payable').value
        };
        state.settings.isrThresholds = {
            exempt: parseFloat(document.getElementById('isr-exempt').value),
            mid: parseFloat(document.getElementById('isr-mid').value),
            high: parseFloat(document.getElementById('isr-high').value),
            base1: parseFloat(document.getElementById('isr-base1').value),
            base2: parseFloat(document.getElementById('isr-base2').value)
        };
        saveState();
        alert('Configuración guardada correctamente.');
    };
};

// --- Module: Periods ---
const renderPeriods = (container) => {
    container.innerHTML = `
        <div class="header-action">
            <h1>Definición de Periodos</h1>
            <button class="btn btn-primary" id="add-period-btn">
                <i class="fas fa-plus"></i> Nuevo Tipo de Periodo
            </button>
        </div>
        <div class="card mt-4">
            <table class="data-table">
                <thead>
                    <tr>
                        <th>Nombre</th>
                        <th>Frecuencia</th>
                        <th style="width: 100px">Acciones</th>
                    </tr>
                </thead>
                <tbody>
                    ${state.periods.map((p, index) => `
                        <tr>
                            <td>${p.name}</td>
                            <td>${p.frequency}</td>
                            <td>
                                <button class="btn-icon delete admin-only" onclick="deleteItem('periods', ${index})">
                                    <i class="fas fa-trash"></i>
                                </button>
                            </td>
                        </tr>
                    `).join('')}
                    ${state.periods.length === 0 ? '<tr><td colspan="3" style="text-align:center">No hay periodos definidos</td></tr>' : ''}
                </tbody>
            </table>
        </div>
    `;

    document.getElementById('add-period-btn').onclick = () => {
        showModal('Nuevo Periodo', `
            <div class="form-group">
                <label>Nombre del Periodo</label>
                <input type="text" id="p-name" class="form-control" placeholder="Ej: Quincena 1 - Marzo">
            </div>
            <div class="form-group">
                <label>Frecuencia</label>
                <select id="p-freq" class="form-control">
                    <option value="Semanal">Semanal</option>
                    <option value="Bisemanal">Bisemanal</option>
                    <option value="Quincenal">Quincenal</option>
                    <option value="Mensual">Mensual</option>
                </select>
            </div>
        `, () => {
            const name = document.getElementById('p-name').value;
            const frequency = document.getElementById('p-freq').value;
            if (name) {
                state.periods.push({ id: Date.now().toString(36) + Math.random().toString(36).substring(2), name, frequency });
                saveState();
                renderSection('periods');
                hideModal();
            }
        });
    };
};

// --- Module: Discounts ---
const renderDiscounts = (container) => {
    container.innerHTML = `
        <div class="header-action">
            <h1>Descuentos (Cuentas por Cobrar)</h1>
            <button class="btn btn-primary" id="add-disc-btn">
                <i class="fas fa-plus"></i> Crear Descuento
            </button>
        </div>
        <div class="card mt-4">
            <table class="data-table">
                <thead>
                    <tr>
                        <th style="width: 50px">Nº</th>
                        <th>Empleado</th>
                        <th class="text-right">Deuda Total</th>
                        <th class="text-right">Cuota</th>
                        <th class="text-right">Balance Pendiente</th>
                        <th>Concepto</th>
                        <th>Registrado por</th>
                        <th style="width: 80px">Acciones</th>
                    </tr>
                </thead>
                <tbody>
                    ${(state.discounts || []).map((d, index) => {
        if (!d.id) d.id = Date.now() + Math.random().toString(36).substr(2, 9);
        const originalAmount = parseFloat(d.totalAmount || d.amount || 0);
        const currentBalance = parseFloat(d.remainingBalance ?? originalAmount);
        const hasPaid = currentBalance < originalAmount;

        return `
                        <tr>
                            <td>L-${d.loanNumber || (index + 1)}</td>
                            <td>${d.employeeName}</td>
                            <td class="td-numeric">$${originalAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                            <td class="td-numeric">$${parseFloat(d.installment || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                            <td class="td-numeric" style="font-weight: 600; color: ${currentBalance > 0 ? 'var(--danger)' : 'var(--success)'}">
                                $${currentBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                            <td>${d.reason}</td>
                            <td><small>${d.createdBy || 'Sistema'}</small></td>
                            <td style="display: flex; gap: 5px;">
                                <button class="btn-icon" onclick="viewLoanHistory('${d.id}')" title="Ver Historial de Cobros">
                                    <i class="fas fa-history"></i>
                                </button>
                                <button class="btn-icon edit admin-only" onclick="showEditDiscountModal('${d.id}')" title="Editar Descuento">
                                    <i class="fas fa-edit"></i>
                                </button>
                                ${!hasPaid ? `
                                <button class="btn-icon delete admin-only" onclick="deleteItem('discounts', ${index})" title="Eliminar Descuento (Sin Cobros)">
                                    <i class="fas fa-trash"></i>
                                </button>
                                ` : `
                                <button class="btn-icon delete admin-only" style="opacity: 0.3; cursor: not-allowed;" title="No se puede borrar porque ya tiene pagos registrados. Use Editar." disabled>
                                    <i class="fas fa-trash"></i>
                                </button>
                                `}
                            </td>
                        </tr>
                    `;
    }).join('')}
                    ${(!state.discounts || state.discounts.length === 0) ? '<tr><td colspan="8" style="text-align:center">No hay préstamos o descuentos registrados</td></tr>' : ''}
                </tbody>
            </table>
        </div>
    `;

    window.viewLoanHistory = (loanId) => {
        const loan = state.discounts.find(d => d.id === loanId);
        if (!loan) return;

        let history = [];
        state.payrollHistory.forEach(run => {
            run.results.forEach(res => {
                if (res.loanDeductions) {
                    const ded = res.loanDeductions.find(ld => ld.loanId === loanId);
                    if (ded) {
                        history.push({
                            payrollName: run.payrollName || run.name,
                            date: run.closedAt,
                            amount: ded.amount
                        });
                    }
                }
            });
        });

        showModal(`Historial de Cobros: ${loan.reason}`, `
                    <p class="mb-4">Empleado: <strong>${loan.employeeName}</strong></p>
                    <table class="data-table">
                        <thead>
                            <tr>
                                <th>Nómina</th>
                                <th>Fecha</th>
                                <th class="text-right">Monto Cobrado</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${history.map(h => `
                                <tr>
                                    <td>${h.payrollName}</td>
                                    <td>${new Date(h.date).toLocaleDateString()}</td>
                                    <td class="text-right" style="font-weight: bold">$${parseFloat(h.amount).toFixed(2)}</td>
                                </tr>
                            `).join('')}
                            ${history.length === 0 ? '<tr><td colspan="3" style="text-align:center">No se han registrado cobros aún para este préstamo.</td></tr>' : ''}
                        </tbody>
                    </table>
                `, () => hideModal());
    };

    document.getElementById('add-disc-btn').onclick = () => {
        showModal('Crear Descuento', `
            <div class="form-group">
                <label>Empleado</label>
                <select id="disc-emp" class="form-control">
                    ${window.getVisibleEmployees().filter(e => e.active !== false).map(e => `<option value="${e.firstName} ${e.lastName}">${e.firstName} ${e.lastName}</option>`).join('')}
                </select>
            </div>
            <div class="form-group">
                <label>Monto Deuda Total</label>
                <input type="number" id="disc-total" class="form-control" placeholder="0.00">
            </div>
            <div class="form-group">
                <label>Cuota a Descontar por Nómina</label>
                <input type="number" id="disc-installment" class="form-control" placeholder="0.00">
            </div>
            <div class="form-group">
                <label>Concepto / Motivo</label>
                <input type="text" id="disc-reason" class="form-control" placeholder="Ej: Préstamo personal">
            </div>
        `, () => {
            const d = {
                id: Date.now() + Math.random().toString(36).substr(2, 9),
                employeeName: document.getElementById('disc-emp').value,
                totalAmount: document.getElementById('disc-total').value,
                installment: document.getElementById('disc-installment').value,
                remainingBalance: document.getElementById('disc-total').value,
                reason: document.getElementById('disc-reason').value,
                operation: state.settings.payrollAccounts?.discounts || '',
                createdBy: window.globalState.currentUser?.name || 'Desconocido'
            };
            if (d.employeeName && d.totalAmount && d.installment) {
                if (!state.discounts) state.discounts = [];
                const nextNum = state.discounts.length > 0 ? Math.max(0, ...state.discounts.map(x => parseInt(x.loanNumber) || 0)) + 1 : 1;
                d.loanNumber = nextNum;
                state.discounts.push(d);
                saveState();
                renderSection('discounts');
                hideModal();
            } else {
                alert('Por favor complete el monto total y la cuota.');
            }
        });
    };
    window.showEditDiscountModal = (loanId) => {
        const d = state.discounts.find(x => x.id === loanId);
        if (!d) return;

        const originalAmount = parseFloat(d.amount || d.totalAmount || 0);
        const currentBalance = parseFloat(d.remainingBalance ?? originalAmount);
        const paidAmount = originalAmount - currentBalance;

        showModal('Editar Descuento', `
                    <div class="form-group">
                        <label>Empleado</label>
                        <input type="text" class="form-control" value="${d.employeeName}" disabled>
                    </div>
                    <div class="form-group">
                        <label>Monto Ya Descontado (Histórico)</label>
                        <input type="text" class="form-control text-success" value="$${paidAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}" disabled>
                        <small class="text-gray">El nuevo Monto Deuda Total no puede ser menor a esto.</small>
                    </div>
                    <div class="form-group mt-3">
                        <label>Nuevo Monto Deuda Total</label>
                        <input type="number" id="edit-disc-total" class="form-control" value="${originalAmount}" step="0.01">
                    </div>
                    <div class="form-group">
                        <label>Nueva Cuota por Nómina</label>
                        <input type="number" id="edit-disc-installment" class="form-control" value="${d.installment}" step="0.01">
                    </div>
                    <div class="form-group">
                        <label>Concepto / Motivo</label>
                        <input type="text" id="edit-disc-reason" class="form-control" value="${d.reason}">
                    </div>
                `, () => {
            const newTotalStr = document.getElementById('edit-disc-total').value;
            const newInstallmentStr = document.getElementById('edit-disc-installment').value;
            const newReason = document.getElementById('edit-disc-reason').value;

            if (!newTotalStr || !newInstallmentStr) {
                alert('Complete el monto total y la cuota.');
                return;
            }

            const newTotal = parseFloat(newTotalStr);
            const newInstallment = parseFloat(newInstallmentStr);

            if (newTotal < paidAmount) {
                alert(`Transacción denegada. El empleado ya ha pagado $\${paidAmount.toFixed(2)}. La deuda total no puede ser menor a lo que ya se cobró.`);
                return;
            }

            d.totalAmount = newTotal;
            d.amount = newTotal; // Legacy support
            d.installment = newInstallment;
            d.remainingBalance = newTotal - paidAmount;
            d.reason = newReason;

            saveState();
            renderSection('discounts');
            hideModal();
        });
    };
};

// --- Module: Overtime ---
const renderOvertime = (container) => {
    container.innerHTML = `
                            < div class= "header-action" >
                            <h1>Gestión de Horas Extras</h1>
        </div >
        
        <div class="card mt-4">
            <div class="form-row">
                <div class="form-group">
                    <label>Fecha</label>
                    <input type="date" id="ot-date" class="form-control" value="${new Date().toISOString().split('T')[0]}">
                </div>
                <div class="form-group">
                    <label>Empleado</label>
                    <select id="ot-emp" class="form-control">
                        ${window.getVisibleEmployees().filter(e => e.type === 'fixed' && e.active !== false).map(e => `<option value="${e.firstName} ${e.lastName}" data-salary="${e.salary}">${e.firstName} ${e.lastName}</option>`).join('')}
                    </select>
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label>Cant. Horas</label>
                    <input type="number" id="ot-hours" class="form-control" placeholder="0">
                </div>
                <div class="form-group">
                    <label>Factor Mult. (Ej: 1.35 o 2.0)</label>
                    <input type="number" id="ot-factor" class="form-control" value="1.35" step="0.01">
                </div>
            </div>
            <div id="ot-result" class="mt-4 p-4 glass-bg rounded-md hidden">
                <h3 style="margin-bottom: 5px;">Cálculo Estimado: <span id="ot-pay-value" class="text-accent"></span></h3>
                <small id="ot-formula-info" class="text-gray"></small>
            </div>
            <button class="btn btn-primary mt-4" id="save-ot-btn">
                <i class="fas fa-save"></i> Calcular y Registrar
            </button>
        </div>

        <div class="card mt-4">
            <h3>Registros del Periodo Actual</h3>
            <table class="data-table mt-2">
                <thead>
                    <tr>
                        <th style="width: 50px">Nº</th>
                        <th>Fecha</th>
                        <th>Empleado</th>
                        <th>Horas</th>
                        <th>Factor</th>
                        <th class="text-right">Monto</th>
                        <th>Registrado por</th>
                        <th style="width: 80px">Acciones</th>
                    </tr>
                </thead>
                <tbody>
                    ${(() => {
            const bounds = getPayrollBounds();
            const filtered = (state.overtime || []).map((ot, idx) => ({ ...ot, idx })).filter(ot => {
                if (!bounds) return false;
                return ot.date >= bounds.min && ot.date <= bounds.max;
            });

            return filtered.map(ot => `
                            <tr>
                                <td>OT-${ot.otNumber || (ot.idx + 1)}</td>
                                <td>${ot.date}</td>
                                <td>${ot.employeeName}</td>
                                <td>${ot.hours}</td>
                                <td>${ot.factor}</td>
                                <td class="td-numeric">$${parseFloat(ot.amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                <td><small>${ot.createdBy || 'Sistema'}</small></td>
                                <td>
                                    <button class="btn-icon delete admin-only" onclick="deleteItem('overtime', ${ot.idx})">
                                        <i class="fas fa-trash"></i>
                                    </button>
                                </td>
                            </tr>
                        `).join('');
        })()}
                        ${(() => {
            const bounds = getPayrollBounds();
            const count = (state.overtime || []).filter(ot => bounds && ot.date >= bounds.min && ot.date <= bounds.max).length;
            return count === 0 ? '<tr><td colspan="8" style="text-align:center">No hay horas extras en este periodo</td></tr>' : '';
        })()}
                </tbody>
            </table>
        </div>
        `;

    document.getElementById('save-ot-btn').onclick = () => {
        const empSelect = document.getElementById('ot-emp');
        const empName = empSelect.value;
        const salary = parseFloat(empSelect.selectedOptions[0].dataset.salary);
        const hours = parseFloat(document.getElementById('ot-hours').value);
        const factor = parseFloat(document.getElementById('ot-factor').value);
        const date = document.getElementById('ot-date').value;

        if (salary && hours && date) {
            const bounds = getPayrollBounds();
            if (bounds && (date < bounds.min || date > bounds.max)) {
                alert(`La fecha debe estar dentro del rango de la nómina(${bounds.min} a ${bounds.max})`);
                return;
            }

            const dailyRate = salary / 23.83;
            const hourlyRate = dailyRate / 8;
            const extraPay = hourlyRate * hours * factor;

            state.overtime.push({
                id: Date.now().toString(36) + Math.random().toString(36).substring(2),
                otNumber: state.overtime.length > 0 ? Math.max(0, ...state.overtime.map(x => parseInt(x.otNumber) || 0)) + 1 : 1,
                date,
                employeeName: empName,
                hours,
                factor,
                amount: extraPay.toFixed(2),
                operation: state.settings.payrollAccounts?.overtime || ''
            });

            saveState();
            renderSection('overtime');
            alert('Horas extras registradas correctamente.');
        } else {
            alert('Por favor complete todos los campos.');
        }
    };

    // Real-time calculation preview
    const updatePreview = () => {
        const empSelect = document.getElementById('ot-emp');
        const salary = parseFloat(empSelect.selectedOptions[0].dataset.salary);
        const hours = parseFloat(document.getElementById('ot-hours').value) || 0;
        const factor = parseFloat(document.getElementById('ot-factor').value) || 1.35;

        if (salary && hours > 0) {
            const dailyRate = salary / 23.83;
            const hourlyRate = dailyRate / 8;
            const extraPay = hourlyRate * hours * factor;

            document.getElementById('ot-pay-value').innerText = `$${extraPay.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} `;
            document.getElementById('ot-formula-info').innerText = `Formula: ($${salary.toFixed(2)} / 23.83 / 8) * ${hours} * ${factor} `;
            document.getElementById('ot-result').classList.remove('hidden');
        } else {
            document.getElementById('ot-result').classList.add('hidden');
        }
    };

    document.getElementById('ot-hours').oninput = updatePreview;
    document.getElementById('ot-factor').oninput = updatePreview;
    document.getElementById('ot-emp').onchange = updatePreview;
};

// --- Module: Incentives ---
const renderIncentives = (container) => {
    container.innerHTML = `
            <div class="header-action">
            <h1>Incentivos</h1>
            <button class="btn btn-primary" id="add-inc-btn">
                <i class="fas fa-plus"></i> Aplicar Incentivo
            </button>
        </div >
            <div class="card mt-4">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th style="width: 50px">Nº</th>
                            <th>Fecha</th>
                            <th>Empleado</th>
                            <th>Monto</th>
                            <th>Motivo</th>
                            <th>Registrado por</th>
                            <th style="width: 100px">Acciones</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${(() => {
            const bounds = getPayrollBounds();
            const filtered = (state.incentives || []).map((inc, idx) => ({ ...inc, idx })).filter(inc => {
                if (!bounds) return false;
                return inc.date >= bounds.min && inc.date <= bounds.max;
            });

            return filtered.map(inc => `
                            <tr>
                                <td>INC-${inc.incNumber || (inc.idx + 1)}</td>
                                <td>${inc.date}</td>
                                <td>${inc.employeeName}</td>
                                <td>$${parseFloat(inc.amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                <td>${inc.reason}</td>
                                <td><small>${inc.createdBy || 'Sistema'}</small></td>
                                <td>
                                    <button class="btn-icon delete admin-only" onclick="deleteItem('incentives', ${inc.idx})">
                                        <i class="fas fa-trash"></i>
                                    </button>
                                </td>
                            </tr>
                        `).join('');
        })()}
                        ${(() => {
            const bounds = getPayrollBounds();
            const count = (state.incentives || []).filter(inc => bounds && inc.date >= bounds.min && inc.date <= bounds.max).length;
            return count === 0 ? '<tr><td colspan="7" style="text-align:center">No hay incentivos en este periodo</td></tr>' : '';
        })()}
                    </tbody>
                </table>
            </div>
        `;

    document.getElementById('add-inc-btn').onclick = () => {
        showModal('Aplicar Incentivo', `
            < div class="form-group" >
                <label>Fecha</label>
                <input type="date" id="inc-date" class="form-control" value="${new Date().toISOString().split('T')[0]}">
            </div>
            <div class="form-group">
                <label>Empleado</label>
                <select id="inc-emp" class="form-control">
                    ${window.getVisibleEmployees().filter(e => e.active !== false).map(e => `<option value="${e.firstName} ${e.lastName}">${e.firstName} ${e.lastName}</option>`).join('')}
                </select>
            </div>
            <div class="form-group">
                <label>Monto</label>
                <input type="number" id="inc-amount" class="form-control" placeholder="0.00">
            </div>
            <div class="form-group">
                <label>Motivo</label>
                <input type="text" id="inc-reason" class="form-control" placeholder="Ej: Bono por meta">
            </div>
        `, () => {
            const inc = {
                date: document.getElementById('inc-date').value,
                employeeName: document.getElementById('inc-emp').value,
                amount: document.getElementById('inc-amount').value,
                reason: document.getElementById('inc-reason').value,
                operation: state.settings.payrollAccounts?.incentives || '',
                createdBy: window.globalState.currentUser?.name || 'Desconocido'
            };
            if (inc.employeeName && inc.amount && inc.date) {
                const bounds = getPayrollBounds();
                if (bounds && (inc.date < bounds.min || inc.date > bounds.max)) {
                    alert(`La fecha debe estar dentro del rango de la nómina(${bounds.min} a ${bounds.max})`);
                    return;
                }

                if (!state.incentives) state.incentives = [];
                const nextNum = state.incentives.length > 0 ? Math.max(0, ...state.incentives.map(x => parseInt(x.incNumber) || 0)) + 1 : 1;
                inc.incNumber = nextNum;
                inc.id = Date.now().toString(36) + Math.random().toString(36).substring(2);
                state.incentives.push(inc);
                saveState();
                renderSection('incentives');
                hideModal();
            }
        });
    };
};

const getNextDateSuggestion = (periodName) => {
    // Priority 1: Check if there's an active payroll of this type
    const activePayrolls = state.activePayrolls || [];
    const sameTypeActive = activePayrolls
        .filter(p => p.periodType === periodName && p.startDate)
        .sort((a, b) => new Date(b.startDate) - new Date(a.startDate)); // Sort descending by start date

    if (sameTypeActive.length > 0) {
        // Calculate the end date of this active payroll
        const latestActive = sameTypeActive[0];
        const bounds = getPayrollBounds(latestActive.id);

        if (bounds && bounds.max) {
            const lastEnd = new Date(bounds.max + 'T00:00:00');
            lastEnd.setDate(lastEnd.getDate() + 1);
            return lastEnd.toISOString().split('T')[0];
        }
    }

    // Priority 2: Check history of closed payrolls
    const history = state.payrollHistory || [];
    const sameTypeHistory = history
        .filter(h => h.periodType === periodName && h.periodEnd)
        .sort((a, b) => new Date(b.periodEnd) - new Date(a.periodEnd)); // Sort descending by end date

    if (sameTypeHistory.length > 0) {
        const lastEnd = new Date(sameTypeHistory[0].periodEnd + 'T00:00:00');
        lastEnd.setDate(lastEnd.getDate() + 1);
        return lastEnd.toISOString().split('T')[0];
    }

    // Priority 3: Return today
    return new Date().toISOString().split('T')[0];
};

const renderPayrollRuns = (container) => {
    container.innerHTML = `
            <div class="header-action">
            <h1>Gestión de Pagos (Nóminas Abiertas)</h1>
            <button class="btn btn-primary" id="open-payroll-btn">
                <i class="fas fa-play"></i> Abrir Nueva Nómina
            </button>
        </div>
            <div class="card mt-4">
                <div id="active-payroll-info">
                    ${(state.activePayrolls && state.activePayrolls.length > 0) ? `
                        <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 15px;">
                            ${state.activePayrolls.map(payroll => `
                                <div class="status-box success" style="margin: 0;">
                                    <h3>${payroll.name}</h3>
                                    <p>Periodo: ${payroll.periodType}</p>
                                    <p>Inicio: ${payroll.startDate}</p>
                                    <p><small>${payroll.dailyLogs ? payroll.dailyLogs.length : 0} registros activos</small></p>
                                </div>
                            `).join('')}
                        </div>
                    ` : '<p>No hay ninguna nómina habilitada para pago en este momento.</p>'}
                </div>
            </div>
        `;

    document.getElementById('open-payroll-btn').onclick = () => {
        showModal('Abrir Nómina', `
            <div class="form-group">
                <label>Nombre identificador</label>
                <input type="text" id="run-name" class="form-control" placeholder="Ej: Nómina Marzo Q1">
            </div>
            <div class="form-group">
                <label>Tipo de Periodo</label>
                <select id="run-period" class="form-control" onchange="document.getElementById('run-date').value = getNextDateSuggestion(this.value)">
                    <option value="" disabled selected>Seleccione un periodo...</option>
                    ${state.periods.map(p => `<option value="${p.name}">${p.name} (${p.frequency})</option>`).join('')}
                </select>
            </div>
            <div class="form-group">
                <label>Fecha de Inicio del Pago</label>
                <input type="date" id="run-date" class="form-control">
            </div>
        `, () => {
            if (!state.activePayrolls) state.activePayrolls = [];
            state.activePayrolls.push({
                id: Date.now().toString(36) + Math.random().toString(36).substring(2),
                name: document.getElementById('run-name').value,
                periodType: document.getElementById('run-period').value,
                startDate: document.getElementById('run-date').value,
                status: 'open',
                dailyLogs: []
            });
            saveState();
            renderSection('payroll-runs');
            hideModal();
        });
    };
};

// --- Module: Daily Registration ---
const renderDailyRegistration = (container) => {
    if (!state.activePayrolls || state.activePayrolls.length === 0) {
        container.innerHTML = '<h1>Registro Diario</h1><div class="card mt-4"><p class="text-danger">Debe abrir una nómina primero en la sección "Abrir Nómina".</p></div>';
        return;
    }

    if (!window.dailyRegTab) window.dailyRegTab = 'individual';
    const tab = window.dailyRegTab;

    if (!window.selectedDailyPayrollId && state.activePayrolls.length > 0) {
        window.selectedDailyPayrollId = state.activePayrolls[0].id;
    }
    const payrollOptions = state.activePayrolls.map(p =>
        `<option value="${p.id}" ${p.id == window.selectedDailyPayrollId ? 'selected' : ''}>${p.name} (${p.startDate})</option>`
    ).join('');

    const activePayroll = state.activePayrolls.find(p => p.id == window.selectedDailyPayrollId) || state.activePayrolls[0];
    const bounds = getPayrollBounds(activePayroll.id);
    const defaultDate = bounds ? bounds.min : new Date().toISOString().split('T')[0];

    container.innerHTML = `
            <div class="header-action">
            <h1>Registro Diario - Empleados Móviles</h1>
            <div style="display: flex; gap: 15px; align-items: center;">
                <select id="daily-payroll-select" class="form-control" style="width: auto; font-weight: bold; padding: 5px 10px;" onchange="window.selectedDailyPayrollId = this.value; renderSection('daily-registration')">
                    ${payrollOptions}
                </select>
                <div class="tabs no-print">
                    <button class="tab-btn ${tab === 'individual' ? 'active' : ''}" onclick="window.dailyRegTab = 'individual'; renderSection('daily-registration')">Individual</button>
                    <button class="tab-btn ${tab === 'masivo' ? 'active' : ''}" onclick="window.dailyRegTab = 'masivo'; renderSection('daily-registration')">Registro Masivo</button>
                </div>
            </div>
        </div >

            ${tab === 'individual' ? `
        <div class="card mt-4">
            <div class="form-row">
                <div class="form-group">
                    <label>Fecha</label>
                    <input type="date" id="reg-date" class="form-control" 
                           value="${defaultDate}"
                           ${bounds ? `min="${bounds.min}" max="${bounds.max}"` : ''}>
                </div>
                <div class="form-group">
                    <label>Filtrar por Departamento</label>
                    <select id="reg-dept" class="form-control">
                        <option value="all">Todos los Departamentos</option>
                        ${state.departments.map(d => `<option value="${d.name}">${d.name}</option>`).join('')}
                    </select>
                </div>
                <div class="form-group">
                    <label>Empleado Móvil</label>
                    <input list="list-emp" id="reg-emp" class="form-control" placeholder="Buscar empleado...">
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label>Operación</label>
                    <input list="list-op" id="reg-op" class="form-control" placeholder="Buscar operación...">
                </div>
                <div class="form-group">
                    <label>Actividad</label>
                    <input list="list-act" id="reg-act" class="form-control" placeholder="Buscar actividad...">
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label>Monto Real del Día ($)</label>
                    <input type="number" id="reg-amount" class="form-control" placeholder="0.00">
                </div>
                <div class="form-group">
                    <label>¿Aplicar Descuento TSS?</label>
                    <select id="reg-tss" class="form-control">
                        <option value="si">Sí — Descontar TSS</option>
                        <option value="no" selected>No — Sin descuento TSS</option>
                    </select>
                </div>
            </div>
            <button class="btn btn-primary" id="save-daily">Registrar Día de Trabajo</button>
        </div>
        ` : `
        <div class="card mt-4">
            <div class="form-row" style="align-items: flex-end;">
                <div class="form-group">
                    <label>Fecha del Lote</label>
                    <input type="date" id="bulk-date" class="form-control" 
                           value="${defaultDate}"
                           ${bounds ? `min="${bounds.min}" max="${bounds.max}"` : ''}
                           onchange="renderBulkTable()">
                </div>
                <div class="form-group">
                    <label>Departamento</label>
                    <select id="bulk-dept" class="form-control" onchange="renderBulkTable()">
                        <option value="">Seleccione Departamento...</option>
                        ${state.departments.map(d => `<option value="${d.name}">${d.name}</option>`).join('')}
                    </select>
                </div>
                <div class="form-group" style="flex: 2;">
                    <label>Acción en Lote (Aplicar a todos)</label>
                    <div style="display: flex; gap: 5px;">
                        <input list="list-op" id="batch-op" class="form-control" placeholder="Operación...">
                        <input list="list-act" id="batch-act" class="form-control" placeholder="Actividad..." onchange="updateBatchAmount(this.value)">
                        <select id="batch-tss" class="form-control" style="width: 100px;">
                            <option value="no">No TSS</option>
                            <option value="si">Sí</option>
                        </select>
                        <button class="btn btn-secondary" onclick="applyBatchToAll()">Aplicar</button>
                    </div>
                </div>
            </div>

            <div class="mt-4" style="overflow-x: auto;">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>Trabajador</th>
                            <th>Operación</th>
                            <th>Actividad</th>
                            <th>Monto</th>
                            <th>TSS</th>
                            <th style="width: 50px"></th>
                        </tr>
                    </thead>
                    <tbody id="bulk-tbody">
                        <tr><td colspan="6" style="text-align:center" class="text-gray">Seleccione un departamento para cargar los empleados</td></tr>
                    </tbody>
                </table>
            </div>
            
            <div class="mt-4" style="display: flex; justify-content: flex-end;">
                <button class="btn btn-primary" onclick="saveBulkLogs()">
                    <i class="fas fa-save"></i> Guardar Todo el Lote
                </button>
            </div>
        </div>
        `}

        <div class="card mt-4">
            <h3>Registros del Periodo Actual</h3>
            <table class="data-table">
                <thead>
                    <tr>
                        <th style="width: 50px">Nº</th>
                        <th>Fecha</th>
                        <th>Empleado</th>
                        <th>Operación</th>
                        <th>Monto</th>
                        <th>TSS</th>
                        <th>Registrado por</th>
                        <th style="width: 100px">Acciones</th>
                    </tr>
                </thead>
                <tbody id="daily-logs-tbody">
                    ${(activePayroll.dailyLogs || []).map((log, index) => `
                        <tr>
                            <td>LOG-${log.logNumber || (index + 1)}</td>
                            <td>${log.date}</td>
                            <td>${log.employee}</td>
                            <td>${log.op}</td>
                            <td>$${parseFloat(log.amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                            <td>${log.applyTSS === 'si' ? '<span class="status-badge fixed">Sí</span>' : '<span class="status-badge mobile">No</span>'}</td>
                            <td><small>${log.createdBy || 'Sistema'}</small></td>
                            <td>
                                <button class="btn-icon edit" onclick="editDailyLog(${index})">
                                    <i class="fas fa-edit"></i>
                                </button>
                                <button class="btn-icon delete admin-only" onclick="deleteDailyLog(${index})">
                                    <i class="fas fa-trash"></i>
                                </button>
                            </td>
                        </tr>
                    `).join('')}
                    ${(!activePayroll.dailyLogs || activePayroll.dailyLogs.length === 0) ? '<tr><td colspan="8" style="text-align:center">No hay registros diarios</td></tr>' : ''}
                </tbody>
            </table>
        </div>

        <datalist id="list-emp">
            ${window.getVisibleEmployees().filter(e => e.type === 'mobile' && e.active !== false).map(e => `<option value="${e.firstName} ${e.lastName}"></option>`).join('')}
        </datalist>
        <datalist id="list-op">
            ${state.operations.filter(o => o.useInLabor === undefined || o.useInLabor).map(o => `<option value="${o.name}"></option>`).join('')}
        </datalist>
        <datalist id="list-act">
            ${state.activities.map(a => `<option value="${a.name}"></option>`).join('')}
        </datalist>
        `;

    const saveDailyBtn = document.getElementById('save-daily');
    if (saveDailyBtn) saveDailyBtn.onclick = () => {
        const empName = document.getElementById('reg-emp').value;
        const regDate = document.getElementById('reg-date').value;

        // Validation: Hire Date
        const employee = state.employees.find(e => `${e.firstName} ${e.lastName}` === empName);
        if (employee && employee.hireDate && regDate < employee.hireDate) {
            alert(`No se puede registrar labor antes de la fecha de ingreso del empleado(${employee.hireDate})`);
            return;
        }

        // Validation: Payroll Date Range
        const activePayroll = state.activePayrolls.find(p => p.id == window.selectedDailyPayrollId) || state.activePayrolls[0];
        const bounds = getPayrollBounds(activePayroll.id);
        if (bounds && (regDate < bounds.min || regDate > bounds.max)) {
            alert(`La fecha debe estar dentro del rango de la nómina abierta (${bounds.min} a ${bounds.max})`);
            return;
        }

        const log = {
            id: Date.now().toString(36) + Math.random().toString(36).substring(2),
            date: regDate,
            employee: empName,
            op: document.getElementById('reg-op').value,
            act: document.getElementById('reg-act').value,
            amount: document.getElementById('reg-amount').value,
            applyTSS: document.getElementById('reg-tss').value,
            createdBy: window.globalState.currentUser?.name || 'Desconocido'
        };

        if (log.employee && log.amount) {
            if (!activePayroll.dailyLogs) activePayroll.dailyLogs = [];

            // Check for duplicates
            const isDuplicate = activePayroll.dailyLogs.find(l => l.employee === log.employee && l.date === log.date);
            if (isDuplicate) {
                alert(`Atención: El empleado ${log.employee} ya tiene un salario digitado para el día ${log.date}.`);
                return;
            }

            const nextLogNum = activePayroll.dailyLogs.length > 0 ? Math.max(0, ...activePayroll.dailyLogs.map(l => parseInt(l.logNumber) || 0)) + 1 : 1;
            log.logNumber = nextLogNum;
            activePayroll.dailyLogs.push(log);
            saveState();
            renderSection('daily-registration');
        }
    };

    const deptSelect = document.getElementById('reg-dept');
    if (deptSelect) deptSelect.onchange = () => {
        const selectedDept = deptSelect.value;
        const filteredEmps = window.getVisibleEmployees().filter(e =>
            e.type === 'mobile' && e.active !== false && (selectedDept === 'all' || e.department === selectedDept)
        );
        const listEmp = document.getElementById('list-emp');
        if (listEmp) {
            listEmp.innerHTML = filteredEmps.map(e =>
                `<option value="${e.firstName} ${e.lastName}"></option>`
            ).join('');
        }
        const regEmpInput = document.getElementById('reg-emp');
        if (regEmpInput) {
            regEmpInput.value = '';
            const rows = document.querySelectorAll('#daily-logs-tbody tr');
            rows.forEach(row => row.style.display = '');
        }
    };

    const regEmpInput = document.getElementById('reg-emp');
    if (regEmpInput) {
        regEmpInput.oninput = () => {
            const filter = regEmpInput.value.toLowerCase().trim();
            const rows = document.querySelectorAll('#daily-logs-tbody tr');
            rows.forEach(row => {
                if (row.cells.length > 2) {
                    const empName = row.cells[2].textContent.toLowerCase();
                    row.style.display = empName.includes(filter) ? '' : 'none';
                }
            });
        };
    }

    // Auto-populate amount based on activity
    const regActInput = document.getElementById('reg-act');
    const regAmountInput = document.getElementById('reg-amount');
    if (regActInput && regAmountInput) {
        regActInput.oninput = () => {
            const val = regActInput.value.trim();
            const activity = state.activities.find(a => a.name === val);
            if (activity && activity.dailySalary) {
                regAmountInput.value = activity.dailySalary;
            }
        };
    }
};

// --- Module: ISR / Impuestos ---
const renderISR = (container) => {
    container.innerHTML = `
        <div class="header-action">
            <h1>Gestión de ISR (Impuesto Sobre la Renta)</h1>
            <p class="text-gray">Active o desactive la retención de ISR para cada empleado. El sistema calculará el impuesto automáticamente solo para los marcados.</p>
        </div>
        
        <div class="card mt-4">
            <div class="search-box mb-4">
                <input type="text" id="isr-search" class="form-control" placeholder="Buscar empleado por nombre o cédula..." oninput="filterISRTable(this.value)">
            </div>
            
            <table class="data-table">
                <thead>
                    <tr>
                        <th>Empleado</th>
                        <th>Cédula</th>
                        <th>Departamento</th>
                        <th>Tipo</th>
                        <th>Salario Base</th>
                        <th style="text-align: center">¿Aplica ISR?</th>
                    </tr>
                </thead>
                <tbody id="isr-tbody">
                    ${window.getVisibleEmployees().filter(e => e.active !== false).map(emp => `
                        <tr>
                            <td><strong>${emp.firstName} ${emp.lastName}</strong></td>
                            <td>${emp.idNumber || '-'}</td>
                            <td>${emp.department || '-'}</td>
                            <td>${emp.type === 'fixed' ? 'Fijo' : 'Móvil'}</td>
                            <td>$${(parseFloat(emp.salary) || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                            <td style="text-align: center">
                                <label class="switch">
                                    <input type="checkbox" ${emp.applyISR !== false ? 'checked' : ''} 
                                           onchange="window.toggleISRStatus('${emp.idNumber}')">
                                    <span class="slider round"></span>
                                </label>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    `;
};

window.toggleISRStatus = (idNumber) => {
    const emp = state.employees.find(e => e.idNumber === idNumber);
    if (emp) {
        emp.applyISR = (emp.applyISR === false) ? true : false;
        saveState();
        // Notification for user
        const status = emp.applyISR ? 'activado' : 'desactivado';
        console.log(`ISR ${status} para ${emp.firstName}`);
    }
};

window.filterISRTable = (query) => {
    const q = query.toLowerCase();
    const rows = document.querySelectorAll('#isr-tbody tr');
    rows.forEach(row => {
        const text = row.innerText.toLowerCase();
        row.style.display = text.includes(q) ? '' : 'none';
    });
};

window.updateBatchAmount = (actName) => {
    const activity = state.activities.find(a => a.name === actName);
    if (activity && activity.dailySalary) {
        // We don't have a batch amount input, but maybe we should or it applies to rows
    }
};

window.renderBulkTable = () => {
    const dept = document.getElementById('bulk-dept').value;
    const date = document.getElementById('bulk-date').value;
    const tbody = document.getElementById('bulk-tbody');

    if (!dept) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center" class="text-gray">Seleccione un departamento</td></tr>';
        return;
    }

    const emps = window.getVisibleEmployees().filter(e => e.type === 'mobile' && e.active !== false && e.department === dept);
    if (emps.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center" class="text-gray">No hay empleados móviles en este departamento</td></tr>';
        return;
    }

    tbody.innerHTML = emps.map(e => {
        const fullName = `${e.firstName} ${e.lastName}`;
        const activePayroll = state.activePayrolls.find(p => p.id == window.selectedDailyPayrollId) || state.activePayrolls[0];
        const hasLog = (activePayroll.dailyLogs || []).some(l => l.employee === fullName && l.date === date);

        // Get pre-selected activity amount
        let defaultAmount = '';
        if (e.activity) {
            const activity = state.activities.find(a => a.name === e.activity);
            if (activity && activity.dailySalary) {
                defaultAmount = activity.dailySalary;
            }
        }

        return `
            <tr data-emp="${fullName}" class="${hasLog ? 'duplicate-row' : ''}">
                        <td style="font-weight: 500;">
                            ${fullName}
                            ${hasLog ? '<br><small class="text-danger"><i class="fas fa-exclamation-triangle"></i> Ya tiene registro hoy</small>' : ''}
                        </td>
                        <td><input list="list-op" class="form-control bulk-op" value="${e.operation || ''}"></td>
                        <td><input list="list-act" class="form-control bulk-act" value="${e.activity || ''}" oninput="updateRowAmount(this)"></td>
                        <td><input type="number" class="form-control bulk-amt" value="${defaultAmount}" placeholder="0.00"></td>
                        <td>
                            <select class="form-control bulk-tss">
                                <option value="no">No</option>
                                <option value="si">Sí</option>
                            </select>
                        </td>
                        <td>
                            <button class="btn-icon delete" onclick="this.closest('tr').remove()" title="Quitar del lote">
                                <i class="fas fa-times"></i>
                            </button>
                        </td>
                    </tr>
            `;
    }).join('');
};

window.updateRowAmount = (input) => {
    const actName = input.value;
    const targetRow = input.closest('tr');
    const amtInput = targetRow.querySelector('.bulk-amt');
    const activity = state.activities.find(a => a.name === actName);
    if (activity && activity.dailySalary) {
        amtInput.value = activity.dailySalary;
    }
};

window.applyBatchToAll = () => {
    const op = document.getElementById('batch-op').value;
    const act = document.getElementById('batch-act').value;
    const tss = document.getElementById('batch-tss').value;
    const activity = state.activities.find(a => a.name === act);

    document.querySelectorAll('#bulk-tbody tr').forEach(row => {
        const opInput = row.querySelector('.bulk-op');
        if (!opInput) return; // Skip placeholder

        if (op) opInput.value = op;
        if (act) {
            row.querySelector('.bulk-act').value = act;
            if (activity && activity.dailySalary) {
                row.querySelector('.bulk-amt').value = activity.dailySalary;
            }
        }
        if (tss) row.querySelector('.bulk-tss').value = tss;
    });
};

window.saveBulkLogs = () => {
    const date = document.getElementById('bulk-date').value;

    // Validation: Payroll Date Range
    const activePayroll = state.activePayrolls.find(p => p.id == window.selectedDailyPayrollId) || state.activePayrolls[0];
    const bounds = getPayrollBounds(activePayroll.id);
    if (bounds && (date < bounds.min || date > bounds.max)) {
        alert(`La fecha debe estar dentro del rango de la nómina abierta (${bounds.min} a ${bounds.max})`);
        return;
    }

    const rows = document.querySelectorAll('#bulk-tbody tr');
    const logsToAdd = [];
    let duplicates = 0;

    rows.forEach(row => {
        const emp = row.getAttribute('data-emp');
        if (!emp) return; // Skip placeholder

        const op = row.querySelector('.bulk-op').value;
        const act = row.querySelector('.bulk-act').value;
        const amt = row.querySelector('.bulk-amt').value;
        const tss = row.querySelector('.bulk-tss').value;

        if (emp && amt) {
            // Final check for duplicates in state
            const exists = (activePayroll.dailyLogs || []).some(l => l.employee === emp && l.date === date);
            if (exists) {
                duplicates++;
            } else {
                logsToAdd.push({
                    id: Date.now().toString(36) + Math.random().toString(36).substring(2),
                    date,
                    employee: emp,
                    op,
                    act,
                    amount: amt,
                    applyTSS: tss,
                    createdBy: window.globalState.currentUser?.name || 'Desconocido'
                });
            }
        }
    });

    if (logsToAdd.length === 0) {
        alert("No hay registros válidos para guardar o todos son duplicados.");
        return;
    }

    if (duplicates > 0) {
        if (!confirm(`${duplicates} empleados ya tenían registros para esta fecha y fueron ignorados. ¿Desea guardar el resto? `)) return;
    }

    if (!activePayroll.dailyLogs) activePayroll.dailyLogs = [];

    let nextLogNum = activePayroll.dailyLogs.length > 0 ? Math.max(0, ...activePayroll.dailyLogs.map(l => parseInt(l.logNumber) || 0)) + 1 : 1;
    logsToAdd.forEach(l => {
        l.logNumber = nextLogNum;
        nextLogNum++;
    });

    activePayroll.dailyLogs.push(...logsToAdd);
    saveState();
    alert(`Se han guardado ${logsToAdd.length} registros exitosamente.`);
    renderSection('daily-registration');
};

// --- Module: Closing ---
const renderClosing = (container) => {
    let html = `
            <div class="header-action">
                <h1>Cierre de Nómina</h1>
            </div>
        `;

    if (!state.activePayrolls || state.activePayrolls.length === 0) {
        html += `
            <div class="card mt-4" style="text-align: center; padding: 40px;">
                <i class="fas fa-check-circle" style="font-size: 48px; color: var(--success); margin-bottom: 20px;"></i>
                <h2>No hay ninguna nómina abierta actualmente.</h2>
                <p class="text-gray">Puede abrir una nueva nómina desde la sección de "Abrir Nómina".</p>
            </div>
        `;
    } else {
        html += `
            <div class="card mt-4">
                <p>Al cerrar la nómina, los registros del periodo quedarán bloqueados y pasarán al historial.</p>
                <div style="display: flex; flex-direction: column; gap: 15px; margin-top: 20px;">
        `;

        state.activePayrolls.forEach(payroll => {
            html += `
                <div style="border: 1px solid var(--border-color); padding: 15px; border-radius: 8px; display: flex; justify-content: space-between; align-items: center; background: rgba(0, 0, 0, 0.2); flex-wrap: wrap; gap: 15px;">
                    <div>
                        <h3 style="margin: 0; color: var(--text-main);">${payroll.name}</h3>
                        <p style="margin: 5px 0 0 0; color: var(--text-light); font-size: 0.9em;">Periodo: ${payroll.periodType} | Inicio: ${payroll.startDate} | Registros: ${payroll.dailyLogs ? payroll.dailyLogs.length : 0}</p>
                    </div>
                    <div style="display: flex; gap: 10px;">
                        <button class="btn btn-danger close-payroll-btn" data-id="${payroll.id}">
                            <i class="fas fa-lock"></i> Cerrar Nómina
                        </button>
                        <button class="btn btn-secondary delete-open-payroll-btn" data-id="${payroll.id}" style="background-color: #f8d7da; color: #721c24; border: 1px solid #f5c6cb;">
                            <i class="fas fa-trash-alt"></i> Descartar
                        </button>
                    </div>
                </div>
            `;
        });

        html += `
                </div>
            </div>
        `;
    }

    html += `
            < div class="mt-5" >
                    <h2 class="mb-4"><i class="fas fa-history"></i> Historial de Nóminas Cerradas</h2>
                    <div class="card">
                        <table class="data-table">
                            <thead>
                                <tr>
                                    <th style="width: 50px">Nº</th>
                                    <th>Nombre de la Nómina</th>
                                    <th>Periodo</th>
                                    <th>Fecha de Cierre</th>
                                    <th>Cerrado por</th>
                                    <th style="text-align: center">Acciones</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${state.payrollHistory.length > 0 ?
            state.payrollHistory.slice().reverse().map((run, i) => `
                                        <tr>
                                            <td>PN-${run.payrollNumber || (state.payrollHistory.length - i)}</td>
                                            <td style="font-weight: 500">${run.payrollName || run.name || 'Sin nombre'}</td>
                                            <td>${run.periodStart} al ${run.periodEnd}</td>
                                            <td>${new Date(run.closedAt).toLocaleString()}</td>
                                            <td><small>${run.closedBy || 'Sistema'}</small></td>
                                            <td style="text-align: center">
                                                <button class="btn btn-sm btn-secondary" onclick="window.viewHistoricalPayroll(${state.payrollHistory.length - 1 - i})">
                                                    <i class="fas fa-eye"></i> Consultar
                                                </button>
                                                <button class="btn btn-sm btn-primary" onclick="window.printHistoricalPayroll(${state.payrollHistory.length - 1 - i})">
                                                    <i class="fas fa-print"></i> Imprimir
                                                </button>
                                            </td>
                                        </tr>
                                    `).join('') :
            '<tr><td colspan="6" style="text-align: center; padding: 20px;">No hay nóminas cerradas en el historial.</td></tr>'
        }
                            </tbody>
                        </table>
                    </div>
                </div >
            `;

    container.innerHTML = html;

    if (state.activePayrolls && state.activePayrolls.length > 0) {
        const closeBtns = document.querySelectorAll('.close-payroll-btn');
        closeBtns.forEach(btn => {
            btn.onclick = async () => {
                const targetId = btn.getAttribute('data-id');
                const targetPayroll = state.activePayrolls.find(p => p.id == targetId);

                if (confirm(`¿Está seguro que desea cerrar la nómina "${targetPayroll.name}"? Los montos calculados se guardarán en el historial para fines de Regalía Pascual.`)) {
                    try {
                        const bounds = getPayrollBounds(targetId);
                        if (!bounds) throw new Error("No se pudierón calcular los límites del periodo.");

                        const snapshot = {
                            id: Date.now(),
                            payrollName: targetPayroll.name || "Nómina sin nombre",
                            payrollNumber: state.payrollHistory.length > 0 ? Math.max(0, ...state.payrollHistory.map(h => parseInt(h.payrollNumber) || 0)) + 1 : 1,
                            periodType: targetPayroll.periodType,
                            periodStart: bounds.min,
                            periodEnd: bounds.max,
                            closedAt: new Date().toISOString(),
                            closedBy: window.globalState.currentUser?.name || 'Desconocido',
                            dailyLogs: [...(targetPayroll.dailyLogs || [])],
                            results: window.getVisibleEmployees().filter(e => e && e.active !== false).map(emp => {
                                try {
                                    const res = calculateEmployeePayrollData(emp, targetPayroll);
                                    return {
                                        idNumber: emp.idNumber,
                                        fullName: `${emp.firstName} ${emp.lastName} `,
                                        type: emp.type,
                                        dept: emp.department,
                                        base: res.base || 0,
                                        incentives: res.inc || 0,
                                        overtime: res.ot || 0,
                                        christmas: res.chr || 0,
                                        brute: res.brute || 0,
                                        tss: res.tss || 0,
                                        isr: res.isr || 0,
                                        disc: res.disc || 0,
                                        net: res.net || 0
                                    };
                                } catch (err) {
                                    console.error(`Error calculando empleado ${emp.firstName}: `, err);
                                    throw new Error(`Error en empleado ${emp.firstName} ${emp.lastName}: ${err.message} `);
                                }
                            })
                        };

                        // Update Loan Balances and Track History
                        snapshot.results.forEach(res => {
                            if (res.disc > 0) {
                                const empLoans = state.discounts.filter(d => (d.employeeName || '').trim().toLowerCase() === (res.fullName || '').trim().toLowerCase());
                                let remainingToDeduct = res.disc;
                                res.loanDeductions = []; // Track which loans were hit

                                for (let loan of empLoans) {
                                    if (remainingToDeduct <= 0.005) break;
                                    const balance = parseFloat(loan.remainingBalance) || 0;
                                    if (balance <= 0) continue;

                                    const deductionCap = parseFloat(loan.installment) || balance;
                                    const deduction = Math.min(remainingToDeduct, balance, deductionCap);

                                    // Ensure loan has an ID if it's old
                                    if (!loan.id) loan.id = Date.now() + Math.random().toString(36).substr(2, 9);

                                    loan.remainingBalance = Math.max(0, balance - deduction).toFixed(2);
                                    remainingToDeduct -= deduction;

                                    // Record for history
                                    res.loanDeductions.push({
                                        loanId: loan.id,
                                        amount: deduction
                                    });
                                }
                            }
                        });

                        if (window.savePayrollToHistory) {
                            await window.savePayrollToHistory(snapshot);
                        } else {
                            state.payrollHistory.push(snapshot);
                        }

                        state.activePayrolls = state.activePayrolls.filter(p => String(p.id) !== String(targetId));
                        if (window.selectedDailyPayrollId === targetId) window.selectedDailyPayrollId = null;

                        saveState();
                        renderSection('closing');
                        alert('Nómina cerrada exitosamente.');
                    } catch (globalErr) {
                        console.error("Error crítico al cerrar nómina:", globalErr);
                        alert("No se pudo cerrar la nómina. Error: " + globalErr.message);
                    }
                }
            };
        });

        const deleteBtns = document.querySelectorAll('.delete-open-payroll-btn');
        deleteBtns.forEach(btn => {
            btn.onclick = () => {
                const targetId = btn.getAttribute('data-id');
                const targetPayroll = state.activePayrolls.find(p => String(p.id) === String(targetId));

                if (!targetPayroll) return;

                // Added condition: do not allow deletion if there are records
                if (targetPayroll.dailyLogs && targetPayroll.dailyLogs.length > 0) {
                    alert(`No se puede eliminar la nómina "${targetPayroll.name}" porque ya tiene registros diarios. Debe cerrar la nómina o eliminar los registros individualmente primero.`);
                    return;
                }

                if (confirm(`¿Está TOTALMENTE SEGURO de eliminar la nómina "${targetPayroll.name}"?\n\nEsto borrará todos los registros diarios asociados y no se podrá deshacer.`)) {
                    state.activePayrolls = state.activePayrolls.filter(p => String(p.id) !== String(targetId));
                    if (String(window.selectedDailyPayrollId) === String(targetId)) window.selectedDailyPayrollId = null;

                    saveState();
                    renderSection('closing');
                    alert('Nómina eliminada permanentemente.');
                }
            };
        });
    }
};

window.toggleHistoricalDept = (index, deptName) => {
    if (!window.currentHistoricalFilter) return;
    const idx = window.currentHistoricalFilter.indexOf(deptName);
    if (idx > -1) window.currentHistoricalFilter.splice(idx, 1);
    else window.currentHistoricalFilter.push(deptName);
    window.viewHistoricalPayroll(index);
};

window.selectAllHistoricalDepts = (index, all) => {
    const run = state.payrollHistory[index];
    if (!run) return;
    const allDepts = [...new Set(run.results.map(r => r.dept || 'Sin Departamento'))];
    window.currentHistoricalFilter = all ? allDepts : [];
    window.viewHistoricalPayroll(index);
};

window.viewHistoricalPayroll = (index) => {
    const run = state.payrollHistory[index];
    if (!run) return;

    const allDeptsInRun = [...new Set(run.results.map(r => r.dept || 'Sin Departamento'))];
    if (!window.currentHistoricalFilter || window.lastHistoricalIndex !== index) {
        window.currentHistoricalFilter = [...allDeptsInRun];
        window.lastHistoricalIndex = index;
    }
    const filter = window.currentHistoricalFilter;

    const contentArea = document.getElementById('content-area');

    // Group results by department
    const depts = {};
    run.results.forEach(res => {
        const dName = res.dept || 'Sin Departamento';
        if (!filter.includes(dName)) return;
        if (window.reportOnlyWithPayment && (res.net || 0) <= 0.005) return;
        if (!depts[dName]) depts[dName] = [];
        depts[dName].push(res);
    });

    let reportHtml = '';
    let totalGenBase = 0, totalGenIncentives = 0, totalGenOvertime = 0, totalGenChristmas = 0;
    let totalGenBrute = 0, totalGenTSS = 0, totalGenISR = 0, totalGenDiscounts = 0, totalGenNet = 0;

    Object.keys(depts).forEach(deptName => {
        const deptEmps = depts[deptName];
        let deptBase = 0, deptInc = 0, deptOT = 0, deptChr = 0, deptBrute = 0;
        let deptTSS = 0, deptISR = 0, deptDisc = 0, deptNet = 0;

        const rows = deptEmps.map(res => {
            deptBase += res.base; deptInc += res.incentives; deptOT += res.overtime; deptChr += res.christmas;
            deptBrute += res.brute; deptTSS += res.tss; deptISR += res.isr; deptDisc += res.disc; deptNet += res.net;

            totalGenBase += res.base; totalGenIncentives += res.incentives; totalGenOvertime += res.overtime; totalGenChristmas += res.christmas;
            totalGenBrute += res.brute; totalGenTSS += res.tss; totalGenISR += res.isr; totalGenDiscounts += res.disc; totalGenNet += res.net;

            return `
            < tr >
                    <td>${res.fullName}</td>
                    <td>${res.idNumber || '-'}</td>
                    <td>${res.type === 'fixed' ? 'Fijo' : 'Móvil'}</td>
                    <td class="td-numeric">$${res.base.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td class="td-numeric">$${res.incentives.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td class="td-numeric">$${res.overtime.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td class="td-numeric">$${res.christmas.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td class="td-numeric" style="font-weight: bold">$${res.brute.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td class="td-numeric">$${res.tss.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td class="td-numeric">$${res.isr.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td class="td-numeric" style="color: var(--danger)">$${res.disc.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td class="td-numeric" style="font-weight: bold; background: rgba(0,255,0,0.05)">$${res.net.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                </tr >
            `;
        }).join('');

        reportHtml += `
            < div class="dept-report-section mb-4" >
                <h3 class="text-accent">${deptName}</h3>
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>Empleado</th>
                            <th>Cédula</th>
                            <th>Tipo</th>
                            <th class="text-right">Sueldo Base</th>
                            <th class="text-right">Incentivos</th>
                            <th class="text-right">Extras</th>
                            <th class="text-right">Navidad</th>
                            <th class="text-right">Total Bruto</th>
                            <th class="text-right">Ret. TSS</th>
                            <th class="text-right">Ret. ISR</th>
                            <th class="text-right">Desc.</th>
                            <th class="text-right">Total a Pagar</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rows}
                    </tbody>
                    <tfoot style="display: table-row-group; font-weight: bold; border-top: 2px solid #ddd;">
                        <tr>
                            <td colspan="3" class="text-right">SUBTOTAL ${deptName}:</td>
                            <td class="td-numeric">$${deptBase.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                            <td class="td-numeric">$${deptInc.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                            <td class="td-numeric">$${deptOT.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                            <td class="td-numeric">$${deptChr.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                            <td class="td-numeric">$${deptBrute.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                            <td class="td-numeric">$${deptTSS.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                            <td class="td-numeric">$${deptISR.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                            <td class="td-numeric">$${deptDisc.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                            <td class="td-numeric">$${deptNet.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                        </tr>
                    </tfoot>
                </table>
            </div >
            `;
    });

    contentArea.innerHTML = `
            < div class="header-action no-print" >
            <div style="display: flex; align-items: center; gap: 15px; flex-wrap: wrap;">
                <button class="btn btn-secondary" onclick="renderSection('closing')">
                    <i class="fas fa-arrow-left"></i> Volver
                </button>
                <h1>Consulta de Nómina Histórica</h1>
                
                <div class="multi-select-container no-print" id="hist-dept-multi-select">
                    <div class="multi-select-btn" onclick="this.parentElement.classList.toggle('active')">
                        ${filter.length === allDeptsInRun.length ? 'Todos los Departamentos' : (filter.length === 0 ? 'Ningun Departamento' : `${filter.length} Seleccionados`)}
                    </div>
                    <div class="multi-select-content">
                        <div class="multi-select-actions">
                            <span onclick="window.selectAllHistoricalDepts(${index}, true)">Todos</span>
                            <span onclick="window.selectAllHistoricalDepts(${index}, false)">Ninguno</span>
                        </div>
                        ${allDeptsInRun.map(d => `
                            <div class="multi-select-item" onclick="window.toggleHistoricalDept(${index}, '${d}')">
                                <input type="checkbox" ${filter.includes(d) ? 'checked' : ''} onclick="event.stopPropagation(); window.toggleHistoricalDept(${index}, '${d}')">
                                <span>${d}</span>
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>
            <div class="no-print" style="margin-left: 15px; display: flex; align-items: center;">
                <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; font-size: 0.9rem;">
                    <input type="checkbox" id="chk-hist-only-with-payment" ${window.reportOnlyWithPayment ? 'checked' : ''} 
                        onchange="window.reportOnlyWithPayment = this.checked; window.viewHistoricalPayroll(${index})">
                    Solo con monto a cobrar
                </label>
            </div>
            <div style="display: flex; gap: 10px; flex-wrap: wrap;">
                <button class="btn btn-info" onclick="window.renderMobileDetailedReport(${index})">
                    <i class="fas fa-list-alt"></i> Detalle Labores Móviles
                </button>
                <button class="btn btn-info" onclick="window.renderMobileEmployeeDeptReport(${index})">
                    <i class="fas fa-users"></i> Detalle por Depto/Empleado
                </button>
                <button class="btn btn-primary" onclick="window.print()">
                    <i class="fas fa-print"></i> Imprimir Reporte
                </button>
            </div>
        </div >

            <div class="card mt-4 print-area">
                <div style="text-align: center; margin-bottom: 20px;">
                    <h1 style="margin: 0; color: var(--primary);">REPORTE DE NÓMINA</h1>
                    <p style="font-size: 1.2rem; font-weight: 600; margin: 5px 0;">${run.payrollName}</p>
                    <p class="text-gray">Periodo: ${run.periodStart} al ${run.periodEnd} | Cerrado el: ${new Date(run.closedAt).toLocaleString()}</p>
                </div>

                ${reportHtml || '<p style="text-align: center; padding: 40px; color: var(--gray);">No hay datos para mostrar con los filtros seleccionados.</p>'}

                ${reportHtml ? `
            <div class="summary-card mt-4" style="background: var(--primary); color: white; padding: 20px; border-radius: 8px;">
                <h3 style="margin-bottom: 15px; border-bottom: 1px solid rgba(255,255,255,0.2); padding-bottom: 10px;">RESUMEN GENERAL SELECCIONADO</h3>
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 15px;">
                    <div>
                        <small style="opacity: 0.8; display: block;">Total Bruto</small>
                        <span style="font-size: 1.2rem; font-weight: bold;">$${totalGenBrute.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </div>
                    <div>
                        <small style="opacity: 0.8; display: block;">Total Deducciones</small>
                        <span style="font-size: 1.2rem; font-weight: bold;">$${(totalGenTSS + totalGenISR + totalGenDiscounts).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </div>
                    <div>
                        <small style="opacity: 0.8; display: block;">Total Neto a Pagar</small>
                        <span style="font-size: 1.4rem; font-weight: 900; color: #4ade80;">$${totalGenNet.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </div>
                </div>
            </div>
            ` : ''}
            </div>
        `;
};

window.printHistoricalPayroll = (index) => {
    window.viewHistoricalPayroll(index);
    setTimeout(() => {
        window.print();
    }, 500);
};

const renderMobileDetailedReport = (historyIndex = null, filterOps = null, filterDept = null, activePayrollId = null) => {
    const isHistorical = historyIndex !== null;
    let run = null;
    if (isHistorical) {
        run = state.payrollHistory[historyIndex];
    } else if (activePayrollId) {
        run = (state.activePayrolls || []).find(p => p.id == activePayrollId);
    } else {
        run = state.activePayroll || (state.activePayrolls && state.activePayrolls[0]);
    }

    if (!run) return;

    const logs = run.dailyLogs || [];
    const allOpsInRun = [...new Set(logs.map(l => l.op))].sort();

    // Manage global filter states
    if (window.lastMobileHistoryIndex !== historyIndex) {
        window.currentMobileFilterOps = [...allOpsInRun];
        window.currentMobileFilterDept = 'all';
        window.lastMobileHistoryIndex = historyIndex;
    }

    if (filterOps !== null) window.currentMobileFilterOps = filterOps;
    if (filterDept !== null) window.currentMobileFilterDept = filterDept;

    filterOps = window.currentMobileFilterOps;
    filterDept = window.currentMobileFilterDept;

    const bounds = isHistorical ? { min: run.periodStart, max: run.periodEnd } : getPayrollBounds();
    if (!bounds || !bounds.min || !bounds.max) {
        alert("No hay un periodo definido para esta nómina.");
        return;
    }

    // Generate date range
    const dates = [];
    let current = new Date(bounds.min + 'T00:00:00');
    const end = new Date(bounds.max + 'T00:00:00');
    while (current <= end) {
        dates.push(current.toISOString().split('T')[0]);
        current.setDate(current.getDate() + 1);
    }

    const dayNames = ['Do', 'Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sa'];
    const dateHeaders = dates.map(d => {
        const dateObj = new Date(d + 'T00:00:00');
        return { date: d, day: dayNames[dateObj.getDay()] };
    });

    // Group by Operation -> Employee -> Activity
    const grouped = {};
    logs.forEach(log => {
        // Filter by Operation
        if (!filterOps.includes(log.op)) return;

        // Filter by Department and Access
        const empAccess = state.employees.find(e => `${e.firstName} ${e.lastName}` === log.employee);
        if (empAccess && !window.hasDepartmentAccess(empAccess.department)) return;

        if (filterDept && filterDept !== 'all') {
            const dept = empAccess ? empAccess.department : 'Sin clasificar';
            if (dept !== filterDept) return;
        }

        if (!grouped[log.op]) grouped[log.op] = {};
        if (!grouped[log.op][log.employee]) grouped[log.op][log.employee] = {};
        if (!grouped[log.op][log.employee][log.act]) grouped[log.op][log.employee][log.act] = {};

        grouped[log.op][log.employee][log.act][log.date] = (grouped[log.op][log.employee][log.act][log.date] || 0) + parseFloat(log.amount);
    });

    const contentArea = document.getElementById('content-area');

    // Window level helpers for toggling operations
    window.toggleMobileReportOp = (op) => {
        const idx = filterOps.indexOf(op);
        if (idx > -1) filterOps.splice(idx, 1);
        else filterOps.push(op);
        renderMobileDetailedReport(historyIndex, filterOps, filterDept);
    };

    window.selectAllMobileReportOps = (all) => {
        const ops = all ? [...allOpsInRun] : [];
        renderMobileDetailedReport(historyIndex, ops, filterDept);
    };

    window.changeMobileReportDept = (selectObj) => {
        renderMobileDetailedReport(historyIndex, filterOps, selectObj.value);
    };

    let html = `
            < div class="header-action no-print" style = "flex-wrap: wrap; gap: 15px;" >
                    <div style="display: flex; gap: 10px; align-items: center;">
                        <button class="btn btn-secondary" onclick="${isHistorical ? `window.viewHistoricalPayroll(${historyIndex})` : 'renderSection(\'reports\')'}">
                            <i class="fas fa-arrow-left"></i> Volver
                        </button>
                        <h1>Detalle Móvil</h1>
                    </div>
                    
                    <div style="display: flex; gap: 10px; align-items: center; flex-wrap: wrap;">
                        <div class="form-group no-print" style="min-width: 250px; margin-bottom: 0;">
                            <label style="font-size: 0.7rem; display: block; margin-bottom: 4px;">Filtrar Departamento:</label>
                            <select class="form-control" onchange="window.changeMobileReportDept(this)" style="margin: 0; padding: 5px 10px;">
                                <option value="all" ${filterDept === 'all' || !filterDept ? 'selected' : ''}>Todos los Departamentos</option>
                                ${state.departments.map(d => `<option value="${d.name}" ${filterDept === d.name ? 'selected' : ''}>${d.name}</option>`).join('')}
                            </select>
                        </div>
                        <div class="multi-select-container no-print" style="min-width: 250px;">
                            <label style="font-size: 0.7rem; display: block; margin-bottom: 4px;">Filtrar Operaciones:</label>
                            <div class="multi-select-btn" onclick="this.parentElement.classList.toggle('active')">
                                ${filterOps.length === allOpsInRun.length ? 'Todas las Operaciones' : (filterOps.length === 0 ? 'Ninguna Seleccionada' : `${filterOps.length} Operaciones Seleccionadas`)}
                            </div>
                            <div class="multi-select-content">
                                <div class="multi-select-actions">
                                    <span onclick="window.selectAllMobileReportOps(true)">Todas</span>
                                    <span onclick="window.selectAllMobileReportOps(false)">Ninguna</span>
                                </div>
                                ${allOpsInRun.map(op => `
                                    <div class="multi-select-item" onclick="event.stopPropagation();">
                                        <input type="checkbox" id="op-chk-${op}" ${filterOps.includes(op) ? 'checked' : ''} 
                                            onchange="window.toggleMobileReportOp('${op}')">
                                        <label for="op-chk-${op}" onclick="event.preventDefault(); window.toggleMobileReportOp('${op}')">${op}</label>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    </div>

                    <button class="btn btn-primary" onclick="window.print()">
                        <i class="fas fa-print"></i> Imprimir
                    </button>
                </div >
            <div class="card mt-4 print-area">
                <div style="text-align: center; margin-bottom: 20px;">
                    <h1 style="margin: 0; color: var(--primary);">RELACIÓN DIARIA DE LABORES MÓVILES</h1>
                    <p style="font-size: 1.2rem; font-weight: 600; margin: 5px 0;">${run.name || run.payrollName}</p>
                    <p class="text-gray">Periodo: ${bounds.min} al ${bounds.max}</p>
                </div>
                <hr class="mt-4 mb-4" style="border: 0.5px solid var(--border-color)">
                    `;

    let grandTotal = 0;
    const grandTotalByDate = {};
    dates.forEach(d => grandTotalByDate[d] = 0);

    Object.keys(grouped).sort().forEach(op => {
        let opTotal = 0;
        const opDailyTotals = {};
        dates.forEach(d => opDailyTotals[d] = 0);

        html += `
                    <div class="mb-5">
                        <h3 class="text-accent" style="border-bottom: 2px solid var(--accent-color); padding-bottom: 5px; margin-bottom: 15px;">Operación: ${op}</h3>
                        <table class="data-table" style="font-size: 0.85rem">
                            <thead>
                                <tr>
                                    <th>Empleado</th>
                                    <th>Actividad</th>
                                    ${dateHeaders.map(h => `<th class="text-center" style="width: 40px">${h.day}<br><small style="font-size: 0.6rem">${h.date.split('-')[2]}</small></th>`).join('')}
                                    <th class="text-right" style="font-weight: bold">Suma</th>
                                </tr>
                            </thead>
                            <tbody>
                                `;

        Object.keys(grouped[op]).sort().forEach(emp => {
            Object.keys(grouped[op][emp]).sort().forEach(act => {
                let rowTotal = 0;
                html += `<tr><td>${emp}</td><td>${act}</td>`;

                dates.forEach(d => {
                    const val = grouped[op][emp][act][d] || 0;
                    rowTotal += val;
                    opDailyTotals[d] += val;
                    grandTotalByDate[d] += val;
                    html += `<td class="text-center">${val > 0 ? val.toLocaleString('en-US', { minimumFractionDigits: 0 }) : '-'}</td>`;
                });

                opTotal += rowTotal;
                grandTotal += rowTotal;
                html += `<td class="text-right" style="font-weight: bold">$${rowTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td></tr>`;
            });
        });

        html += `
                            </tbody>
                            <tfoot style="background: rgba(var(--primary-rgb), 0.05); font-weight: bold; display: table-row-group;">
                                <tr>
                                    <td colspan="2" class="text-right">SUBTOTAL ${op} :</td>
                                    ${dates.map(d => `<td class="text-center">${opDailyTotals[d] > 0 ? opDailyTotals[d].toLocaleString('en-US', { minimumFractionDigits: 0 }) : '-'}</td>`).join('')}
                                    <td class="text-right">$${opTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                    `;
    });

    if (filterOps.length > 0 && Object.keys(grouped).length > 0) {
        html += `
                    <div class="summary-card mt-5" style="border: 2px solid var(--primary); padding: 20px; border-radius: 8px;">
                        <h3 style="text-align: center; border-bottom: 2px solid var(--primary); padding-bottom: 10px; margin-bottom: 20px;">RESUMEN DE OPERACIONES SELECCIONADAS</h3>
                        <table class="data-table">
                             <thead style="background: var(--primary); color: white;">
                                <tr>
                                    <th colspan="2" class="text-right">CONCEPTO</th>
                                    ${dateHeaders.map(h => `<th class="text-center">${h.day}</th>`).join('')}
                                    <th class="text-right">TOTAL</th>
                                </tr>
                             </thead>
                             <tbody>
                                <tr style="font-weight: bold; background: rgba(0,0,0,0.02);">
                                    <td colspan="2" class="text-right">TOTAL ACUMULADO :</td>
                                    ${dates.map(d => `<td class="text-center">${grandTotalByDate[d] > 0 ? grandTotalByDate[d].toLocaleString('en-US', { minimumFractionDigits: 0 }) : '-'}</td>`).join('')}
                                    <td class="text-right" style="font-size: 1.1rem; color: var(--primary);">$${grandTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                </tr>
                             </tbody>
                        </table>
                    </div>
                `;
    }

    if (Object.keys(grouped).length === 0) {
        html += `<p style="text-align: center; padding: 40px; color: var(--gray);">No hay registros para las operaciones seleccionadas.</p>`;
    }

    html += `</div>`;
    contentArea.innerHTML = html;
};
window.renderMobileDetailedReport = renderMobileDetailedReport;

const renderMobileEmployeeDeptReport = (historyIndex = null, filterDept = null, activePayrollId = null) => {
    const isHistorical = historyIndex !== null;
    let run = null;
    if (isHistorical) {
        run = state.payrollHistory[historyIndex];
    } else if (activePayrollId) {
        run = (state.activePayrolls || []).find(p => p.id == activePayrollId);
    } else {
        run = state.activePayroll || (state.activePayrolls && state.activePayrolls[0]);
    }

    if (!run) return;

    const logs = run.dailyLogs || [];

    // Manage global filter states for this specific report
    if (window.lastMobileEmpDeptHistoryIndex !== historyIndex) {
        window.currentMobileEmpDeptFilterDept = 'all';
        window.lastMobileEmpDeptHistoryIndex = historyIndex;
    }

    if (filterDept !== null) window.currentMobileEmpDeptFilterDept = filterDept;
    filterDept = window.currentMobileEmpDeptFilterDept;

    const bounds = isHistorical ? { min: run.periodStart, max: run.periodEnd } : getPayrollBounds();
    if (!bounds || !bounds.min || !bounds.max) {
        alert("No hay un periodo definido para esta nómina.");
        return;
    }

    // Generate date range
    const dates = [];
    let current = new Date(bounds.min + 'T00:00:00');
    const end = new Date(bounds.max + 'T00:00:00');
    while (current <= end) {
        dates.push(current.toISOString().split('T')[0]);
        current.setDate(current.getDate() + 1);
    }

    const dayNames = ['Do', 'Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sa'];
    const dateHeaders = dates.map(d => {
        const dateObj = new Date(d + 'T00:00:00');
        return { date: d, day: dayNames[dateObj.getDay()] };
    });

    // Group by Department -> Employee
    const grouped = {};
    logs.forEach(log => {
        const emp = state.employees.find(e => `${e.firstName} ${e.lastName}` === log.employee);
        const dept = emp ? (emp.department || 'Sin clasificar') : 'Sin clasificar';

        // Filter by Department Access
        if (emp && !window.hasDepartmentAccess(emp.department)) return;

        // Filter by selected Department
        if (filterDept && filterDept !== 'all' && dept !== filterDept) return;

        if (!grouped[dept]) grouped[dept] = {};
        if (!grouped[dept][log.employee]) grouped[dept][log.employee] = {};

        grouped[dept][log.employee][log.date] = (grouped[dept][log.employee][log.date] || 0) + parseFloat(log.amount);
    });

    const contentArea = document.getElementById('content-area');

    window.changeMobileEmpDeptReportDept = (selectObj) => {
        renderMobileEmployeeDeptReport(historyIndex, selectObj.value);
    };

    let html = `
                <div class="header-action no-print" style="flex-wrap: wrap; gap: 15px;">
                    <div style="display: flex; gap: 10px; align-items: center;">
                        <button class="btn btn-secondary" onclick="${isHistorical ? `window.viewHistoricalPayroll(${historyIndex})` : 'renderSection(\'reports\')'}">
                            <i class="fas fa-arrow-left"></i> Volver
                        </button>
                        <h1>Detalle por Depto/Empleado</h1>
                    </div>
                    
                    <div style="display: flex; gap: 10px; align-items: center; flex-wrap: wrap;">
                        <div class="form-group no-print" style="min-width: 250px; margin-bottom: 0;">
                            <label style="font-size: 0.7rem; display: block; margin-bottom: 4px;">Filtrar Departamento:</label>
                            <select class="form-control" onchange="window.changeMobileEmpDeptReportDept(this)" style="margin: 0; padding: 5px 10px;">
                                <option value="all" ${filterDept === 'all' || !filterDept ? 'selected' : ''}>Todos los Departamentos</option>
                                ${state.departments.map(d => `<option value="${d.name}" ${filterDept === d.name ? 'selected' : ''}>${d.name}</option>`).join('')}
                            </select>
                        </div>
                    </div>

                    <button class="btn btn-primary" onclick="window.print()">
                        <i class="fas fa-print"></i> Imprimir
                    </button>
                </div>
            <div class="card mt-4 print-area">
                <div style="text-align: center; margin-bottom: 20px;">
                    <h1 style="margin: 0; color: var(--primary);">RELACIÓN DIARIA POR DEPARTAMENTO Y EMPLEADO</h1>
                    <p style="font-size: 1.2rem; font-weight: 600; margin: 5px 0;">${run.name || run.payrollName}</p>
                    <p class="text-gray">Periodo: ${bounds.min} al ${bounds.max}</p>
                </div>
                <hr class="mt-4 mb-4" style="border: 0.5px solid var(--border-color)">
                    `;

    let grandTotal = 0;
    const grandTotalByDate = {};
    dates.forEach(d => grandTotalByDate[d] = 0);

    Object.keys(grouped).sort().forEach(dept => {
        let deptTotal = 0;
        const deptDailyTotals = {};
        dates.forEach(d => deptDailyTotals[d] = 0);

        html += `
                    <div class="mb-5">
                        <h3 class="text-accent" style="border-bottom: 2px solid var(--accent-color); padding-bottom: 5px; margin-bottom: 15px;">Departamento: ${dept}</h3>
                        <table class="data-table" style="font-size: 0.85rem">
                            <thead>
                                <tr>
                                    <th>Empleado</th>
                                    ${dateHeaders.map(h => `<th class="text-center" style="width: 40px">${h.day}<br><small style="font-size: 0.6rem">${h.date.split('-')[2]}</small></th>`).join('')}
                                    <th class="text-right" style="font-weight: bold">Suma</th>
                                </tr>
                            </thead>
                            <tbody>
                                `;

        Object.keys(grouped[dept]).sort().forEach(empName => {
            let rowTotal = 0;
            html += `<tr><td>${empName}</td>`;

            dates.forEach(d => {
                const val = grouped[dept][empName][d] || 0;
                rowTotal += val;
                deptDailyTotals[d] += val;
                grandTotalByDate[d] += val;
                html += `<td class="text-center">${val > 0 ? val.toLocaleString('en-US', { minimumFractionDigits: 0 }) : '-'}</td>`;
            });

            deptTotal += rowTotal;
            grandTotal += rowTotal;
            html += `<td class="text-right" style="font-weight: bold">$${rowTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td></tr>`;
        });

        html += `
                            </tbody>
                            <tfoot style="background: rgba(var(--primary-rgb), 0.05); font-weight: bold; display: table-row-group;">
                                <tr>
                                    <td class="text-right">SUBTOTAL ${dept} :</td>
                                    ${dates.map(d => `<td class="text-center">${deptDailyTotals[d] > 0 ? deptDailyTotals[d].toLocaleString('en-US', { minimumFractionDigits: 0 }) : '-'}</td>`).join('')}
                                    <td class="text-right">$${deptTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                    `;
    });

    if (Object.keys(grouped).length > 0) {
        html += `
                    <div class="summary-card mt-5" style="border: 2px solid var(--primary); padding: 20px; border-radius: 8px;">
                        <h3 style="text-align: center; border-bottom: 2px solid var(--primary); padding-bottom: 10px; margin-bottom: 20px;">RESUMEN GENERAL</h3>
                        <table class="data-table">
                             <thead style="background: var(--primary); color: white;">
                                <tr>
                                    <th class="text-right">CONCEPTO</th>
                                    ${dateHeaders.map(h => `<th class="text-center">${h.day}</th>`).join('')}
                                    <th class="text-right">TOTAL</th>
                                </tr>
                             </thead>
                             <tbody>
                                <tr style="font-weight: bold; background: rgba(0,0,0,0.02);">
                                    <td class="text-right">TOTAL ACUMULADO :</td>
                                    ${dates.map(d => `<td class="text-center">${grandTotalByDate[d] > 0 ? grandTotalByDate[d].toLocaleString('en-US', { minimumFractionDigits: 0 }) : '-'}</td>`).join('')}
                                    <td class="text-right" style="font-size: 1.1rem; color: var(--primary);">$${grandTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                </tr>
                             </tbody>
                        </table>
                    </div>
                `;
    }

    if (Object.keys(grouped).length === 0) {
        html += `<p style="text-align: center; padding: 40px; color: var(--gray);">No hay registros en este periodo.</p>`;
    }

    html += `</div>`;
    contentArea.innerHTML = html;
};
window.renderMobileEmployeeDeptReport = renderMobileEmployeeDeptReport;

// --- Utility: Payroll Calculation ---
const calculateEmployeePayrollData = (emp, activePayroll) => {
    const bounds = getPayrollBounds();
    const filterByPeriod = (item) => {
        if (!bounds || !item.date) return false;
        return item.date >= bounds.min && item.date <= bounds.max;
    };

    let base = 0;
    let tss = 0;
    const empFullName = `${emp.firstName || ''} ${emp.lastName || ''} `.trim().toLowerCase();

    if (emp.type === 'fixed') {
        const monthlySalary = parseFloat(emp.salary) || 0;

        // Robust frequency detection
        const pType = (activePayroll?.periodType || '').toLowerCase();
        const periodObj = state.periods.find(p => p.name.toLowerCase() === pType || pType.includes(p.name.toLowerCase()));
        const frequency = (periodObj ? periodObj.frequency : pType).toLowerCase();

        let divisor = 1;
        if (frequency.includes('bisemanal') || frequency.includes('quincenal')) divisor = 2;
        else if (frequency.includes('semanal')) divisor = 4;
        else if (frequency.includes('mensual')) divisor = 1;

        if (bounds && bounds.max && bounds.min) {
            const periodStart = new Date(bounds.min + 'T00:00:00');
            const periodEnd = new Date(bounds.max + 'T00:00:00');
            periodStart.setHours(0, 0, 0, 0);
            periodEnd.setHours(0, 0, 0, 0);

            const hireDate = emp.hireDate ? new Date(emp.hireDate + 'T00:00:00') : new Date('2000-01-01T00:00:00');
            hireDate.setHours(0, 0, 0, 0);

            let effectiveStart = periodStart;
            let isPartialNewHire = hireDate > periodStart;

            if (isPartialNewHire) {
                effectiveStart = hireDate > periodEnd ? null : hireDate;
            }

            if (!effectiveStart) {
                base = 0; // Contratado después del periodo
            } else {
                // Verificar si tiene alguna vacación "Tomada" activa en este periodo
                const vac = state.vacations.find(v => v.employeeId === emp.idNumber && v.type === 'Tomada');
                let vacStart = null;
                let vacEnd = null;

                if (vac && vac.outDate && vac.returnDate) {
                    vacStart = new Date(vac.outDate + 'T00:00:00');
                    vacEnd = new Date(vac.returnDate + 'T00:00:00');
                    vacStart.setHours(0, 0, 0, 0);
                    vacEnd.setHours(0, 0, 0, 0);
                }

                if (!vacStart || vacStart > periodEnd || vacEnd <= effectiveStart) {
                    // Sin vacaciones en este periodo o no chocan
                    if (isPartialNewHire) {
                        const dailyRate = monthlySalary / 23.83;
                        const workedDays = calculateLegislativeDays(effectiveStart, periodEnd);
                        base = dailyRate * workedDays;
                    } else {
                        base = monthlySalary / divisor; // Completo normal
                    }
                } else {
                    // Hay colisión con vacaciones, calcular día a día
                    let daysWorked = 0;
                    let current = new Date(effectiveStart.getTime());

                    while (current <= periodEnd) {
                        // Si "current" NO cae dentro del rango de vacaciones [vacStart, vacEnd)
                        if (current < vacStart || current >= vacEnd) {
                            const day = current.getDay();
                            if (day >= 1 && day <= 5) daysWorked += 1; // L-V
                            else if (day === 6) daysWorked += 0.5; // S
                        }
                        current.setDate(current.getDate() + 1);
                    }

                    const dailyRate = monthlySalary / 23.83;
                    base = dailyRate * daysWorked;
                }
            }
        } else {
            // Fallback to divisor logic if bounds missing
            base = monthlySalary / divisor;
        }
        tss = base * (state.settings.tss_rate || 0);
    } else {
        const logs = activePayroll?.dailyLogs || [];
        const empLogs = logs.filter(l => (l.employee || '').trim().toLowerCase() === empFullName);
        base = empLogs.reduce((acc, curr) => acc + (parseFloat(curr.amount) || 0), 0);
        const tssBase = empLogs.filter(l => l.applyTSS === 'si').reduce((acc, curr) => acc + (parseFloat(curr.amount) || 0), 0);
        tss = tssBase * (state.settings.tss_rate || 0);
    }

    const inc = (state.incentives || []).filter(i => (i.employeeName || '').trim().toLowerCase() === empFullName && filterByPeriod(i)).reduce((a, c) => a + (parseFloat(c.amount) || 0), 0);
    const ot = (state.overtime || []).filter(o => (o.employeeName || '').trim().toLowerCase() === empFullName && filterByPeriod(o)).reduce((a, c) => a + (parseFloat(c.amount) || 0), 0);

    // Automated Loan/Discount deduction
    const disc = (state.discounts || []).filter(d => (d.employeeName || '').trim().toLowerCase() === empFullName && parseFloat(d.remainingBalance) > 0)
        .reduce((acc, d) => {
            const installment = parseFloat(d.installment) || 0;
            const balance = parseFloat(d.remainingBalance) || 0;
            return acc + Math.min(installment, balance);
        }, 0);
    const chr = (state.christmasSalary || []).filter(c => (c.employeeName || '').trim().toLowerCase() === empFullName).reduce((a, c) => a + (parseFloat(c.amount) || 0), 0);

    const brute = base + inc + ot + chr;
    // ISR is calculated on the taxable income (Gross - TSS). 
    // Christmas salary (chr) is excluded as it is exempt by law in DR.
    const currentTaxableIncome = (base + inc + ot) - tss;

    // --- ISR Progressive Projection Logic ---
    let isr = 0;
    if (currentTaxableIncome > 0 && bounds && emp.applyISR !== false) {
        const currentMonth = bounds.min.substring(0, 7); // YYYY-MM
        let accumulatedTaxable = 0;
        let accumulatedISR = 0;
        let unitsSoFar = 1;

        (state.payrollHistory || []).forEach(run => {
            const runMonth = run.periodStart ? run.periodStart.substring(0, 7) : (run.closedAt ? run.closedAt.substring(0, 7) : '');
            if (runMonth === currentMonth) {
                const prevResult = run.results.find(r => (r.fullName || '').trim().toLowerCase() === empFullName || (r.idNumber && r.idNumber === emp.idNumber));
                if (prevResult) {
                    accumulatedTaxable += (prevResult.base || 0) + (prevResult.incentives || 0) + (prevResult.overtime || 0) - (prevResult.tss || 0);
                    accumulatedISR += (prevResult.isr || 0);
                    unitsSoFar++;
                }
            }
        });

        // Roburt frequency detection for projection
        const pType = (activePayroll?.periodType || '').toLowerCase();
        const periodObj = state.periods.find(p => p.name.toLowerCase() === pType || pType.includes(p.name.toLowerCase()));
        const frequency = (periodObj ? periodObj.frequency : pType).toLowerCase();
        let divisor = 1;
        if (frequency.includes('bisemanal') || frequency.includes('quincenal')) divisor = 2;
        else if (frequency.includes('semanal')) divisor = 4;
        else if (frequency.includes('mensual')) divisor = 1;

        // Projection logic: Project the accumulated + current average to a full month
        // This prevents the "spike" in the last week and taxes proportionally from week 1
        const totalIncomeSoFar = accumulatedTaxable + currentTaxableIncome;
        const projectedMonthlyTaxable = totalIncomeSoFar * (divisor / unitsSoFar);

        const totalMonthlyISR = calculateMonthlyISR(projectedMonthlyTaxable);
        const taxDueSoFar = totalMonthlyISR * (unitsSoFar / divisor);

        isr = Math.max(0, taxDueSoFar - accumulatedISR);
    } else {
        isr = (emp.applyISR !== false) ? calculateMonthlyISR(currentTaxableIncome) : 0;
    }

    const net = brute - tss - disc - isr;

    return { base, tss, inc, ot, disc, chr, brute, isr, net };
};

// --- Module: Reports ---
const renderReports = (container) => {
    if (window.reportOnlyWithPayment === undefined) window.reportOnlyWithPayment = false;

    if (!window.currentReportFilter || !Array.isArray(window.currentReportFilter)) {
        window.currentReportFilter = state.departments.map(d => d.name);
    }
    const filter = window.currentReportFilter;

    // Handle Payroll Selection
    if (window.currentReportPayrollId === undefined) {
        window.currentReportPayrollId = state.activePayrolls && state.activePayrolls.length > 0 ? state.activePayrolls[0].id : null;
    }
    let selectedPayroll = (state.activePayrolls || []).find(p => p.id == window.currentReportPayrollId);
    if (!selectedPayroll && state.activePayrolls && state.activePayrolls.length > 0) {
        selectedPayroll = state.activePayrolls[0];
        window.currentReportPayrollId = selectedPayroll.id;
    }

    container.innerHTML = `
            <div class="header-action">
            <div style="display: flex; align-items: center; gap: 20px; flex-wrap: wrap;">
                <h1>Reporte de Nómina</h1>
                <div class="no-print">
                    <select class="form-control" style="min-width: 200px; padding: 5px 10px;" onchange="window.currentReportPayrollId = this.value; renderSection('reports')">
                        ${(state.activePayrolls || []).map(p => `<option value="${p.id}" ${window.currentReportPayrollId == p.id ? 'selected' : ''}>${p.name} (${p.periodType})</option>`).join('')}
                    </select>
                </div>
                <div class="multi-select-container no-print" id="dept-multi-select">
                    <div class="multi-select-btn" onclick="this.parentElement.classList.toggle('active')">
                        ${filter.length === state.departments.length ? 'Todos los Departamentos' : (filter.length === 0 ? 'Ningún Departamento' : `${filter.length} Seleccionados`)}
                    </div>
                    <div class="multi-select-content">
                        <div class="multi-select-actions">
                            <span onclick="window.selectAllReportDepts(true)">Todos</span>
                            <span onclick="window.selectAllReportDepts(false)">Ninguno</span>
                        </div>
                        ${state.departments.map(d => `
                            <div class="multi-select-item" onclick="event.stopPropagation();">
                                <input type="checkbox" id="chk-${d.name}" ${filter.includes(d.name) ? 'checked' : ''} 
                                    onchange="window.toggleReportDept('${d.name}')">
                                <label for="chk-${d.name}" onclick="event.preventDefault(); window.toggleReportDept('${d.name}')">${d.name}</label>
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>
            <div class="no-print" style="margin-left: 20px; display: flex; align-items: center;">
                <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; font-size: 0.9rem;">
                    <input type="checkbox" id="chk-only-with-payment" ${window.reportOnlyWithPayment ? 'checked' : ''} 
                        onchange="window.reportOnlyWithPayment = this.checked; renderSection('reports')">
                    Solo con monto a cobrar
                </label>
            </div>
            <div style="display: flex; gap: 10px; flex-wrap: wrap;">
                <button class="btn btn-info" onclick="window.renderMobileDetailedReport(null, null, null, window.currentReportPayrollId)">
                    <i class="fas fa-list-alt"></i> Detalle Labores Móviles
                </button>
                <button class="btn btn-info" onclick="window.renderMobileEmployeeDeptReport(null, null, window.currentReportPayrollId)">
                    <i class="fas fa-users"></i> Detalle por Depto/Empleado
                </button>
                <button class="btn btn-secondary" onclick="window.print()">
                    <i class="fas fa-print"></i> Imprimir Reporte
                </button>
            </div>
        </div >
            <div class="card mt-4 print-area">
                <h2 style="text-align: center">Resumen de Pagos por Departamento</h2>
                ${(() => {
            const bounds = getPayrollBounds(window.currentReportPayrollId);
            if (bounds && selectedPayroll) {
                return `<p style="text-align: center; font-weight: 500; font-size: 1.1rem; color: var(--gray); margin-top: 5px; margin-bottom: 20px;">
                        Periodo: ${bounds.min} al ${bounds.max}
                    </p>`;
            }
            return '';
        })()}
                <hr class="mt-4 mb-4" style="border: 0.5px solid var(--border-color)">

                    ${(() => {
            let reportHtml = '';
            const renderedEmpIds = new Set();
            let totalGenBase = 0;
            let totalGenIncentives = 0;
            let totalGenOvertime = 0;
            let totalGenChristmas = 0;
            let totalGenBrute = 0;
            let totalGenTSS = 0;
            let totalGenISR = 0;
            let totalGenDiscounts = 0;
            let totalGenNet = 0;
            const deptSummaries = [];

            // 1. Render por Departamento
            const filteredDepts = state.departments.filter(d => filter.includes(d.name));

            filteredDepts.forEach(dept => {
                const deptName = (dept.name || '').trim().toLowerCase();
                const deptEmps = window.getVisibleEmployees().filter(e => {
                    const eDept = (e.department || '').trim().toLowerCase();
                    return eDept === deptName && e.active !== false;
                });

                if (deptEmps.length === 0) return;

                let deptBase = 0;
                let deptIncentives = 0;
                let deptOvertime = 0;
                let deptChristmas = 0;
                let deptBrute = 0;
                let deptTSS = 0;
                let deptISR = 0;
                let deptDiscounts = 0;
                let deptNet = 0;

                const rows = deptEmps.map(emp => {
                    const empId = emp.idNumber || `${emp.firstName}-${emp.lastName}`;
                    renderedEmpIds.add(empId);

                    const res = calculateEmployeePayrollData(emp, selectedPayroll);

                    if (window.reportOnlyWithPayment && res.net <= 0.005) return '';

                    deptBase += res.base; deptIncentives += res.inc; deptOvertime += res.ot; deptChristmas += res.chr;
                    deptBrute += res.brute; deptTSS += res.tss; deptISR += res.isr; deptDiscounts += res.disc; deptNet += res.net;

                    totalGenBase += res.base; totalGenIncentives += res.inc; totalGenOvertime += res.ot; totalGenChristmas += res.chr;
                    totalGenBrute += res.brute; totalGenTSS += res.tss; totalGenISR += res.isr; totalGenDiscounts += res.disc; totalGenNet += res.net;

                    return `
                        <tr>
                            <td>${emp.firstName} ${emp.lastName}</td>
                            <td>${emp.idNumber || '-'}</td>
                            <td>${emp.type === 'fixed' ? 'Fijo' : 'Móvil'}</td>
                            <td class="td-numeric">$${res.base.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                            <td class="td-numeric">$${res.inc.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                            <td class="td-numeric">$${res.ot.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                            <td class="td-numeric">$${res.chr.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                            <td class="td-numeric" style="font-weight: bold">$${res.brute.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                            <td class="td-numeric">$${res.tss.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                            <td class="td-numeric">$${res.isr.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                            <td class="td-numeric" style="color: var(--danger)">$${res.disc.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                            <td class="td-numeric" style="font-weight: bold; background: rgba(0,255,0,0.05)">$${res.net.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                        </tr>
                        `;
                }).join('');

                deptSummaries.push({
                    name: dept.name,
                    base: deptBase,
                    incentives: deptIncentives,
                    overtime: deptOvertime,
                    christmas: deptChristmas,
                    brute: deptBrute,
                    tss: deptTSS,
                    isr: deptISR,
                    discounts: deptDiscounts,
                    net: deptNet
                });

                reportHtml += `
                        <div class="dept-report-section mb-4">
                            <h3 class="text-accent">${dept.name}</h3>
                            <table class="data-table">
                                <thead>
                                    <tr>
                                        <th>Empleado</th>
                                        <th>Cédula</th>
                                        <th>Tipo</th>
                                        <th class="text-right">Sueldo Base</th>
                                        <th class="text-right">Incentivos</th>
                                        <th class="text-right">Extras</th>
                                        <th class="text-right">Navidad</th>
                                        <th class="text-right">Total Bruto</th>
                                        <th class="text-right">Ret. TSS</th>
                                        <th class="text-right">Ret. ISR</th>
                                        <th class="text-right">Desc.</th>
                                        <th class="text-right">Total a Pagar</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${rows}
                                </tbody>
                                 <tfoot style="display: table-row-group; font-weight: bold; border-top: 2px solid #ddd;">
                                    <tr>
                                        <td colspan="3" class="text-right">SUBTOTAL ${dept.name}:</td>
                                        <td class="td-numeric">$${deptBase.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                        <td class="td-numeric">$${deptIncentives.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                        <td class="td-numeric">$${deptOvertime.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                        <td class="td-numeric">$${deptChristmas.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                        <td class="td-numeric">$${deptBrute.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                        <td class="td-numeric">$${deptTSS.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                        <td class="td-numeric">$${deptISR.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                        <td class="td-numeric" style="color: var(--danger)">$${deptDiscounts.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                        <td class="td-numeric" style="background: var(--glass-bg)">$${deptNet.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    `;
            });


            // 3. Resumen por Departamento (Show if more than one dept is selected)
            if (deptSummaries.length > 0) {
                reportHtml += `
                        <div class="dept-report-section mb-4" style="page-break-before: auto;">
                            <h3 class="text-accent" style="text-align: center; border-bottom: 2px solid var(--accent-color); padding-bottom: 10px;">RESUMEN GENERAL POR DEPARTAMENTO</h3>
                            <table class="data-table">
                                <thead>
                                    <tr>
                                        <th>Departamento</th>
                                                <th class="text-right">Sueldo Base</th>
                                                <th class="text-right">Incentivos</th>
                                                <th class="text-right">Extras</th>
                                                <th class="text-right">Navidad</th>
                                                <th class="text-right">Total Bruto</th>
                                                <th class="text-right">TSS</th>
                                                <th class="text-right">ISR</th>
                                                <th class="text-right">Desc.</th>
                                                <th class="text-right">Total Neto</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${deptSummaries.map(s => `
                                        <tr>
                                            <td style="font-weight: bold">${s.name}</td>
                                                    <td class="td-numeric">$${s.base.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                                    <td class="td-numeric">$${s.incentives.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                                    <td class="td-numeric">$${s.overtime.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                                    <td class="td-numeric">$${s.christmas.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                                    <td class="td-numeric" style="font-weight: bold">$${s.brute.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                                    <td class="td-numeric">$${s.tss.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                                    <td class="td-numeric">$${s.isr.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                                    <td class="td-numeric" style="color: var(--danger)">$${s.discounts.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                                    <td class="td-numeric" style="font-weight: bold">$${s.net.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                                <tfoot style="display: table-row-group; font-weight: bold; border-top: 2px solid #333;">
                                    <tr>
                                                                             <td class="text-right">GRAN TOTAL:</td>
                                                <td class="td-numeric">$${totalGenBase.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                                <td class="td-numeric">$${totalGenIncentives.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                                <td class="td-numeric">$${totalGenOvertime.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                                <td class="td-numeric">$${totalGenChristmas.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                                <td class="td-numeric">$${totalGenBrute.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                                <td class="td-numeric">$${totalGenTSS.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                                <td class="td-numeric">$${totalGenISR.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                                <td class="td-numeric" style="color: var(--danger)">$${totalGenDiscounts.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                                <td class="td-numeric" style="font-weight: bold; font-size: 1.1rem">$${totalGenNet.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    `;
            }

            // 4. Totales Generales (Visual Card)
            reportHtml += `
                    <div class="card mt-4" style="background: var(--glass-bg); border: 2px solid var(--accent-color)">
                        <div class="stats-row">
                            <div class="stat-card">
                                <span class="stat-label">TOTAL BRUTO</span>
                                <span class="stat-value">$${totalGenBrute.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                            </div>
                            <div class="stat-card">
                                <span class="stat-label">RETENCIONES (TSS + ISR)</span>
                                <span class="stat-value" style="color: var(--danger)">$${(totalGenTSS + totalGenISR).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                            </div>
                            <div class="stat-card">
                                <span class="stat-label">TOTAL NETO A PAGAR</span>
                                <span class="stat-value" style="color: var(--success)">$${totalGenNet.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                            </div>
                        </div>
                    </div>
                `;

            return reportHtml;
        })()}

                    ${state.employees.length === 0 ? '<p style="text-align: center">No hay datos para mostrar en el reporte.</p>' : ''}
            </div>
        `;
};

window.toggleReportDept = (deptName) => {
    if (!Array.isArray(window.currentReportFilter)) window.currentReportFilter = [];
    const index = window.currentReportFilter.indexOf(deptName);
    if (index === -1) {
        window.currentReportFilter.push(deptName);
    } else {
        window.currentReportFilter.splice(index, 1);
    }
    renderSection('reports');
};

window.selectAllReportDepts = (select) => {
    if (select) {
        window.currentReportFilter = state.departments.map(d => d.name);
    } else {
        window.currentReportFilter = [];
    }
    renderSection('reports');
};

// --- Module: Employee Record (Historical Earnings) ---
const renderEmployeeRecord = (container) => {
    const history = state.payrollHistory || [];

    // Initialization of local state for the view
    if (!window.empRecordData) {
        window.empRecordData = {
            employeeName: '',
            startDate: new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0], // Jan 1st
            endDate: new Date().toISOString().split('T')[0]
        };
    }

    const data = window.empRecordData;

    // Filter results based on current selection
    let records = [];
    if (data.employeeName) {
        history.forEach(run => {
            const runDate = run.closedAt ? run.closedAt.split('T')[0] : (run.periodEnd || '');
            if (runDate >= data.startDate && runDate <= data.endDate) {
                const res = run.results.find(r => (r.fullName || '').trim().toLowerCase() === data.employeeName.trim().toLowerCase());
                if (res) {
                    records.push({
                        payrollName: run.payrollName || run.name,
                        date: runDate,
                        base: res.base || 0,
                        inc: res.inc || res.incentives || 0,
                        ot: res.ot || res.overtime || 0,
                        chr: res.chr || res.christmas || 0,
                        brute: res.brute || 0,
                        tss: res.tss || 0,
                        isr: res.isr || 0,
                        disc: res.disc || res.discounts || 0,
                        net: res.net || 0
                    });
                }
            }
        });
    }

    // Totals
    const totals = records.reduce((acc, r) => {
        acc.base += r.base; acc.inc += r.inc; acc.ot += r.ot;
        acc.chr += r.chr; acc.brute += r.brute; acc.tss += r.tss;
        acc.isr += r.isr; acc.disc += r.disc; acc.net += r.net;
        return acc;
    }, { base: 0, inc: 0, ot: 0, chr: 0, brute: 0, tss: 0, isr: 0, disc: 0, net: 0 });

    container.innerHTML = `
            < div class="header-action no-print" >
                    <h1>Récord de Ganancias por Empleado</h1>
                    <div style="display: flex; gap: 10px;">
                        <button class="btn btn-secondary" onclick="window.print()">
                            <i class="fas fa-print"></i> Imprimir Récord
                        </button>
                    </div>
                </div >

                <div class="card mt-4 no-print">
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; align-items: flex-end;">
                        <div class="form-group mb-0">
                            <label>Seleccionar Empleado</label>
                            <select id="rec-emp-select" class="form-control" onchange="window.updateEmpRecord('employeeName', this.value)">
                                <option value="">Seleccione un empleado...</option>
                                ${window.getVisibleEmployees().map(e => `<option value="${e.firstName} ${e.lastName}" ${data.employeeName === `${e.firstName} ${e.lastName}` ? 'selected' : ''}>${e.firstName} ${e.lastName}</option>`).join('')}
                            </select>
                        </div>
                        <div class="form-group mb-0">
                            <label>Desde</label>
                            <input type="date" class="form-control" value="${data.startDate}" onchange="window.updateEmpRecord('startDate', this.value)">
                        </div>
                        <div class="form-group mb-0">
                            <label>Hasta</label>
                            <input type="date" class="form-control" value="${data.endDate}" onchange="window.updateEmpRecord('endDate', this.value)">
                        </div>
                        <button class="btn btn-primary" style="height: 42px;" onclick="renderSection('employee-record')">
                            <i class="fas fa-search"></i> Generar Reporte
                        </button>
                    </div>
                </div>

                <div class="card mt-4 print-area">
                    <div class="record-print-header" style="text-align: center; margin-bottom: 25px;">
                        <h2 style="margin-bottom: 5px;">DETALLE DE GANANCIAS POR NÓMINA</h2>
                        <h3 style="color: var(--accent-color);">${data.employeeName || 'Seleccione un empleado'}</h3>
                        <p style="color: var(--gray);">Rango: ${data.startDate} al ${data.endDate}</p>
                    </div>

                    <table class="data-table">
                        <thead>
                            <tr>
                                <th>Nómina</th>
                                <th>Cierre</th>
                                <th class="text-right">Sueldo Base</th>
                                <th class="text-right">Incentivos</th>
                                <th class="text-right">Extras</th>
                                <th class="text-right">Navidad</th>
                                <th class="text-right">Total Bruto</th>
                                <th class="text-right">TSS</th>
                                <th class="text-right">ISR</th>
                                <th class="text-right">Descuentos</th>
                                <th class="text-right">Neto Pagado</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${records.length > 0 ? records.map(r => `
                                <tr>
                                    <td style="font-weight: 500;">${r.payrollName}</td>
                                    <td>${r.date}</td>
                                    <td class="td-numeric">$${r.base.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                    <td class="td-numeric">$${r.inc.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                    <td class="td-numeric">$${r.ot.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                    <td class="td-numeric">$${r.chr.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                    <td class="td-numeric" style="font-weight: 600;">$${r.brute.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                    <td class="td-numeric" style="color: var(--danger); font-size: 0.85rem;">$${r.tss.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                    <td class="td-numeric" style="color: var(--danger); font-size: 0.85rem;">$${r.isr.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                    <td class="td-numeric" style="color: var(--danger); font-size: 0.85rem;">$${r.disc.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                    <td class="td-numeric" style="font-weight: bold; background: rgba(0,255,0,0.03);">$${r.net.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                </tr>
                            `).join('') : `<tr><td colspan="11" style="text-align: center; padding: 40px; color: var(--gray);">No se encontraron registros en el rango seleccionado.</td></tr>`}
                        </tbody>
                        ${records.length > 0 ? `
                        <tfoot>
                            <tr style="font-weight: bold; background: var(--glass-bg); border-top: 2px solid var(--border-color);">
                                <td colspan="2">TOTALES ACUMULADOS</td>
                                <td class="td-numeric">$${totals.base.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                <td class="td-numeric">$${totals.inc.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                <td class="td-numeric">$${totals.ot.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                <td class="td-numeric">$${totals.chr.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                <td class="td-numeric">$${totals.brute.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                <td class="td-numeric">$${totals.tss.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                <td class="td-numeric">$${totals.isr.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                <td class="td-numeric">$${totals.disc.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                <td class="td-numeric" style="color: var(--success); font-size: 1.1rem;">$${totals.net.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                            </tr>
                        </tfoot>
                        ` : ''}
                    </table>
                </div>
        `;

    window.updateEmpRecord = (key, val) => {
        window.empRecordData[key] = val;
        if (key === 'employeeName') renderSection('employee-record');
    };
};

// --- Module: Payroll Entry (Journal Entry) ---
const renderPayrollEntry = (container) => {
    const getRunId = (run) => run.id || (run.closedAt ? new Date(run.closedAt).getTime() : null);

    const hasActive = state.activePayrolls && state.activePayrolls.length > 0;
    const hasHistory = state.payrollHistory && state.payrollHistory.length > 0;

    if (!hasActive && !hasHistory) {
        container.innerHTML = `
            <div class="header-action">
                <h1>Entrada de Nómina</h1>
                    </div >
            <div class="card mt-4">
                <div class="status-box warning">
                    <p>No hay nóminas activas ni históricas para visualizar.</p>
                </div>
            </div>
        `;
        return;
    }

    // State for selected payroll in this view
    if (window.selectedEntryRunId === undefined) {
        window.selectedEntryRunId = hasActive ? state.activePayrolls[0].id : getRunId(state.payrollHistory[0]);
    }

    const currentRunId = window.selectedEntryRunId;
    let isHistorical = false;

    // First try to find in active payrolls
    let run = hasActive ? state.activePayrolls.find(p => p.id == currentRunId) : null;

    if (!run) {
        run = (state.payrollHistory || []).find(h => getRunId(h) == currentRunId);
        if (run) isHistorical = true;
    }

    if (!run) {
        // Fallback to first active or first historical
        run = hasActive ? state.activePayrolls[0] : state.payrollHistory[0];
        window.selectedEntryRunId = getRunId(run);
        isHistorical = !hasActive || getRunId(run) != state.activePayrolls[0].id;
    }

    const debits = {}; // key: "Account|Activity", value: amount
    let totalCredits = {
        tss: 0,
        isr: 0,
        disc: 0,
        net: 0
    };

    // Aggregation Logic
    if (isHistorical && run.results) {
        // Historical Case: Use saved results for credits
        run.results.forEach(res => {
            const empCheck = state.employees.find(e => e.idNumber === res.idNumber);
            if (empCheck && !window.hasDepartmentAccess(empCheck.department)) return;
            totalCredits.tss += (res.tss || 0);
            totalCredits.isr += (res.isr || 0);
            totalCredits.disc += (res.disc || 0);
            totalCredits.net += (res.net || 0);

            if (res.type === 'fixed') {
                // Find employee to get operation/activity (since snapshot might only have names/ids)
                const emp = state.employees.find(e => e.idNumber === res.idNumber);
                const key = `${emp?.operation || 'Sin Cuenta'}| ${emp?.activity || '-'} `;
                debits[key] = (debits[key] || 0) + (res.base || 0);
            }
        });

        // For Historical Debits (Mobile and Global accounts)
        // Mobile: Only if dailyLogs were saved
        const logs = run.dailyLogs || [];
        logs.forEach(l => {
            const empCheck = state.employees.find(e => `${e.firstName} ${e.lastName}` === l.employee);
            if (empCheck && !window.hasDepartmentAccess(empCheck.department)) return;
            const key = `${l.op || 'Sin Cuenta'}| ${l.act || '-'} `;
            debits[key] = (debits[key] || 0) + (parseFloat(l.amount) || 0);
        });

        // Global accounts (Incentives/OT/Christmas) - usually stored in results
        run.results.forEach(res => {
            const empCheck = state.employees.find(e => e.idNumber === res.idNumber);
            if (empCheck && !window.hasDepartmentAccess(empCheck.department)) return;
            if (res.incentives > 0) {
                const incKey = `${state.settings.payrollAccounts?.incentives || 'Incentivos Pendiente'}| -`;
                debits[incKey] = (debits[incKey] || 0) + res.incentives;
            }
            if (res.overtime > 0) {
                const otKey = `${state.settings.payrollAccounts?.overtime || 'Horas Extras Pendiente'}| -`;
                debits[otKey] = (debits[otKey] || 0) + res.overtime;
            }
            if (res.christmas > 0) {
                const chrKey = `${state.settings.payrollAccounts?.christmas || 'Navidad Pendiente'}| -`;
                debits[chrKey] = (debits[chrKey] || 0) + res.christmas;
            }
        });

    } else {
        // Active Case or Fallback: Calculate fresh
        window.getVisibleEmployees().filter(e => e.active !== false).forEach(emp => {
            const data = calculateEmployeePayrollData(emp, run);
            const empFullName = `${emp.firstName} ${emp.lastName} `;

            totalCredits.tss += data.tss;
            totalCredits.isr += data.isr;
            totalCredits.disc += data.disc;
            totalCredits.net += data.net;

            if (emp.type === 'fixed') {
                const key = `${emp.operation || 'Sin Cuenta'}| ${emp.activity || '-'} `;
                debits[key] = (debits[key] || 0) + data.base;
            } else {
                const logs = (run.dailyLogs || []).filter(l => (l.employee || '').trim().toLowerCase() === empFullName.trim().toLowerCase());
                logs.forEach(l => {
                    const key = `${l.op || 'Sin Cuenta'}| ${l.act || '-'} `;
                    debits[key] = (debits[key] || 0) + (parseFloat(l.amount) || 0);
                });
            }

            if (data.inc > 0) {
                const incKey = `${state.settings.payrollAccounts?.incentives || 'Incentivos Pendiente'}| -`;
                debits[incKey] = (debits[incKey] || 0) + data.inc;
            }
            if (data.ot > 0) {
                const otKey = `${state.settings.payrollAccounts?.overtime || 'Horas Extras Pendiente'}| -`;
                debits[otKey] = (debits[otKey] || 0) + data.ot;
            }
            if (data.chr > 0) {
                const chrKey = `${state.settings.payrollAccounts?.christmas || 'Navidad Pendiente'}| -`;
                debits[chrKey] = (debits[chrKey] || 0) + data.chr;
            }
        });
    }

    const totalDebitAmount = Object.values(debits).reduce((a, b) => a + b, 0);
    const totalCreditAmount = totalCredits.tss + totalCredits.isr + totalCredits.disc + totalCredits.net;

    const getAccNum = (name) => {
        const op = state.operations.find(o => o.name === name);
        return op ? op.account : name;
    };

    const getActVal = (name) => {
        if (name === '-') return '-';
        const act = state.activities.find(a => a.name === name);
        return act ? act.value : name;
    };

    if (window.payrollEntryViewMode === undefined) {
        window.payrollEntryViewMode = 'summary';
    }
    const viewMode = window.payrollEntryViewMode;

    container.innerHTML = `
            <div class="header-action">
                    <div>
                        <h1>Entrada de Nómina</h1>
                        <div class="mt-2 no-print" style="display: flex; gap: 5px;">
                            <button class="btn ${viewMode === 'summary' ? 'btn-primary' : 'btn-secondary'} btn-sm" onclick="window.payrollEntryViewMode = 'summary'; renderSection('payroll-entry')">
                                <i class="fas fa-list"></i> Resumen (Diario)
                            </button>
                            <button class="btn ${viewMode === 'detail' ? 'btn-primary' : 'btn-secondary'} btn-sm" onclick="window.payrollEntryViewMode = 'detail'; renderSection('payroll-entry')">
                                <i class="fas fa-user-tag"></i> Detalle por Trabajador
                            </button>
                        </div>
                    </div>
                    <div style="display: flex; gap: 10px; align-items: flex-end;">
                        <div class="no-print">
                            <label style="display: block; font-size: 0.8rem; margin-bottom: 4px;">Seleccionar Nómina:</label>
                            <select class="form-control" style="width: 250px;" onchange="window.selectedEntryRunId = this.value; renderSection('payroll-entry')">
                                ${(state.activePayrolls || []).length > 0 ? `<optgroup label="Nóminas Abiertas">` : ''}
                                ${(state.activePayrolls || []).map(p => `<option value="${p.id}" ${currentRunId == p.id ? 'selected' : ''}>${p.name}</option>`).join('')}
                                ${(state.activePayrolls || []).length > 0 ? `</optgroup>` : ''}
                                
                                ${(state.payrollHistory || []).length > 0 ? `<optgroup label="Histórico">` : ''}
                                ${(state.payrollHistory || []).map(h => {
        const rid = getRunId(h);
        return `<option value="${rid}" ${currentRunId == rid ? 'selected' : ''}>${h.payrollName || h.name} (${h.periodStart})</option>`;
    }).join('')}
                            </select>
                        </div>
                        <button class="btn btn-secondary no-print" onclick="downloadPayrollEntryExcel()">
                            <i class="fas fa-file-excel"></i> Exportar Excel
                        </button>
                        <button class="btn btn-primary no-print" onclick="window.print()">
                            <i class="fas fa-print"></i> Imprimir
                        </button>
                    </div>
                </div >

            <div class="card mt-4 print-area" id="journal-entry-container">
                <div style="text-align: center; margin-bottom: 25px;">
                    <h2 style="margin: 0; color: var(--primary);">${viewMode === 'summary' ? 'ENTRADA DE DIARIO - NÓMINA' : 'CARGOS POR TRABAJADOR - NÓMINA'}</h2>
                    <p style="margin: 5px 0; font-weight: 600;">${run.name || run.payrollName}</p>
                    <p class="text-gray" style="font-size: 0.9rem;">Fecha de Proceso: ${new Date().toLocaleDateString()}</p>
                </div>

                ${viewMode === 'summary' ? `
                        <table class="journal-table" id="payroll-journal-table">
                            <thead>
                                <tr>
                                    <th class="description-col">DESCRIPCION</th>
                                    <th class="account-col">CUENTA CONTABLE</th>
                                    <th class="activity-col">ACTIVIDAD</th>
                                    <th class="amount-col">DEBITO</th>
                                    <th class="amount-col">CREDITO</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${Object.entries(debits).map(([key, amount]) => {
        const [accountName, activity] = key.split('|');
        return `
                                        <tr>
                                            <td>EXPENSE: ${accountName}</td>
                                            <td>${getAccNum(accountName)}</td>
                                            <td class="activity-col">${getActVal(activity)}</td>
                                            <td class="amount-col">$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                            <td class="amount-col"></td>
                                        </tr>
                                    `;
    }).join('')}

                                ${totalCredits.tss > 0 ? `
                                    <tr>
                                        <td>RETENCION TSS</td>
                                        <td>${getAccNum(state.settings.payrollAccounts?.tss) || 'Pendiente Config.'}</td>
                                        <td class="activity-col"></td>
                                        <td class="amount-col"></td>
                                        <td class="amount-col">$${totalCredits.tss.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                    </tr>
                                ` : ''}

                                ${totalCredits.isr > 0 ? `
                                    <tr>
                                        <td>RETENCION ISR</td>
                                        <td>${getAccNum(state.settings.payrollAccounts?.isr) || 'Pendiente Config.'}</td>
                                        <td class="activity-col"></td>
                                        <td class="amount-col"></td>
                                        <td class="amount-col">$${totalCredits.isr.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                    </tr>
                                ` : ''}

                                ${totalCredits.disc > 0 ? `
                                    <tr>
                                        <td>DESCUENTOS / CXC</td>
                                        <td>${getAccNum(state.settings.payrollAccounts?.discounts) || 'Pendiente Config.'}</td>
                                        <td class="activity-col"></td>
                                        <td class="amount-col"></td>
                                        <td class="amount-col">$${totalCredits.disc.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                    </tr>
                                ` : ''}

                                <tr>
                                    <td style="font-weight: bold;">NOMINA POR PAGAR</td>
                                    <td>${getAccNum(state.settings.payrollAccounts?.payable) || 'Pendiente Config.'}</td>
                                    <td class="activity-col"></td>
                                    <td class="amount-col"></td>
                                    <td class="amount-col" style="font-weight: bold;">$${totalCredits.net.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                </tr>
                            </tbody>
                            <tfoot>
                                <tr>
                                    <td colspan="3" style="text-align: right; padding-right: 20px;">CUADRE</td>
                                    <td class="amount-col" style="color: var(--success)">$${totalDebitAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                    <td class="amount-col" style="color: var(--success)">$${totalCreditAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                </tr>
                            </tfoot>
                        </table>
                    ` : `
                        <table class="data-table" id="payroll-journal-table">
                            <thead>
                                <tr>
                                    <th>EMPLEADO</th>
                                    <th>CUENTA CONTABLE</th>
                                    <th>ACTIVIDAD</th>
                                    <th class="text-right">MONTO CARGADO</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${(() => {
            const rows = [];
            if (isHistorical && run.results) {
                run.results.forEach(res => {
                    const emp = state.employees.find(e => e.idNumber === res.idNumber);
                    if (emp && !window.hasDepartmentAccess(emp.department)) return;
                    if (res.type === 'fixed') {
                        rows.push({
                            name: res.fullName,
                            acc: getAccNum(emp?.operation || 'Sin Cuenta'),
                            act: getActVal(emp?.activity || '-'),
                            amt: res.base
                        });
                    }
                });
                (run.dailyLogs || []).forEach(l => {
                    const empCheck = state.employees.find(e => `${e.firstName} ${e.lastName}` === l.employee);
                    if (empCheck && !window.hasDepartmentAccess(empCheck.department)) return;
                    rows.push({
                        name: l.employee,
                        acc: getAccNum(l.op),
                        act: getActVal(l.act),
                        amt: parseFloat(l.amount)
                    });
                });
                // Global amounts (distributed per employee who had them)
                run.results.forEach(res => {
                    const empCheck = state.employees.find(e => e.idNumber === res.idNumber);
                    if (empCheck && !window.hasDepartmentAccess(empCheck.department)) return;
                    if (res.incentives > 0) rows.push({ name: res.fullName, acc: getAccNum(state.settings.payrollAccounts?.incentives || 'Incentivos'), act: '-', amt: res.incentives });
                    if (res.overtime > 0) rows.push({ name: res.fullName, acc: getAccNum(state.settings.payrollAccounts?.overtime || 'Horas Extras'), act: '-', amt: res.overtime });
                    if (res.christmas > 0) rows.push({ name: res.fullName, acc: getAccNum(state.settings.payrollAccounts?.christmas || 'Navidad'), act: '-', amt: res.christmas });
                });
            } else {
                window.getVisibleEmployees().filter(e => e.active !== false).forEach(emp => {
                    const data = calculateEmployeePayrollData(emp, run);
                    const empFullName = `${emp.firstName} ${emp.lastName}`;
                    if (emp.type === 'fixed') {
                        rows.push({ name: empFullName, acc: getAccNum(emp.operation || 'Sin Cuenta'), act: getActVal(emp.activity || '-'), amt: data.base });
                    } else {
                        const logs = (run.dailyLogs || []).filter(l => (l.employee || '').trim().toLowerCase() === empFullName.trim().toLowerCase());
                        logs.forEach(l => {
                            rows.push({ name: l.employee, acc: getAccNum(l.op), act: getActVal(l.act), amt: parseFloat(l.amount) });
                        });
                    }
                    if (data.inc > 0) rows.push({ name: empFullName, acc: getAccNum(state.settings.payrollAccounts?.incentives || 'Incentivos'), act: '-', amt: data.inc });
                    if (data.ot > 0) rows.push({ name: empFullName, acc: getAccNum(state.settings.payrollAccounts?.overtime || 'Horas Extras'), act: '-', amt: data.ot });
                    if (data.chr > 0) rows.push({ name: empFullName, acc: getAccNum(state.settings.payrollAccounts?.christmas || 'Navidad'), act: '-', amt: data.chr });
                });
            }
            return rows.sort((a, b) => a.name.localeCompare(b.name)).map(r => `
                                        <tr>
                                            <td>${r.name}</td>
                                            <td>${r.acc}</td>
                                            <td>${r.act}</td>
                                            <td class="td-numeric">$${r.amt.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                        </tr>
                                    `).join('');
        })()}
                            </tbody>
                            <tfoot>
                                <tr style="font-weight: bold;">
                                    <td colspan="3" class="text-right">TOTAL CARGOS:</td>
                                    <td class="td-numeric">$${totalDebitAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                </tr>
                            </tfoot>
                        </table>
                    `}

                <div style="margin-top: 50px; display: grid; grid-template-columns: repeat(3, 1fr); gap: 30px; text-align: center;">
                    <div style="border-top: 1px solid #777; padding-top: 10px;">Hecho Por</div>
                    <div style="border-top: 1px solid #777; padding-top: 10px;">Revisado Por</div>
                    <div style="border-top: 1px solid #777; padding-top: 10px;">Autorizado Por</div>
                </div>
            </div>
        `;
};

window.downloadPayrollEntryExcel = () => {
    const table = document.getElementById('payroll-journal-table');
    if (!table) return;
    const runId = window.selectedEntryRunId;
    let runName = 'Nomina';
    if (state.activePayroll && state.activePayroll.id === runId) runName = state.activePayroll.name;
    else {
        const h = (state.payrollHistory || []).find(x => x.id === runId);
        if (h) runName = h.name;
    }
    const filename = `Entrada_Diario_${runName.replace(/\s+/g, '_')}.xls`;

    let html = table.outerHTML;
    const uri = 'data:application/vnd.ms-excel;base64,';
    const template = '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40"><head><!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet><x:Name>{worksheet}</x:Name><x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions></x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]--></head><body><table>{table}</table></body></html>';
    const base64 = (s) => window.btoa(unescape(encodeURIComponent(s)));
    const format = (s, c) => s.replace(/{(\w+)}/g, (m, p) => c[p]);
    const ctx = { worksheet: 'Entrada de Diario', table: html };
    const link = document.createElement("a");
    link.download = filename;
    link.href = uri + base64(format(template, ctx));
    link.click();
};

document.addEventListener('click', (e) => {
    const container = document.getElementById('dept-multi-select');
    if (container && !container.contains(e.target)) {
        container.classList.remove('active');
    }
});

// --- Module: Christmas Salary ---
const renderChristmasSalary = (container) => {
    const currentYear = new Date().getFullYear();

    // Calculate data for each employee
    const christmasData = window.getVisibleEmployees().filter(e => e.active !== false).map(emp => {
        try {
            const empId = emp.idNumber;
            const empName = `${emp.firstName} ${emp.lastName} `;

            // Find the latest payment to determine the start date
            const lastPayments = (state.christmasSalary || []).filter(p => p.employeeName === empName && p.periodEnd);
            let startDate = `${currentYear}-01-01`;
            if (lastPayments.length > 0) {
                lastPayments.sort((a, b) => (b.periodEnd || '').localeCompare(a.periodEnd || ''));
                const latest = lastPayments[0];
                const lastDate = new Date(latest.periodEnd);
                lastDate.setDate(lastDate.getDate() + 1);
                startDate = lastDate.toISOString().split('T')[0];
            } else if (emp.hireDate && emp.hireDate > startDate) {
                startDate = emp.hireDate;
            }

            const endDate = new Date().toISOString().split('T')[0];

            // Sum earnings from history within this specific range
            let accumulated = 0;
            let payrollsCounted = 0;
            let detailList = [];

            state.payrollHistory.forEach(run => {
                // Correct logic: Include if the payroll cycle ENDED within the range
                if (run.periodEnd && run.periodEnd >= startDate && run.periodEnd <= endDate) {
                    const res = run.results.find(r => (r.idNumber || r.employeeId) == empId);
                    if (res) {
                        const amount = (parseFloat(res.base) || 0) + (parseFloat(res.incentives) || 0) + (parseFloat(res.overtime) || 0);
                        accumulated += amount;
                        payrollsCounted++;
                        detailList.push(`${run.payrollName} (${run.periodEnd}): $${amount.toFixed(2)} `);
                    }
                }
            });

            const calculated = accumulated / 12;

            return {
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

    container.innerHTML = `
            <div class="header-action">
            <h1>Salario de Navidad (Regalía Pascual)</h1>
            <div class="action-group" style="gap: 10px">
                <select id="chr-payment-mode" class="form-control" style="width: 250px">
                    <option value="current">Agregar a Nómina Abierta</option>
                    <option value="new">Crear Nómina Especial Solo Regalía</option>
                </select>
                <button class="btn btn-primary" id="process-christmas-btn">
                    <i class="fas fa-check-circle"></i> Procesar Pagos Seleccionados
                </button>
            </div>
        </div >
        
        <div class="card mt-4">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                <h3>Calculadora de Regalía</h3>
                <p class="text-gray" style="font-size: 0.9rem;">Periodo: 12va parte de lo ganado entre el último pago y hoy.</p>
            </div>
            <table class="data-table">
                <thead>
                    <tr>
                        <th style="width: 40px"><input type="checkbox" id="select-all-chr"></th>
                        <th>Empleado</th>
                        <th>Rango de Cálculo</th>
                        <th style="text-align: right">Historicos</th>
                        <th style="text-align: right">Acumulado</th>
                        <th style="text-align: right">Calculado (1/12)</th>
                        <th>¿OK?</th>
                        <th style="text-align: right">Monto Pagar</th>
                    </tr>
                </thead>
                <tbody>
                    ${christmasData.map((d, i) => `
                        <tr>
                            <td><input type="checkbox" class="chr-select" data-index="${i}"></td>
                            <td>
                                <strong>${d.name}</strong><br>
                                <small class="text-gray" title="${d.detailList.join('\\n')}">${d.payrollsCounted} nóminas incluidas</small>
                            </td>
                            <td>
                                <div style="display: flex; flex-direction: column; gap: 2px;">
                                    <small>Desde: <strong>${d.startDate}</strong></small>
                                    <small>Hasta: <strong>${d.endDate}</strong></small>
                                </div>
                            </td>
                            <td style="text-align: right">
                                <button class="btn-icon" onclick="alert('Detalle de nóminas:\\n\\n${d.detailList.join('\\n') || 'Ninguna nómina encontrada en este rango'}')" title="Ver detalle">
                                    <i class="fas fa-search-plus"></i>
                                </button>
                            </td>
                            <td style="text-align: right">$${d.accumulated.toFixed(2)}</td>
                            <td style="text-align: right; font-weight: bold; color: var(--primary);">$${d.calculated.toFixed(2)}</td>
                            <td>
                                <select class="form-control chr-agreement" data-index="${i}" style="width: 65px; padding: 2px 5px; height: 30px;">
                                    <option value="si">SÍ</option>
                                    <option value="no">NO</option>
                                </select>
                            </td>
                            <td style="text-align: right">
                                <input type="number" class="form-control chr-manual-amount" data-index="${i}" 
                                       value="${d.manualAmount}" style="width: 100px; text-align: right; height: 30px;" disabled>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>

        <div class="card mt-4">
            <h3>Historial de Pagos de Regalía</h3>
            <table class="data-table">
                <thead>
                    <tr>
                        <th>Fecha Pago</th>
                        <th>Empleado</th>
                        <th>Periodo Cubierto</th>
                        <th style="text-align: right">Monto</th>
                        <th style="width: 50px"></th>
                    </tr>
                </thead>
                <tbody>
                    ${(state.christmasSalary || []).slice().reverse().map((p, idx, arr) => `
                        <tr>
                            <td>${p.date}</td>
                            <td>${p.employeeName}</td>
                            <td><small>${p.periodStart} al ${p.periodEnd}</small></td>
                            <td style="text-align: right; font-weight: bold">$${parseFloat(p.amount).toFixed(2)}</td>
                            <td>
                                <button class="btn-icon delete admin-only" onclick="deleteChristmasPayment(${arr.length - 1 - idx})" title="Eliminar registro">
                                    <i class="fas fa-trash"></i>
                                </button>
                            </td>
                        </tr>
                    `).join('')}
                    ${(!state.christmasSalary || state.christmasSalary.length === 0) ? '<tr><td colspan="5" style="text-align:center">No hay pagos registrados</td></tr>' : ''}
                </tbody>
            </table>
        </div>
        `;

    // Agreement logic
    container.querySelectorAll('.chr-agreement').forEach(select => {
        select.onchange = (e) => {
            const idx = e.target.dataset.index;
            const input = container.querySelector(`.chr - manual - amount[data - index="${idx}"]`);
            input.disabled = (e.target.value === 'si');
            if (e.target.value === 'si') input.value = christmasData[idx].calculated.toFixed(2);
        };
    });

    document.getElementById('select-all-chr').onclick = (e) => {
        container.querySelectorAll('.chr-select').forEach(c => c.checked = e.target.checked);
    };

    document.getElementById('process-christmas-btn').onclick = () => {
        const selected = Array.from(container.querySelectorAll('.chr-select:checked')).map(c => parseInt(c.dataset.index));
        if (selected.length === 0) return alert('Seleccione empleados.');

        const mode = document.getElementById('chr-payment-mode').value;
        if (mode === 'current' && !state.activePayroll) return alert('Abra una nómina primero.');

        if (!confirm(`¿Procesar pagos para ${selected.length} empleados ? `)) return;

        const payments = selected.map(idx => {
            const data = christmasData[idx];
            const amt = parseFloat(container.querySelector(`.chr - manual - amount[data - index="${idx}"]`).value);
            return {
                employeeName: data.name,
                amount: amt,
                date: new Date().toISOString().split('T')[0],
                periodStart: data.startDate,
                periodEnd: data.endDate,
                reason: `Regalía Pascual`
            };
        });

        if (mode === 'current') {
            state.christmasSalary.push(...payments);
        } else {
            const newPayroll = {
                id: Date.now(),
                name: `REGALÍA PASCUAL ${new Date().getFullYear()} `,
                periodType: 'Especial (Navidad)',
                startDate: payments[0].periodStart,
                endDate: payments[0].periodEnd,
                status: 'open',
                dailyLogs: [],
                isChristmasOnly: true,
            };
            state.activePayroll = newPayroll;
            state.christmasSalary.push(...payments);
        }
        saveState();
        alert('Procesado correctamente.');
        renderSection('christmas-salary');
    };
};

window.deleteChristmasPayment = (index) => {
    if (!confirm('¿Seguro que desea eliminar este registro de pago? El cálculo volverá a incluir este periodo.')) return;
    state.christmasSalary.splice(index, 1);
    saveState();
    renderSection('christmas-salary');
};

window.quickAddChristmasSalary = (empName) => {
    switchSection('christmas-salary');
};

// --- Utilities ---
const showModal = (title, bodyHtml, onConfirm) => {
    const modal = document.getElementById('modal-container');
    document.getElementById('modal-title').innerText = title;
    document.getElementById('modal-body').innerHTML = bodyHtml;

    document.getElementById('modal-confirm-btn').onclick = onConfirm;
    document.getElementById('modal-cancel-btn').onclick = hideModal;
    document.querySelector('.close-modal').onclick = hideModal;

    modal.classList.remove('hidden');
};

const hideModal = () => {
    document.getElementById('modal-container').classList.add('hidden');
};

window.editDailyLog = (index) => {
    const activePayroll = state.activePayrolls.find(p => p.id == window.selectedDailyPayrollId) || state.activePayrolls[0];
    const log = activePayroll.dailyLogs[index];
    const bounds = getPayrollBounds(activePayroll.id);
    showModal('Editar Registro Diario', `
            < div class="form-row" >
                    <div class="form-group">
                        <label>Fecha</label>
                        <input type="date" id="edit-reg-date" class="form-control" value="${log.date}"
                               ${bounds ? `min="${bounds.min}" max="${bounds.max}"` : ''}>
                    </div>
                    <div class="form-group">
                        <label>Empleado</label>
                        <select id="edit-reg-emp" class="form-control">
                            ${window.getVisibleEmployees().filter(e => e.type === 'mobile').map(e => `<option value="${e.firstName} ${e.lastName}" ${log.employee === (e.firstName + ' ' + e.lastName) ? 'selected' : ''}>${e.firstName} ${e.lastName}</option>`).join('')}
                        </select>
                    </div>
                </div >
                <div class="form-row">
                    <div class="form-group">
                        <label>Operación</label>
                        <select id="edit-reg-op" class="form-control">
                            ${state.operations.filter(o => o.useInLabor === undefined || o.useInLabor).map(o => `<option value="${o.name}" ${log.op === o.name ? 'selected' : ''}>${o.name}</option>`).join('')}
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Actividad</label>
                        <select id="edit-reg-act" class="form-control">
                            ${state.activities.map(a => `<option value="${a.name}" ${log.act === a.name ? 'selected' : ''}>${a.name}</option>`).join('')}
                        </select>
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label>Monto Real del Día ($)</label>
                        <input type="number" id="edit-reg-amount" class="form-control" value="${log.amount}">
                    </div>
                    <div class="form-group">
                        <label>¿Aplicar Descuento TSS?</label>
                        <select id="edit-reg-tss" class="form-control">
                            <option value="si" ${log.applyTSS === 'si' ? 'selected' : ''}>Sí — Descontar TSS</option>
                            <option value="no" ${log.applyTSS === 'no' ? 'selected' : ''}>No — Sin descuento TSS</option>
                        </select>
                    </div>
                </div>
        `, () => {
        const updatedLog = {
            date: document.getElementById('edit-reg-date').value,
            employee: document.getElementById('edit-reg-emp').value,
            op: document.getElementById('edit-reg-op').value,
            act: document.getElementById('edit-reg-act').value,
            amount: document.getElementById('edit-reg-amount').value,
            applyTSS: document.getElementById('edit-reg-tss').value
        };

        if (updatedLog.employee && updatedLog.amount) {
            activePayroll.dailyLogs[index] = { ...log, ...updatedLog };
            saveState();
            renderSection('daily-registration');
            hideModal();
            alert('Registro actualizado');
        }
    });
};

window.deleteDailyLog = (index) => {
    if (confirm('¿Seguro que desea eliminar este registro diario?')) {
        const activePayroll = state.activePayrolls.find(p => p.id == window.selectedDailyPayrollId) || state.activePayrolls[0];
        activePayroll.dailyLogs.splice(index, 1);
        saveState();
        renderSection('daily-registration');
    }
};

window.editEmployee = (index) => {
    const emp = state.employees[index];
    showModal('Editar Empleado', `
                <div class="form-row">
                    <div class="form-group">
                        <label>Nº de Registro</label>
                        <input type="number" id="edit-emp-reg" class="form-control" value="${emp.regNumber || ''}">
                    </div>
                    <div class="form-group">
                        <label>Género</label>
                        <select id="edit-emp-gender" class="form-control">
                            <option value="">Seleccionar...</option>
                            <option value="M" ${emp.gender === 'M' ? 'selected' : ''}>Masculino</option>
                            <option value="F" ${emp.gender === 'F' ? 'selected' : ''}>Femenino</option>
                        </select>
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label>Nombres</label>
                        <input type="text" id="edit-emp-fn" class="form-control" value="${emp.firstName}">
                    </div>
                    <div class="form-group">
                        <label>Apellidos</label>
                        <input type="text" id="edit-emp-ln" class="form-control" value="${emp.lastName}">
                    </div>
                </div >
                <div class="form-row">
                    <div class="form-group">
                        <label>Cédula o Pasaporte</label>
                        <input type="text" id="edit-emp-id" class="form-control" value="${emp.idNumber}">
                    </div>
                    <div class="form-group">
                        <label>Tipo de Empleado</label>
                        <select id="edit-emp-type" class="form-control">
                            <option value="fixed" ${emp.type === 'fixed' ? 'selected' : ''}>Fijo</option>
                            <option value="mobile" ${emp.type === 'mobile' ? 'selected' : ''}>Móvil</option>
                        </select>
                    </div>
                </div>
                <div class="form-group">
                    <label>Salario a Ganar</label>
                    <input type="number" id="edit-emp-salary" class="form-control" value="${emp.salary}" ${emp.type === 'mobile' ? 'disabled' : ''}>
                </div>
                <div class="form-group">
                    <label>Dirección</label>
                    <input type="text" id="edit-emp-address" class="form-control" value="${emp.address || ''}">
                </div>
                <div class="form-group">
                    <label>Fecha de Ingreso</label>
                    <input type="date" id="edit-emp-hire-date" class="form-control" value="${emp.hireDate || ''}">
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label>Departamento</label>
                        <select id="edit-emp-dept" class="form-control">
                            <option value="">Seleccionar...</option>
                            ${state.departments.map(d => `<option value="${d.name}" ${emp.department === d.name ? 'selected' : ''}>${d.name}</option>`).join('')}
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Operación Defecto</label>
                        <select id="edit-emp-op" class="form-control">
                            <option value="">Seleccionar...</option>
                            ${state.operations.filter(o => o.useInLabor === undefined || o.useInLabor).map(o => `<option value="${o.name}" ${emp.operation === o.name ? 'selected' : ''}>${o.name}</option>`).join('')}
                        </select>
                    </div>
                </div>
                <div class="form-group">
                    <label>Actividad Defecto</label>
                    <select id="edit-emp-act" class="form-control">
                        <option value="">Seleccionar...</option>
                        ${state.activities.map(a => `<option value="${a.name}" ${emp.activity === a.name ? 'selected' : ''}>${a.name}</option>`).join('')}
                    </select>
                </div>
                <div class="form-group">
                    <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                        <input type="checkbox" id="edit-emp-active" ${emp.active !== false ? 'checked' : ''}> Empleado Activo (Aparece en Nómina)
                    </label>
                </div>
                <div class="form-group">
                    <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                        <input type="checkbox" id="edit-emp-isr" ${emp.applyISR !== false ? 'checked' : ''}> Aplicar Retención de ISR (Impuesto Sobre la Renta)
                    </label>
                </div>
        `, () => {
        const updatedEmp = {
            regNumber: document.getElementById('edit-emp-reg').value,
            gender: document.getElementById('edit-emp-gender').value,
            firstName: document.getElementById('edit-emp-fn').value,
            lastName: document.getElementById('edit-emp-ln').value,
            idNumber: document.getElementById('edit-emp-id').value,
            type: document.getElementById('edit-emp-type').value,
            salary: document.getElementById('edit-emp-salary').value,
            address: document.getElementById('edit-emp-address').value,
            hireDate: document.getElementById('edit-emp-hire-date').value,
            department: document.getElementById('edit-emp-dept').value,
            operation: document.getElementById('edit-emp-op').value,
            activity: document.getElementById('edit-emp-act').value,
            active: document.getElementById('edit-emp-active').checked,
            applyISR: document.getElementById('edit-emp-isr').checked
        };

        if (updatedEmp.firstName && updatedEmp.idNumber) {
            state.employees[index] = { ...emp, ...updatedEmp };
            saveState();
            renderSection('employees');
            hideModal();
        }
    });

    const typeSelect = document.getElementById('edit-emp-type');
    const salaryInput = document.getElementById('edit-emp-salary');
    typeSelect.onchange = () => {
        salaryInput.disabled = (typeSelect.value === 'mobile');
        if (salaryInput.disabled) salaryInput.value = '';
    };
};

window.toggleEmployeeStatus = (index) => {
    const emp = state.employees[index];
    emp.active = (emp.active === false) ? true : false;
    saveState();
    renderSection('employees');
};

window.editOperation = (index) => {
    const op = state.operations[index];
    showModal('Editar Operación', `
            < div class="form-group" >
                    <label>Nombre de la Operación</label>
                    <input type="text" id="edit-op-name" class="form-control" value="${op.name}">
                </div>
                <div class="form-group">
                    <label>Número de Cuenta Contable</label>
                    <input type="text" id="edit-op-account" class="form-control" value="${op.account}">
                </div>
                <div class="form-group">
                    <label>Propósitos de la Operación:</label>
                    <div style="display: flex; flex-direction: column; gap: 8px; margin-top: 5px;">
                        <label style="display: flex; align-items: center; gap: 8px; font-weight: normal; cursor: pointer;">
                            <input type="checkbox" id="edit-op-use-acc" ${(op.useInAccounting === undefined || op.useInAccounting) ? 'checked' : ''}> Utilizar en contabilidad
                        </label>
                        <label style="display: flex; align-items: center; gap: 8px; font-weight: normal; cursor: pointer;">
                            <input type="checkbox" id="edit-op-use-labor" ${(op.useInLabor === undefined || op.useInLabor) ? 'checked' : ''}> Utilizar en empleados fijos y móviles
                        </label>
                    </div>
                </div>
        `, () => {
        const name = document.getElementById('edit-op-name').value;
        const account = document.getElementById('edit-op-account').value;
        const useInAccounting = document.getElementById('edit-op-use-acc').checked;
        const useInLabor = document.getElementById('edit-op-use-labor').checked;
        if (name && account) {
            state.operations[index] = { ...op, name, account, useInAccounting, useInLabor };
            saveState();
            renderSection('operations');
            hideModal();
        }
    });
};

window.editActivity = (index) => {
    const act = state.activities[index];
    showModal('Editar Actividad', `
            < div class="form-group" >
                    <label>Nombre de la Actividad</label>
                    <input type="text" id="edit-act-name" class="form-control" value="${act.name}">
                </div>
                <div class="form-group">
                    <label>Valor / Número (Otro objetivo)</label>
                    <input type="number" id="edit-act-value" class="form-control" value="${act.value || 0}">
                </div>
                <div class="form-group">
                    <label>Salario Diario (Para Registro Diario)</label>
                    <input type="number" id="edit-act-daily-salary" class="form-control" value="${act.dailySalary || 0}">
                </div>
        `, () => {
        const name = document.getElementById('edit-act-name').value;
        const value = document.getElementById('edit-act-value').value;
        const dailySalary = document.getElementById('edit-act-daily-salary').value;
        if (name) {
            state.activities[index] = { ...act, name, value: parseFloat(value) || 0, dailySalary: parseFloat(dailySalary) || 0 };
            saveState();
            renderSection('activities');
            hideModal();
        }
    });
};

window.deleteItem = (key, index) => {
    if (confirm('¿Seguro que desea eliminar este registro?')) {
        state[key].splice(index, 1);
        saveState();
        renderSection(key);
    }
};

// --- Quick Action Helpers ---
window.quickAddIncentive = (employeeName) => {
    showModal('Aplicar Incentivo', `
            < div class="form-group" >
                <label>Fecha</label>
                <input type="date" id="inc-date" class="form-control" value="${new Date().toISOString().split('T')[0]}">
            </div>
            <div class="form-group">
                <label>Empleado</label>
                <input type="text" id="inc-emp" class="form-control" value="${employeeName}" readonly>
            </div>
            <div class="form-group">
                <label>Monto</label>
                <input type="number" id="inc-amount" class="form-control" placeholder="0.00">
            </div>
            <div class="form-group">
                <label>Motivo</label>
                <input type="text" id="inc-reason" class="form-control" placeholder="Ej: Bono por meta">
            </div>
        `, () => {
        const inc = {
            id: Date.now().toString(36) + Math.random().toString(36).substring(2),
            date: document.getElementById('inc-date').value,
            employeeName: document.getElementById('inc-emp').value,
            amount: document.getElementById('inc-amount').value,
            reason: document.getElementById('inc-reason').value,
            operation: state.settings.payrollAccounts?.incentives || ''
        };
        if (inc.employeeName && inc.amount && inc.date) {
            const bounds = getPayrollBounds();
            if (bounds && (inc.date < bounds.min || inc.date > bounds.max)) {
                alert(`La fecha debe estar dentro del rango de la nómina(${bounds.min} a ${bounds.max})`);
                return;
            }

            if (!state.incentives) state.incentives = [];
            state.incentives.push(inc);
            saveState();
            renderSection('employees');
            hideModal();
            alert('Incentivo registrado');
        }
    });
};

window.quickAddOvertime = (employeeName) => {
    const employee = state.employees.find(e => `${e.firstName} ${e.lastName} ` === employeeName);
    if (!employee || employee.type !== 'fixed') {
        alert('Solo empleados fijos aplican para horas extras automáticas.');
        return;
    }

    showModal('Registrar Horas Extras', `
            < div class="form-group" >
                <label>Fecha</label>
                <input type="date" id="ot-date" class="form-control" value="${new Date().toISOString().split('T')[0]}">
            </div>
            <div class="form-group">
                <label>Empleado</label>
                <input type="text" id="ot-emp" class="form-control" value="${employeeName}" readonly data-salary="${employee.salary}">
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label>Horas</label>
                    <input type="number" id="ot-hours" class="form-control" placeholder="0">
                </div>
                <div class="form-group">
                    <label>Factor</label>
                    <input type="number" id="ot-factor" class="form-control" value="1.35" step="0.01">
                </div>
            </div>
        `, () => {
        const salary = parseFloat(employee.salary);
        const hours = parseFloat(document.getElementById('ot-hours').value);
        const factor = parseFloat(document.getElementById('ot-factor').value);
        const date = document.getElementById('ot-date').value;

        if (hours && date) {
            const bounds = getPayrollBounds();
            if (bounds && (date < bounds.min || date > bounds.max)) {
                alert(`La fecha debe estar dentro del rango de la nómina(${bounds.min} a ${bounds.max})`);
                return;
            }

            const hourlyRate = (salary / 23.83) / 8;
            const extraPay = hourlyRate * hours * factor;
            state.overtime.push({
                id: Date.now().toString(36) + Math.random().toString(36).substring(2),
                date,
                employeeName,
                hours,
                factor,
                amount: extraPay.toFixed(2),
                operation: state.settings.payrollAccounts?.overtime || ''
            });
            saveState();
            renderSection('employees');
            hideModal();
            alert('Horas extras registradas');
        }
    });
};

window.quickAddDiscount = (employeeName) => {
    showModal('Crear Descuento', `
            < div class="form-group" >
                <label>Empleado</label>
                <input type="text" id="disc-emp" class="form-control" value="${employeeName}" readonly>
            </div>
            <div class="form-group">
                <label>Monto</label>
                <input type="number" id="disc-amount" class="form-control" placeholder="0.00">
            </div>
            <div class="form-group">
                <label>Concepto / Motivo</label>
                <input type="text" id="disc-reason" class="form-control">
            </div>
        `, () => {
        const d = {
            id: Date.now().toString(36) + Math.random().toString(36).substring(2),
            employeeName: document.getElementById('disc-emp').value,
            amount: document.getElementById('disc-amount').value,
            reason: document.getElementById('disc-reason').value,
            operation: state.settings.payrollAccounts?.discounts || ''
        };
        if (d.employeeName && d.amount) {
            state.discounts.push(d);
            saveState();
            renderSection('employees');
            hideModal();
            alert('Descuento registrado');
        }
    });
};

window.quickAddChristmasSalary = (employeeName) => {
    showModal('Salario de Navidad', `
            < div class="form-group" >
                <label>Empleado</label>
                <input type="text" id="chr-emp" class="form-control" value="${employeeName}" readonly>
            </div>
            <div class="form-group">
                <label>Monto (Monto Total a Pagar)</label>
                <input type="number" id="chr-amount" class="form-control" placeholder="0.00">
            </div>
            <div class="form-group">
                <label>Fecha de Pago Estimada</label>
                <input type="date" id="chr-date" class="form-control" value="${new Date().getFullYear()}-12-20">
            </div>
        `, () => {
        const amount = document.getElementById('chr-amount').value;
        const date = document.getElementById('chr-date').value;
        if (amount && date) {
            state.christmasSalary.push({
                employeeName,
                amount,
                date,
                operation: state.settings.payrollAccounts?.christmas || ''
            });
            saveState();
            renderSection('employees');
            hideModal();
            alert('Salario de Navidad registrado');
        }
    });
};

// --- Module: Benefits (Prestaciones Laborales) ---
const renderBenefits = (container) => {
    container.innerHTML = `
        <div class="header-action hidden-print">
            <h1>Cálculo de Prestaciones Laborales</h1>
            <div>
                <button class="btn btn-primary" id="btn-register-benefits" style="display:none; margin-right: 10px; background-color: var(--success);">
                    <i class="fas fa-save"></i> Registrar Prestaciones
                </button>
                <button class="btn btn-primary" onclick="window.printBenefitsReport()" id="btn-print-benefits" style="display:none;">
                    <i class="fas fa-print"></i> Imprimir Liquidación
                </button>
            </div>
        </div>
        
        <div class="card mt-4 hidden-print" id="benefits-form-card">
            <div class="form-row">
                <div class="form-group">
                    <label>Escriba el Empleado a Buscar</label>
                    <input list="ben-emp-list" id="ben-emp-search" class="form-control" placeholder="Buscar por nombre o cédula...">
                    <datalist id="ben-emp-list">
                        ${window.getVisibleEmployees().filter(e => e.active !== false).map(e => `<option value="${e.idNumber}">[${e.idNumber}] ${e.firstName} ${e.lastName}</option>`).join('')}
                    </datalist>
                </div>
            </div>
            
            <div id="ben-details-section" style="display: none;">
                <div class="form-row">
                    <div class="form-group">
                        <label>Fecha de Ingreso</label>
                        <input type="date" id="ben-hire-date" class="form-control" readonly>
                    </div>
                    <div class="form-group">
                        <label>Fecha de Salida</label>
                        <input type="date" id="ben-exit-date" class="form-control" value="${new Date().toISOString().split('T')[0]}">
                    </div>
                </div>
                
                <div class="form-row">
                    <div class="form-group">
                        <label>Salario Promedio Mensual Registrado (RD$)</label>
                        <input type="number" id="ben-salary" class="form-control">
                    </div>
                    <div class="form-group" style="display: flex; flex-direction: column; justify-content: center;">
                        <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; margin-top: 10px;">
                            <input type="checkbox" id="ben-preaviso"> El empleador ya dio el Preaviso (No pagar)
                        </label>
                        <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; margin-top: 10px;">
                            <input type="checkbox" id="ben-cesantia-omitir"> Omitir Cesantía (Desahucio no aplica u otra causa)
                        </label>
                        <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; margin-top: 10px;">
                            <input type="checkbox" id="ben-vacaciones-tomadas"> El empleado ya tomó sus vacaciones este año (No pagar)
                        </label>
                    </div>
                </div>
                
                <button class="btn btn-primary mt-4" id="btn-calculate-benefits" style="width: 100%;">
                    <i class="fas fa-calculator"></i> Calcular Prestaciones
                </button>
            </div>
        </div>

        <div id="benefits-report-area" style="display: none;" class="mt-4 card printable-page">
            <div class="report-header" style="text-align: center; margin-bottom: 20px;">
                <img src="https://upload.wikimedia.org/wikipedia/commons/thumb/1/1b/Coat_of_arms_of_the_Dominican_Republic.svg/150px-Coat_of_arms_of_the_Dominican_Republic.svg.png" alt="Escudo RD" style="height: 80px; margin-bottom: 10px;">
                <h1 style="font-size: 24px; margin: 0; font-family: 'Times New Roman', Times, serif;">República Dominicana</h1>
                <h2 style="font-size: 18px; margin: 0; font-family: 'Times New Roman', Times, serif; font-weight: normal;">Ministerio de Trabajo</h2>
            </div>
            
            <hr style="border: 0; border-top: 1px solid #ccc; margin: 15px 0;">
            <p style="text-align: center; font-size: 12px; font-family: 'Times New Roman', Times, serif;">Cálculo Prestaciones Laborales y Derechos Adquiridos</p>
            <hr style="border: 0; border-top: 1px solid #ccc; margin: 15px 0 25px 0;">
            
            <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px; font-family: 'Arial', sans-serif; font-size: 13px;">
                <tr>
                    <td style="padding: 5px; font-weight: bold; width: 30%;">Cédula:</td>
                    <td id="rep-cedula" style="padding: 5px;">-</td>
                    <td style="padding: 5px;"></td>
                    <td style="padding: 5px;"></td>
                </tr>
                <tr>
                    <td style="padding: 5px; font-weight: bold;">Nombre del Solicitante:</td>
                    <td id="rep-nombre" style="padding: 5px;" colspan="3">-</td>
                </tr>
                <tr>
                    <td style="padding: 5px; font-weight: bold;">Lugar de Trabajo o Empleador:</td>
                    <td id="rep-empleador" style="padding: 5px; text-transform: uppercase;" colspan="3">${state.settings.companyName || 'NÓMINAAPP'}</td>
                </tr>
                <tr>
                    <td style="padding: 5px; font-weight: bold;">Fecha de Ingreso:</td>
                    <td id="rep-ingreso" style="padding: 5px;">-</td>
                    <td style="padding: 5px; font-weight: bold;">Fecha de Salida:</td>
                    <td id="rep-salida" style="padding: 5px;">-</td>
                </tr>
                <tr>
                    <td style="padding: 5px; font-weight: bold;">Tiempo Laborado:</td>
                    <td id="rep-tiempo" style="padding: 5px;">-</td>
                    <td style="padding: 5px; font-weight: bold;">Salario Promedio Diario:</td>
                    <td id="rep-spd" style="padding: 5px;">-</td>
                </tr>
                <tr>
                    <td style="padding: 5px; font-weight: bold;">Salario Actual:</td>
                    <td id="rep-salario" style="padding: 5px;">- Mensual</td>
                    <td colspan="2"></td>
                </tr>
            </table>

            <hr style="border: 0; border-top: 1px solid #ccc; margin: 25px 0;">
            <h2 style="text-align: center; font-size: 22px; font-family: 'Times New Roman', Times, serif; font-weight: normal; margin-bottom: 25px;">Prestaciones Laborales y Derechos Adquiridos</h2>
            <hr style="border: 0; border-top: 1px solid #ccc; margin: 0 0 25px 0;">

            <table style="width: 100%; border-collapse: collapse; font-family: 'Arial', sans-serif; font-size: 13px;">
                <tr>
                    <td style="padding: 5px; text-align: right; font-weight: bold; width: 50%;">Salario Preaviso (art. 76 C.T.):</td>
                    <td id="rep-preaviso" style="padding: 5px; text-align: left;">-</td>
                </tr>
                <tr>
                    <td style="padding: 5px; text-align: right; font-weight: bold;">Cesantía (Art. 80 C.T. antes 29/05/1992):</td>
                    <td style="padding: 5px; text-align: left;">RD$0.00</td>
                </tr>
                <tr>
                    <td style="padding: 5px; text-align: right; font-weight: bold;">Cesantía (Art.80 C.T. después 29/05/1992):</td>
                    <td id="rep-cesantia" style="padding: 5px; text-align: left;">-</td>
                </tr>
                <tr>
                    <td style="padding: 5px; text-align: right; font-weight: bold;">Salario Vacaciones (art.177 C.T.):</td>
                    <td id="rep-vacaciones" style="padding: 5px; text-align: left;">-</td>
                </tr>
                <tr><td colspan="2" style="height: 20px;"></td></tr>
                <tr>
                    <td style="padding: 5px; text-align: right; font-weight: bold; font-size: 15px;">SubTotal a Recibir:</td>
                    <td id="rep-subtotal" style="padding: 5px; text-align: left; font-size: 16px;">-</td>
                </tr>
                <tr>
                    <td style="padding: 5px; text-align: right; font-weight: bold;">Salario Navidad (art.219 C.T.):</td>
                    <td id="rep-regalia" style="padding: 5px; text-align: left;">-</td>
                </tr>
                <tr><td colspan="2" style="height: 30px;"></td></tr>
                <tr>
                    <td style="padding: 5px; text-align: right; font-weight: bold; font-size: 20px;">Total a Recibir:</td>
                    <td id="rep-total" style="padding: 5px; text-align: left; font-size: 20px; font-weight: bold;">-</td>
                </tr>
            </table>

            <div style="margin-top: 50px; font-family: 'Arial', sans-serif; font-size: 10px; text-align: justify; line-height: 1.4;">
                <strong>NOTA:</strong> ESTOS CÁLCULOS HAN SIDO REALIZADOS EN BASE A LAS INFORMACIONES SUMINISTRADAS POR LA PARTE INTERESADA. POR TANTO, LOS MISMOS NO SE IMPONEN A LA PARTE CONTRARIA NI AL JUEZ DE TRABAJO Y NO APLICAN EN LOS CASOS DE TRABAJADORAS PROTEGIDAS POR LA MATERNIDAD, TRABAJADORES PROTEGIDOS POR EL FUERO SINDICAL, TRABAJADORES CON VIH, NI PARA LOS DEMÁS CASOS EN LOS QUE LAS NORMAS LABORALES PROHIBEN LA TERMINACIÓN DEL CONTRATO DE TRABAJO.
                <div style="text-align: center; margin-top: 15px; font-weight: bold; font-size: 11px;" id="rep-fecha-doc"></div>
            </div>

            <div style="margin-top: 60px; display: flex; justify-content: space-between; font-family: 'Arial', sans-serif; font-size: 12px;">
                <div style="width: 40%; border-top: 1px solid black; text-align: center; padding-top: 5px;">
                    Inspector(a) de Trabajo
                </div>
                <div style="width: 40%; border-top: 1px solid black; text-align: center; padding-top: 5px;">
                    Representante Local de Trabajo o Supervisor(a)
                </div>
            </div>
        </div>
    `;

    const empSearch = document.getElementById('ben-emp-search');
    const detailsSection = document.getElementById('ben-details-section');
    const btnCalculate = document.getElementById('btn-calculate-benefits');
    const btnPrint = document.getElementById('btn-print-benefits');
    const reportArea = document.getElementById('benefits-report-area');

    let currentSelectedEmployee = null;

    empSearch.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase();

        // Buscar coincidencia exacta por ID (si selecciona de la lista)
        let emp = state.employees.find(emp => emp.idNumber === query && emp.active !== false);

        // Si no hay por ID, buscar por nombre o apellido
        if (!emp) {
            emp = state.employees.find(emp =>
                emp.active !== false &&
                (emp.firstName.toLowerCase().includes(query) ||
                    emp.lastName.toLowerCase().includes(query) ||
                    `${emp.firstName} ${emp.lastName}`.toLowerCase().includes(query))
            );
        }

        if (!emp || query.length === 0) {
            detailsSection.style.display = 'none';
            reportArea.style.display = 'none';
            btnPrint.style.display = 'none';
            currentSelectedEmployee = null;
            return;
        }
        currentSelectedEmployee = emp;
        document.getElementById('ben-hire-date').value = emp.hireDate;
        document.getElementById('ben-salary').value = emp.salary || 0;

        // Si es movil destajero que no tiene sueldo, sugerir poner sueldo prop.
        if (emp.type === 'mobile' && (!emp.salary || emp.salary == 0)) {
            alert("Atención: El empleado seleccionado es Móvil y no tiene salario base. Por favor inserte manualmente el Promedio Mensual devengado en los últimos 12 meses.");
        }

        detailsSection.style.display = 'block';
        reportArea.style.display = 'none';
        btnPrint.style.display = 'none';
    });

    btnCalculate.addEventListener('click', () => {
        if (!currentSelectedEmployee) return;

        const dateStartStr = document.getElementById('ben-hire-date').value;
        const dateEndStr = document.getElementById('ben-exit-date').value;
        const salaryMonthly = parseFloat(document.getElementById('ben-salary').value) || 0;
        const omitPreaviso = document.getElementById('ben-preaviso').checked;
        const omitCesantia = document.getElementById('ben-cesantia-omitir').checked;
        const omitVacaciones = document.getElementById('ben-vacaciones-tomadas').checked;

        if (!dateStartStr || !dateEndStr || salaryMonthly <= 0) {
            alert('Asegúrese de proveer fecha de salida válida y un salario mayor a 0.');
            return;
        }

        const [sY, sM, sD] = dateStartStr.split('-');
        const start = new Date(sY, sM - 1, sD);

        const [eY, eM, eD] = dateEndStr.split('-');
        const end = new Date(eY, eM - 1, eD);

        if (end < start) {
            alert('La fecha de salida no puede ser menor a la de ingreso');
            return;
        }

        // --- CÁLCULOS LÓGICA MIN. TRABAJO ---
        function calculateDRLaborTime(dStart, dEnd) {
            if (dEnd < dStart) return { years: 0, months: 0, days: 0 };
            if (dStart.getFullYear() === dEnd.getFullYear() && dStart.getMonth() === dEnd.getMonth()) {
                let d = dEnd.getDate() - dStart.getDate() + 1;
                let daysInM = new Date(dStart.getFullYear(), dStart.getMonth() + 1, 0).getDate();
                if (dStart.getDate() === 1 && dEnd.getDate() === daysInM) return { years: 0, months: 1, days: 0 };
                return { years: 0, months: 0, days: d };
            }
            let yFull = 0, mFull = 0;
            for (let y = dStart.getFullYear() + 1; y < dEnd.getFullYear(); y++) yFull++;
            let stY = dStart.getFullYear(), enY = dEnd.getFullYear();
            let dInS = new Date(stY, dStart.getMonth() + 1, 0).getDate();
            let isSFull = (dStart.getDate() === 1);
            let isEFull = (dEnd.getDate() === new Date(enY, dEnd.getMonth() + 1, 0).getDate());
            let sLoop = isSFull ? dStart.getMonth() : dStart.getMonth() + 1;
            let eLoop = isEFull ? dEnd.getMonth() : dEnd.getMonth() - 1;
            if (stY === enY) {
                for (let m = sLoop; m <= eLoop; m++) mFull++;
            } else {
                for (let m = sLoop; m <= 11; m++) mFull++;
                for (let m = 0; m <= eLoop; m++) mFull++;
            }
            yFull += Math.floor(mFull / 12);
            mFull = mFull % 12;
            let dTotal = 0;
            if (!isSFull) dTotal += dInS - dStart.getDate() + 1;
            if (!isEFull) dTotal += dEnd.getDate();
            if (dTotal >= 30) {
                mFull += Math.floor(dTotal / 30);
                dTotal = dTotal % 30;
            }
            if (mFull >= 12) {
                yFull += Math.floor(mFull / 12);
                mFull = mFull % 12;
            }
            return { years: yFull, months: mFull, days: dTotal };
        }

        const laborTime = calculateDRLaborTime(start, end);
        let diffYears = laborTime.years;
        let diffMonths = laborTime.months;
        let diffDays = laborTime.days;

        let totalMonthsWorked = (diffYears * 12) + diffMonths;

        // 2. SPD
        const SPD = salaryMonthly / 23.83;

        // 3. Preaviso (Art 76)
        let diasPreaviso = 0;
        if (!omitPreaviso) {
            if (totalMonthsWorked >= 3 && totalMonthsWorked < 6) diasPreaviso = 7;
            else if (totalMonthsWorked >= 6 && totalMonthsWorked < 12) diasPreaviso = 14;
            else if (totalMonthsWorked >= 12) diasPreaviso = 28;
        }
        const montoPreaviso = diasPreaviso * SPD;

        // 4. Cesantía (Art 80)
        let diasCesantia = 0;
        if (!omitCesantia) {
            if (diffYears >= 1 && diffYears < 5) diasCesantia += diffYears * 21;
            else if (diffYears >= 5) diasCesantia += diffYears * 23;

            if (diffMonths >= 3 && diffMonths < 6) diasCesantia += 6;
            else if (diffMonths >= 6 && diffMonths < 12) diasCesantia += 13;
        }

        const montoCesantia = diasCesantia * SPD;

        // 5. Vacaciones (Art 177)
        let diasVacaciones = 0;
        if (!omitVacaciones) {
            if (diffYears === 0) {
                if (diffMonths >= 5 && diffMonths < 6) diasVacaciones = 6;
                else if (diffMonths >= 6 && diffMonths < 7) diasVacaciones = 7;
                else if (diffMonths >= 7 && diffMonths < 8) diasVacaciones = 8;
                else if (diffMonths >= 8 && diffMonths < 9) diasVacaciones = 9;
                else if (diffMonths >= 9 && diffMonths < 10) diasVacaciones = 10;
                else if (diffMonths >= 10 && diffMonths < 11) diasVacaciones = 11;
                else if (diffMonths >= 11 && diffMonths < 12) diasVacaciones = 12;
            } else {
                if (diffYears >= 1 && diffYears < 5) diasVacaciones = 14;
                else if (diffYears >= 5) diasVacaciones = 18;
            }
        }
        const montoVacaciones = diasVacaciones * SPD;

        // 6. Regalía Pascual (Art 219) - Proporcional al año de salida
        const inicioAno = new Date(end.getFullYear(), 0, 1);
        let startDateRegalia = start > inicioAno ? start : inicioAno;

        let montoSumaSalariosEsteAno = 0;
        let dCursor = new Date(startDateRegalia);

        while (dCursor <= end) {
            let year = dCursor.getFullYear();
            let month = dCursor.getMonth();
            let daysInMonth = new Date(year, month + 1, 0).getDate();

            let startOfMonthWorked = (dCursor.getTime() === new Date(year, month, 1).getTime());
            let endOfMonthWorked = false;
            let endMonthDay = daysInMonth;

            if (end.getFullYear() === year && end.getMonth() === month) {
                endMonthDay = end.getDate();
                if (end.getDate() === daysInMonth) endOfMonthWorked = true;
            } else {
                endOfMonthWorked = true;
            }

            let daysWorkedInMonth = endMonthDay - dCursor.getDate() + 1;

            if (startOfMonthWorked && endOfMonthWorked) {
                montoSumaSalariosEsteAno += salaryMonthly;
            } else {
                montoSumaSalariosEsteAno += (salaryMonthly / daysInMonth) * daysWorkedInMonth;
            }
            dCursor = new Date(year, month + 1, 1);
        }

        const montoRegalia = montoSumaSalariosEsteAno / 12;

        // Totales
        const subTotal = montoPreaviso + montoCesantia + montoVacaciones;
        const total = subTotal + montoRegalia;

        // Formato visual temporal Regalía
        const regaliaTime = calculateDRLaborTime(startDateRegalia, end);
        let regDaysStr = `(${regaliaTime.months} meses${regaliaTime.days > 0 ? ' y ' + regaliaTime.days + ' día(s)' : ''})`;

        // --- RENDERIZADO DEL INFORME ---
        const fmt = (num) => 'RD$' + parseFloat(num).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        const formatDate = (ds) => {
            const d = new Date(ds);
            return `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()}`;
        };

        document.getElementById('rep-cedula').innerText = currentSelectedEmployee.idNumber;
        document.getElementById('rep-nombre').innerText = `${currentSelectedEmployee.firstName} ${currentSelectedEmployee.lastName}`;
        document.getElementById('rep-ingreso').innerText = formatDate(start);
        document.getElementById('rep-salida').innerText = formatDate(end);
        document.getElementById('rep-tiempo').innerText = `${diffYears} años , ${diffMonths} meses y ${diffDays} días`;
        document.getElementById('rep-spd').innerText = fmt(SPD);
        document.getElementById('rep-salario').innerText = fmt(salaryMonthly) + ' Mensual';

        document.getElementById('rep-preaviso').innerHTML = montoPreaviso > 0 ? `${fmt(montoPreaviso)} (${diasPreaviso} días)` : 'RD$0.00';
        document.getElementById('rep-cesantia').innerHTML = montoCesantia > 0 ? `${fmt(montoCesantia)} (${diasCesantia} días)` : 'RD$0.00';
        document.getElementById('rep-vacaciones').innerHTML = montoVacaciones > 0 ? `${fmt(montoVacaciones)} (${diasVacaciones} días)` : '0.00';

        document.getElementById('rep-subtotal').innerText = fmt(subTotal);

        document.getElementById('rep-regalia').innerHTML = montoRegalia > 0 ? `${fmt(montoRegalia)} ${regDaysStr}` : 'RD$0.00';
        document.getElementById('rep-total').innerText = fmt(total);

        // Fecha de doc texto
        const monthNames = ["ENERO", "FEBRERO", "MARZO", "ABRIL", "MAYO", "JUNIO", "JULIO", "AGOSTO", "SEPTIEMBRE", "OCTUBRE", "NOVIEMBRE", "DICIEMBRE"];
        document.getElementById('rep-fecha-doc').innerText = `DADO A LOS ${end.getDate().toString().padStart(2, '0')} DÍAS DEL MES DE ${monthNames[end.getMonth()]} DEL AÑO ${end.getFullYear()}`;

        reportArea.style.display = 'block';
        btnPrint.style.display = 'inline-block';
        const btnRegister = document.getElementById('btn-register-benefits');
        btnRegister.style.display = 'inline-block';

        // Almacenar data globalmente para guardar
        window.currentCalculatedBenefits = {
            employeeId: currentSelectedEmployee.id || currentSelectedEmployee.idNumber,
            idNumber: currentSelectedEmployee.idNumber,
            employeeName: `${currentSelectedEmployee.firstName} ${currentSelectedEmployee.lastName}`,
            dateStart: start,
            dateEnd: end,
            timeElapsed: `${diffYears} años , ${diffMonths} meses y ${diffDays} días`,
            SPD: SPD,
            salaryMonthly: salaryMonthly,
            montoPreaviso, diasPreaviso,
            montoCesantia, diasCesantia,
            montoVacaciones, diasVacaciones,
            montoRegalia,
            subTotal,
            total,
            fechaRegistro: firebase.firestore.FieldValue.serverTimestamp()
        };
    });

    document.getElementById('btn-register-benefits').addEventListener('click', async () => {
        if (!window.currentCalculatedBenefits || !currentSelectedEmployee) return;
        if (confirm(`¿Desea registrar las prestaciones de ${currentSelectedEmployee.firstName} por un total de RD$${window.currentCalculatedBenefits.total.toLocaleString('en-US', { minimumFractionDigits: 2 })} y deshabilitar al empleado de futuras nóminas?`)) {
            try {
                const registerBtn = document.getElementById('btn-register-benefits');
                registerBtn.disabled = true;
                registerBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Registrando...';

                // Registrar historial
                await firebase.firestore().collection('benefitsHistory').add(window.currentCalculatedBenefits);

                // Actualizar empleado (inactivo) en nuestro state global
                const empIndex = state.employees.findIndex(e => e.idNumber === currentSelectedEmployee.idNumber);
                if (empIndex > -1) {
                    state.employees[empIndex].active = false;
                    state.employees[empIndex].terminationDate = window.currentCalculatedBenefits.dateEnd;
                    saveState();
                }

                alert('Prestaciones registradas exitosamente. El empleado ha sido inactivado.');

                // Limpiar vista
                document.getElementById('ben-emp-search').value = '';
                detailsSection.style.display = 'none';
                reportArea.style.display = 'none';
                btnPrint.style.display = 'none';
                registerBtn.style.display = 'none';
                registerBtn.disabled = false;
                registerBtn.innerHTML = '<i class="fas fa-save"></i> Registrar Prestaciones';
                currentSelectedEmployee = null;
                window.currentCalculatedBenefits = null;

                // Actualizar UI general re-renderizando
                switchSection('benefits');
            } catch (e) {
                console.error("Error al registrar prestaciones:", e);
                alert("Error al registrar las prestaciones y deshabilitar al empleado.");
                const registerBtn = document.getElementById('btn-register-benefits');
                registerBtn.disabled = false;
                registerBtn.innerHTML = '<i class="fas fa-save"></i> Registrar Prestaciones';
            }
        }
    });

};

// --- Module: Vacations ---
const renderVacations = (container) => {
    // 1. Lógica para determinar Vacaciones Pendientes
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const msInDay = 24 * 60 * 60 * 1000;
    const currentYear = today.getFullYear();

    // Arrays para las tablas
    const pendingVacations = [];
    const activeTakenVacations = [];

    state.employees.forEach(emp => {
        if (emp.active === false) return; // Skip inactivos
        if (!emp.hireDate) return;

        // Validar Retornos Activos (Vacaciones Tomadas)
        const pendingReturn = state.vacations.find(v => v.employeeId === emp.idNumber && v.type === 'Tomada' && !v.returned);
        if (pendingReturn) {
            const returnDate = new Date(pendingReturn.returnDate);
            returnDate.setHours(0, 0, 0, 0);

            const diffDays = Math.round((returnDate - today) / msInDay);
            let statusBadge = '';
            if (diffDays < 0) {
                statusBadge = '<span class="status-badge inactive">Atrasado</span>';
            } else if (diffDays <= 1) {
                statusBadge = '<span class="status-badge" style="background-color: var(--warning); color: black;">Mañana</span>';
            } else {
                statusBadge = `<span class="status-badge" style="background-color: var(--accent-color);">${diffDays} días rest.</span>`;
            }

            activeTakenVacations.push({
                ...emp,
                vacData: pendingReturn,
                statusBadge,
                diffDays
            });
            return; // Si está de vacaciones, no evaluar "Pendientes"
        }

        // Evaluar Pendientes (Aniversario)
        let hireDate = new Date(emp.hireDate);
        hireDate.setHours(0, 0, 0, 0);
        let yearsWorked = currentYear - hireDate.getFullYear();

        if (yearsWorked > 0) {
            let anniversaryThisYear = new Date(currentYear, hireDate.getMonth(), hireDate.getDate());
            let daysUntilAnniversary = Math.round((anniversaryThisYear - today) / msInDay);

            // Verificar si YÁ se le registró vacaciones este año
            const yaRegistrado = state.vacations.some(v => v.employeeId === emp.idNumber && v.periodYear === currentYear);

            if (!yaRegistrado) {
                let alertPending = false;
                let badge = '';

                if (daysUntilAnniversary < 0) {
                    alertPending = true;
                    badge = '<span class="status-badge inactive">Atrasado</span>';
                } else if (daysUntilAnniversary <= 7) {
                    alertPending = true;
                    badge = `<span class="status-badge" style="background-color: var(--warning); color: black;">En ${daysUntilAnniversary} día(s)</span>`;
                }

                if (alertPending) {
                    pendingVacations.push({
                        ...emp,
                        yearsWorked,
                        anniversaryThisYear,
                        badge
                    });
                }
            }
        }
    });

    container.innerHTML = `
        <div class="header-action">
            <h1>Control de Vacaciones</h1>
        </div>
        
        <!-- Alertas de Pendientes -->
        <div class="card mt-4" style="border-left: 4px solid var(--warning);">
            <h3><i class="fas fa-exclamation-triangle" style="color: var(--warning);"></i> Vacaciones Pendientes (Próximas o Atrasadas)</h3>
            <table class="data-table mt-2">
                <thead>
                    <tr>
                        <th>Cédula</th>
                        <th>Nombre</th>
                        <th>Fecha Ingreso</th>
                        <th>Aniversario</th>
                        <th>Años Cumplidos</th>
                        <th>Estado</th>
                    </tr>
                </thead>
                <tbody>
                    ${pendingVacations.length === 0 ? '<tr><td colspan="6" style="text-align:center; color: var(--text-secondary);">No hay vacaciones pendientes o próximas (7 días).</td></tr>' : ''}
                    ${pendingVacations.map(p => `
                        <tr>
                            <td>${p.idNumber}</td>
                            <td>${p.firstName} ${p.lastName}</td>
                            <td>${p.hireDate}</td>
                            <td>${p.anniversaryThisYear.toLocaleDateString()}</td>
                            <td>${p.yearsWorked}</td>
                            <td>${p.badge}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>

        <!-- Registro de Vacaciones -->
        <div class="card mt-4">
            <h3><i class="fas fa-plus"></i> Registrar Nueva Vacación</h3>
            <div class="form-row mt-3">
                <div class="form-group" style="flex: 2;">
                    <label>Buscar Empleado (Sólo Activos)</label>
                    <input list="vac-emp-list" id="vac-emp-search" class="form-control" placeholder="Escriba nombre o cédula...">
                    <datalist id="vac-emp-list">
                        ${window.getVisibleEmployees().filter(e => e.active !== false).map(e => `<option value="${e.idNumber}">[${e.idNumber}] ${e.firstName} ${e.lastName}</option>`).join('')}
                    </datalist>
                </div>
                <div class="form-group">
                    <label>Periodo (Año)</label>
                    <input type="number" id="vac-period" class="form-control" value="${currentYear}">
                </div>
            </div>

            <div id="vac-details-section" style="display: none; padding-top: 15px; border-top: 1px solid var(--border-color); margin-top: 15px;">
                <div class="form-row">
                    <div class="form-group">
                        <label>Salario Base (RD$)</label>
                        <input type="number" id="vac-salary" class="form-control" readonly>
                    </div>
                    <div class="form-group">
                        <label>Años en la Empresa</label>
                        <input type="number" id="vac-years" class="form-control" readonly>
                    </div>
                    <div class="form-group">
                        <label>Días Correspondientes</label>
                        <input type="number" id="vac-days" class="form-control" readonly>
                    </div>
                    <div class="form-group">
                        <label>Monto a Pagar (RD$)</label>
                        <input type="text" id="vac-amount" class="form-control" readonly style="color: var(--success); font-weight: bold;">
                    </div>
                </div>

                <div class="form-row">
                    <div class="form-group">
                        <label>Modalidad</label>
                        <select id="vac-type" class="form-control">
                            <option value="Tomada">Tomada (Descanso Físico)</option>
                            <option value="Pagada">Pagada (Sigue Trabajando)</option>
                        </select>
                    </div>
                    <div class="form-group vac-dates-group">
                        <label>Fecha de Salida</label>
                        <input type="date" id="vac-out-date" class="form-control">
                    </div>
                    <div class="form-group vac-dates-group">
                        <label>Fecha de Retorno</label>
                        <input type="date" id="vac-in-date" class="form-control">
                    </div>
                </div>
                
                <button class="btn btn-primary mt-3" id="btn-save-vacation" style="width: 100%;">
                    <i class="fas fa-save"></i> Registrar Vacación
                </button>
            </div>
        </div>

        <!-- Alertas de Retorno -->
        <div class="card mt-4" style="border-left: 4px solid var(--accent-color);">
            <h3><i class="fas fa-plane-arrival" style="color: var(--accent-color);"></i> Retornos Próximos o Atrasados (Descanso Físico)</h3>
            <table class="data-table mt-2">
                <thead>
                    <tr>
                        <th>Cédula</th>
                        <th>Nombre</th>
                        <th>Fecha Salida</th>
                        <th>Fecha Retorno</th>
                        <th>Estado</th>
                        <th>Acción</th>
                    </tr>
                </thead>
                <tbody>
                    ${activeTakenVacations.length === 0 ? '<tr><td colspan="6" style="text-align:center; color: var(--text-secondary);">No hay empleados actualmente en descanso físico de vacaciones.</td></tr>' : ''}
                    ${activeTakenVacations.map((p, idx) => `
                        <tr>
                            <td>${p.idNumber}</td>
                            <td>${p.firstName} ${p.lastName}</td>
                            <td>${p.vacData.outDate}</td>
                            <td>${p.vacData.returnDate}</td>
                            <td>${p.statusBadge}</td>
                            <td>
                                <button class="btn btn-primary btn-sm" onclick="window.markVacationReturned('${p.vacData.id}')">
                                    <i class="fas fa-check"></i> Marcar Retorno
                                </button>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    `;

    // Interacción del Formulario
    const vacSearch = document.getElementById('vac-emp-search');
    const detailsSection = document.getElementById('vac-details-section');
    const vacType = document.getElementById('vac-type');
    let currentVacEmp = null;
    let currentVacCalc = {};

    vacSearch.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase();
        let emp = state.employees.find(emp => emp.idNumber === query && emp.active !== false);

        if (!emp) {
            emp = state.employees.find(emp =>
                emp.active !== false &&
                (emp.firstName.toLowerCase().includes(query) ||
                    emp.lastName.toLowerCase().includes(query) ||
                    `${emp.firstName} ${emp.lastName}`.toLowerCase().includes(query))
            );
        }

        if (!emp || query.length === 0) {
            detailsSection.style.display = 'none';
            currentVacEmp = null;
            return;
        }

        currentVacEmp = emp;

        // Cálculos Pre-rellenados
        let hireDate = new Date(emp.hireDate);
        hireDate.setHours(0, 0, 0, 0);
        let yearsWorked = currentYear - hireDate.getFullYear();
        if (yearsWorked < 1 && (today.getMonth() > hireDate.getMonth() || (today.getMonth() === hireDate.getMonth() && today.getDate() >= hireDate.getDate()))) {
            yearsWorked = 1; // Si cumplió el primer año ya
        }

        let days = 0;
        if (yearsWorked >= 1 && yearsWorked < 5) days = 14;
        else if (yearsWorked >= 5) days = 18;
        // Si no ha cumplido el año, no deberia tener pero por defecto 0.

        const salary = parseFloat(emp.salary) || 0;
        const spd = salary / 23.83;
        const totalPay = spd * days;

        document.getElementById('vac-salary').value = salary;
        document.getElementById('vac-years').value = yearsWorked;
        document.getElementById('vac-days').value = days;
        document.getElementById('vac-amount').value = totalPay > 0 ? totalPay.toLocaleString('en-US', { minimumFractionDigits: 2 }) : '0.00';

        currentVacCalc = {
            yearsWorked, days, spd, totalPay, salary
        };

        detailsSection.style.display = 'block';
    });

    vacType.addEventListener('change', (e) => {
        const type = e.target.value;
        const datesGroups = document.querySelectorAll('.vac-dates-group');
        datesGroups.forEach(g => {
            g.style.display = type === 'Tomada' ? 'block' : 'none';
        });
    });

    // Guardar
    document.getElementById('btn-save-vacation').addEventListener('click', () => {
        if (!currentVacEmp) return;

        const periodYear = parseInt(document.getElementById('vac-period').value);
        const type = document.getElementById('vac-type').value;
        const outDate = document.getElementById('vac-out-date').value;
        const returnDate = document.getElementById('vac-in-date').value;

        if (type === 'Tomada' && (!outDate || !returnDate)) {
            alert("Debe proveer fechas de salida y retorno para vacaciones tomadas.");
            return;
        }

        if (currentVacCalc.days === 0) {
            if (!confirm("Este empleado aparentemente no ha cumplido el primer año (0 días correspondientes). ¿Desea guardarlo de todas formas?")) return;
        }

        const newVac = {
            id: 'vac_' + Date.now().toString(36),
            employeeId: currentVacEmp.idNumber,
            employeeName: `${currentVacEmp.firstName} ${currentVacEmp.lastName}`,
            periodYear,
            type,
            days: currentVacCalc.days,
            spd: currentVacCalc.spd,
            totalPay: currentVacCalc.totalPay,
            outDate: type === 'Tomada' ? outDate : null,
            returnDate: type === 'Tomada' ? returnDate : null,
            returned: type === 'Tomada' ? false : true, // Pagada es True por defecto
            createdAt: new Date().toISOString()
        };

        state.vacations.push(newVac);
        saveState();
        alert("Vacación Registrada Exitosamente.");
        renderSection('vacations'); // Refresh
    });
};

window.markVacationReturned = (vacId) => {
    if (confirm("¿Confirmar que este empleado ya ha retornado a la empresa?")) {
        const index = state.vacations.findIndex(v => v.id === vacId);
        if (index > -1) {
            state.vacations[index].returned = true;
            saveState();
            renderSection('vacations');
        }
    }
};

window.printBenefitsReport = () => {
    window.print();
};

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    initRouter();
    document.getElementById('current-date').innerText = new Date().toLocaleDateString();

    // Global Search listener
    const globalSearch = document.getElementById('global-search');
    if (globalSearch) {
        globalSearch.addEventListener('input', (e) => {
            state.globalSearchQuery = e.target.value;
            // Re-render current section if it depends on getVisibleEmployees
            if (['employees', 'isr', 'dashboard'].includes(state.currentSection)) {
                renderSection(state.currentSection);
            }
        });
    }

    switchSection('dashboard');
});

// --- PWA Installation Logic ---
let deferredPrompt;
const installBtn = document.getElementById('install-pwa-btn');

window.addEventListener('beforeinstallprompt', (e) => {
    // Prevent the mini-infobar from appearing on mobile
    e.preventDefault();
    // Stash the event so it can be triggered later.
    deferredPrompt = e;
    // Update UI notify the user they can install the PWA
    if (installBtn) {
        installBtn.style.display = 'block';
    }
});

if (installBtn) {
    installBtn.addEventListener('click', async () => {
        if (!deferredPrompt) return;
        // Show the install prompt
        deferredPrompt.prompt();
        // Wait for the user to respond to the prompt
        const { outcome } = await deferredPrompt.userChoice;
        console.log(`User response to the install prompt: ${outcome}`);
        // We've used the prompt, and can't use it again, throw it away
        deferredPrompt = null;
        // Hide the install button
        installBtn.style.display = 'none';
    });
}

window.addEventListener('appinstalled', (event) => {
    console.log('👍', 'appinstalled', event);
    // Clear the deferredPrompt so it can be garbage collected
    deferredPrompt = null;
    if (installBtn) installBtn.style.display = 'none';
});
