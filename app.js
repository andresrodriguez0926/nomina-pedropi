/**
 * Payroll App Core Engine
 * Handles routing, state, and UI rendering
 */

// --- State Management ---
const state = {
    currentSection: 'dashboard',
    departments: JSON.parse(localStorage.getItem('payroll_departments') || '[]'),
    operations: JSON.parse(localStorage.getItem('payroll_operations') || '[]'),
    activities: JSON.parse(localStorage.getItem('payroll_activities') || '[]'),
    employees: JSON.parse(localStorage.getItem('payroll_employees') || '[]'),
    periods: JSON.parse(localStorage.getItem('payroll_periods') || '[]'),
    activePayroll: JSON.parse(localStorage.getItem('payroll_active') || 'null'),
    overtime: JSON.parse(localStorage.getItem('payroll_overtime') || '[]'),
    discounts: JSON.parse(localStorage.getItem('payroll_discounts') || '[]'),
    incentives: JSON.parse(localStorage.getItem('payroll_incentives') || '[]'),
    christmasSalary: JSON.parse(localStorage.getItem('payroll_christmas') || '[]'),
    payrollHistory: JSON.parse(localStorage.getItem('payroll_history') || '[]'),
    settings: JSON.parse(localStorage.getItem('payroll_settings') || '{"tss_rate": 0.05, "payrollAccounts": {}, "isrThresholds": {"exempt": 416220.00, "mid": 624329.00, "high": 867123.00, "base1": 31216.00, "base2": 79776.00}}'),
};

// Ensure default thresholds exist if settings were previously saved
if (!state.settings.isrThresholds) {
    state.settings.isrThresholds = {
        exempt: 416220.00,
        mid: 624329.00,
        high: 867123.00,
        base1: 31216.00,
        base2: 79776.00
    };
}

const saveState = () => {
    localStorage.setItem('payroll_departments', JSON.stringify(state.departments));
    localStorage.setItem('payroll_operations', JSON.stringify(state.operations));
    localStorage.setItem('payroll_activities', JSON.stringify(state.activities));
    localStorage.setItem('payroll_employees', JSON.stringify(state.employees));
    localStorage.setItem('payroll_periods', JSON.stringify(state.periods));
    localStorage.setItem('payroll_active', JSON.stringify(state.activePayroll));
    localStorage.setItem('payroll_discounts', JSON.stringify(state.discounts));
    localStorage.setItem('payroll_incentives', JSON.stringify(state.incentives));
    localStorage.setItem('payroll_overtime', JSON.stringify(state.overtime));
    localStorage.setItem('payroll_christmas', JSON.stringify(state.christmasSalary));
    localStorage.setItem('payroll_history', JSON.stringify(state.payrollHistory));
    localStorage.setItem('payroll_settings', JSON.stringify(state.settings));
};

const getPayrollBounds = () => {
    if (!state.activePayroll) return null;
    const startStr = state.activePayroll.startDate;
    const period = state.periods.find(p => p.name === state.activePayroll.periodType);
    if (!period) return { min: startStr, max: '' };

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

const switchSection = (sectionId) => {
    state.currentSection = sectionId;

    // Update Sidebar
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.toggle('active', item.getAttribute('data-section') === sectionId);
    });

    renderSection(sectionId);
};

// --- Rendering Logic ---
const renderSection = (sectionId) => {
    const contentArea = document.getElementById('content-area');
    contentArea.innerHTML = '<div class="loading-spinner"><div class="spinner"></div></div>';

    // Small delay for smooth transition feel
    setTimeout(() => {
        contentArea.classList.remove('content-fade');
        void contentArea.offsetWidth; // Trigger reflow
        contentArea.classList.add('content-fade');

        switch (sectionId) {
            case 'dashboard': renderDashboard(contentArea); break;
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
            default:
                contentArea.innerHTML = `<h2>Módulo ${sectionId} en construcción</h2>`;
        }
    }, 150);
};

// --- Module: Dashboard ---
const renderDashboard = (container) => {
    // --- Data Extraction for Charts ---
    // 1. Payroll Expenses by Month (from historical data)
    // Grouping by "YYYY-MM"
    const monthlyExpenses = {};
    state.payrollHistory.forEach(run => {
        if (!run.periodStart) return;
        // periodStart is YYYY-MM-DD
        const monthKey = run.periodStart.substring(0, 7);
        const runTotalBrute = run.results.reduce((sum, res) => sum + (res.brute || 0), 0);

        if (!monthlyExpenses[monthKey]) {
            monthlyExpenses[monthKey] = 0;
        }
        monthlyExpenses[monthKey] += runTotalBrute;
    });

    // Sort by month ascending
    const sortedMonths = Object.keys(monthlyExpenses).sort();
    const monthlyLabels = sortedMonths.map(m => {
        const [year, month] = m.split('-');
        const date = new Date(year, parseInt(month) - 1, 1);
        return date.toLocaleDateString('es-DO', { month: 'short', year: 'numeric' });
    });
    const monthlyData = sortedMonths.map(m => monthlyExpenses[m]);

    // 2. Highest Expenditure Activity (Historical + Active)
    const activityExpenses = {};

    // Get active payroll exact daily logs (mobile)
    if (state.activePayroll && state.activePayroll.dailyLogs) {
        state.activePayroll.dailyLogs.forEach(log => {
            const actName = log.act || 'Sin Actividad';
            if (!activityExpenses[actName]) activityExpenses[actName] = 0;
            // Solo sumar el sueldo base (amount) para móviles, no es bruto total, pero da la idea del costo directo
            activityExpenses[actName] += parseFloat(log.amount) || 0;
        });
    }

    // Fixed employees in active payroll (estimated proportional base based on default activity)
    if (state.activePayroll) {
        state.employees.filter(e => e.type === 'fixed' && e.active !== false).forEach(emp => {
            const actName = emp.activity || 'Sin Actividad';
            if (!activityExpenses[actName]) activityExpenses[actName] = 0;
            const res = calculateEmployeePayrollData(emp, state.activePayroll);
            activityExpenses[actName] += res.base || 0;
        });
    }

    // Historical (approximating using default activities at time of closing - we use current default as fallback)
    state.payrollHistory.forEach(run => {
        run.results.forEach(res => {
            // Re-find the employee to get their default activity
            const emp = state.employees.find(e => e.idNumber === res.idNumber || `${e.firstName} ${e.lastName}` === res.fullName);
            const actName = emp ? (emp.activity || 'Sin Actividad') : 'Sin Actividad';

            if (!activityExpenses[actName]) activityExpenses[actName] = 0;
            // Summing only standard base cost + overtime + incentives, excluding TSS/ISR
            activityExpenses[actName] += res.brute || 0;
        });
    });

    // Top Activities sorted descending
    const sortedActivities = Object.keys(activityExpenses).sort((a, b) => activityExpenses[b] - activityExpenses[a]);
    // Take top 5 for the chart
    const topActivitiesCount = 5;
    const activityLabels = sortedActivities.slice(0, topActivitiesCount);
    const activityDataSeries = activityLabels.map(a => activityExpenses[a]);


    container.innerHTML = `
        <div class="dashboard-grid">
            <h1 class="mb-4">Resumen del Sistema</h1>
            <div class="stats-row">
                <div class="card stat-card">
                    <div class="stat-label">Total Empleados</div>
                    <div class="stat-value">
                        ${state.employees.filter(e => e.active !== false).length} 
                        <span style="font-size: 0.9rem; opacity: 0.7;">/ ${state.employees.length}</span>
                    </div>
                </div>
                <div class="card stat-card">
                    <div class="stat-label">Departamentos</div>
                    <div class="stat-value">${state.departments.length}</div>
                </div>
                <div class="card stat-card">
                    <div class="stat-label">Nómina Activa</div>
                    <div class="stat-value">${state.activePayroll ? 'SÍ' : 'NO'}</div>
                </div>
            </div>

            <div class="charts-row mt-4" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(400px, 1fr)); gap: 20px;">
                <div class="card">
                    <h3 class="mb-3">Gasto de Nómina por Mes (Histórico)</h3>
                    ${sortedMonths.length > 0 ? `<div style="position: relative; height:300px; width:100%"><canvas id="monthlyChart"></canvas></div>` : '<p class="text-gray" style="text-align: center; padding: 40px 0;">No hay datos históricos suficientes.</p>'}
                </div>
                <div class="card">
                    <h3 class="mb-3">Top ${topActivitiesCount} Actividades con Mayor Gasto (Bruto)</h3>
                    ${activityLabels.length > 0 ? `<div style="position: relative; height:300px; width:100%"><canvas id="activityChart"></canvas></div>` : '<p class="text-gray" style="text-align: center; padding: 40px 0;">No hay datos de actividades suficientes.</p>'}
                </div>
            </div>
        </div>
    `;

    // Render Charts after DOM updates
    setTimeout(() => {
        // Shared Tooltip Callback format
        const currencyTooltip = {
            callbacks: {
                label: function (context) {
                    let label = context.dataset.label || '';
                    if (label) {
                        label += ': ';
                    }
                    if (context.parsed.y !== null) {
                        label += new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(context.parsed.y).replace('$', 'RD$');
                    }
                    return label;
                }
            }
        };

        const chartCommonOptions = {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    labels: { color: 'rgba(255, 255, 255, 0.7)' }
                },
                tooltip: currencyTooltip
            },
            scales: {
                x: {
                    ticks: { color: 'rgba(255, 255, 255, 0.5)' },
                    grid: { color: 'rgba(255, 255, 255, 0.05)' }
                },
                y: {
                    ticks: {
                        color: 'rgba(255, 255, 255, 0.5)',
                        callback: function (value, index, values) {
                            if (value >= 1000) {
                                return 'RD$' + (value / 1000) + 'k';
                            }
                            return 'RD$' + value;
                        }
                    },
                    grid: { color: 'rgba(255, 255, 255, 0.1)' }
                }
            }
        };

        // Monthly Expense Chart
        const monthlyCanvas = document.getElementById('monthlyChart');
        if (monthlyCanvas) {
            new Chart(monthlyCanvas, {
                type: 'line',
                data: {
                    labels: monthlyLabels,
                    datasets: [{
                        label: 'Gasto Total Bruto',
                        data: monthlyData,
                        borderColor: '#60a5fa', // blue-400
                        backgroundColor: 'rgba(96, 165, 250, 0.2)',
                        borderWidth: 2,
                        tension: 0.3,
                        fill: true,
                        pointBackgroundColor: '#3b82f6',
                    }]
                },
                options: chartCommonOptions
            });
        }

        // Activity Expense Chart
        const activityCanvas = document.getElementById('activityChart');
        if (activityCanvas) {
            new Chart(activityCanvas, {
                type: 'bar',
                data: {
                    labels: activityLabels,
                    datasets: [{
                        label: 'Gasto Generado (Aprox. Bruto)',
                        data: activityDataSeries,
                        backgroundColor: [
                            'rgba(248, 113, 113, 0.8)', // red-400
                            'rgba(52, 211, 153, 0.8)', // emerald-400
                            'rgba(251, 191, 36, 0.8)', // amber-400
                            'rgba(167, 139, 250, 0.8)', // violet-400
                            'rgba(56, 189, 248, 0.8)'  // sky-400
                        ],
                        borderWidth: 0,
                        borderRadius: 4
                    }]
                },
                options: chartCommonOptions
            });
        }
    }, 100);
};

// --- Module: Departments ---
const renderDepartments = (container) => {
    container.innerHTML = `
        <div class="header-action">
            <h1>Departamentos</h1>
            <button class="btn btn-primary" id="add-dept-btn">
                <i class="fas fa-plus"></i> Nuevo Departamento
            </button>
        </div>
        <div class="card mt-4">
            <table class="data-table">
                <thead>
                    <tr>
                        <th>Nombre</th>
                        <th style="width: 100px">Acciones</th>
                    </tr>
                </thead>
                <tbody id="dept-table-body">
                    ${state.departments.map((dept, index) => `
                        <tr>
                            <td>${dept.name}</td>
                            <td>
                                <button class="btn-icon delete" onclick="deleteItem('departments', ${index})">
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
                state.departments.push({ name });
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
                        <th>Nombre</th>
                        <th>Cuenta Contable</th>
                        <th style="width: 100px">Acciones</th>
                    </tr>
                </thead>
                <tbody>
                    ${state.operations.map((op, index) => `
                        <tr>
                            <td>${op.name}</td>
                            <td>${op.account}</td>
                            <td>
                                <button class="btn-icon edit" onclick="editOperation(${index})">
                                    <i class="fas fa-edit"></i>
                                </button>
                                <button class="btn-icon delete" onclick="deleteItem('operations', ${index})">
                                    <i class="fas fa-trash"></i>
                                </button>
                            </td>
                        </tr>
                    `).join('')}
                    ${state.operations.length === 0 ? '<tr><td colspan="3" style="text-align:center">No hay operaciones registradas</td></tr>' : ''}
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
        `, () => {
            const name = document.getElementById('op-name').value;
            const account = document.getElementById('op-account').value;
            if (name && account) {
                state.operations.push({ name, account });
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
                        <th>Nombre</th>
                        <th>Valor/Número</th>
                        <th style="width: 100px">Acciones</th>
                    </tr>
                </thead>
                <tbody>
                    ${state.activities.map((act, index) => `
                        <tr>
                            <td>${act.name}</td>
                            <td>$${parseFloat(act.value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                            <td>
                                <button class="btn-icon edit" onclick="editActivity(${index})">
                                    <i class="fas fa-edit"></i>
                                </button>
                                <button class="btn-icon delete" onclick="deleteItem('activities', ${index})">
                                    <i class="fas fa-trash"></i>
                                </button>
                            </td>
                        </tr>
                    `).join('')}
                    ${state.activities.length === 0 ? '<tr><td colspan="3" style="text-align:center">No hay actividades registradas</td></tr>' : ''}
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
                <label>Valor / Número</label>
                <input type="number" id="act-value" class="form-control" placeholder="Ej: 50.00">
            </div>
        `, () => {
            const name = document.getElementById('act-name').value;
            const value = document.getElementById('act-value').value;
            if (name && value) {
                state.activities.push({ name, value });
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
            <button class="btn btn-primary" id="add-emp-btn">
                <i class="fas fa-user-plus"></i> Nuevo Empleado
            </button>
        </div>
        <div class="card mt-4">
            <table class="data-table">
                <thead>
                    <tr>
                        <th>Nombre Completo</th>
                        <th>Cédula/Pasaporte</th>
                        <th>Tipo</th>
                        <th>Departamento</th>
                        <th>Ingreso</th>
                        <th>Salario</th>
                        <th style="width: 100px">Acciones</th>
                    </tr>
                </thead>
                <tbody>
                    ${state.employees.map((emp, index) => `
                        <tr>
                            <td>${emp.firstName} ${emp.lastName}</td>
                            <td>${emp.idNumber}</td>
                            <td><span class="status-badge ${emp.type}">${emp.type === 'fixed' ? 'Fijo' : 'Móvil'}</span></td>
                            <td>${emp.department || '-'}</td>
                            <td>${emp.hireDate || '-'}</td>
                            <td>${emp.type === 'fixed' ? '$' + parseFloat(emp.salary).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : 'N/A'}</td>
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
                                    <button class="btn-icon delete" onclick="deleteItem('employees', ${index})" title="Eliminar">
                                        <i class="fas fa-trash"></i>
                                    </button>
                                </div>
                            </td>
                        </tr>
                    `).join('')}
                    ${state.employees.length === 0 ? '<tr><td colspan="6" style="text-align:center">No hay empleados registrados</td></tr>' : ''}
                </tbody>
            </table>
        </div>
    `;

    document.getElementById('add-emp-btn').onclick = () => {
        showModal('Nuevo Empleado', `
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
                        ${state.operations.map(o => `<option value="${o.name}">${o.name}</option>`).join('')}
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
        `, () => {
            const emp = {
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
            };

            if (emp.firstName && emp.idNumber) {
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

const renderTSS = (container) => {
    const accounts = state.settings.payrollAccounts || {};
    const isr = state.settings.isrThresholds || {};

    container.innerHTML = `
        <h1>Configuración</h1>
        <div class="card mt-4" style="max-width: 600px">
            <h3>Seguridad Social / TSS</h3>
            <div class="form-group">
                <label>Tasa de Retención Seguro (%)</label>
                <input type="number" id="tss-rate" class="form-control" value="${(state.settings.tss_rate || 0.05) * 100}">
            </div>
            
            <h3 class="mt-4">Cuentas Contables (Operaciones Defecto)</h3>
            <div class="form-group">
                <label>Incentivos</label>
                <select id="acc-inc" class="form-control">
                    <option value="">Seleccionar...</option>
                    ${state.operations.map(op => `<option value="${op.name}" ${accounts.incentives === op.name ? 'selected' : ''}>${op.name} (${op.account})</option>`).join('')}
                </select>
            </div>
            <div class="form-group">
                <label>Horas Extras</label>
                <select id="acc-ot" class="form-control">
                    <option value="">Seleccionar...</option>
                    ${state.operations.map(op => `<option value="${op.name}" ${accounts.overtime === op.name ? 'selected' : ''}>${op.name} (${op.account})</option>`).join('')}
                </select>
            </div>
            <div class="form-group">
                <label>Descuentos</label>
                <select id="acc-disc" class="form-control">
                    <option value="">Seleccionar...</option>
                    ${state.operations.map(op => `<option value="${op.name}" ${accounts.discounts === op.name ? 'selected' : ''}>${op.name} (${op.account})</option>`).join('')}
                </select>
            </div>
            <div class="form-group">
                <label>Salario Navidad</label>
                <select id="acc-chr" class="form-control">
                    <option value="">Seleccionar...</option>
                    ${state.operations.map(op => `<option value="${op.name}" ${accounts.christmas === op.name ? 'selected' : ''}>${op.name} (${op.account})</option>`).join('')}
                </select>
            </div>

            <h3 class="mt-4">Escalas de ISR (Anual)</h3>
            <p class="text-xs text-gray mb-2">Configure los límites anuales para el cálculo del ISR.</p>
            
            <div class="form-group">
                <label>Exento Hasta (RD$)</label>
                <input type="number" id="isr-exempt" class="form-control" value="${isr.exempt || 416220.00}">
            </div>
            <div class="form-group">
                <label>Tramo 15% Hasta (RD$)</label>
                <input type="number" id="isr-mid" class="form-control" value="${isr.mid || 624329.00}">
            </div>
            <div class="form-group">
                <label>Tramo 20% Hasta (RD$)</label>
                <input type="number" id="isr-high" class="form-control" value="${isr.high || 867123.00}">
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label>Base Fija T2 (RD$)</label>
                    <input type="number" id="isr-base1" class="form-control" value="${isr.base1 || 31216.00}">
                </div>
                <div class="form-group">
                    <label>Base Fija T3 (RD$)</label>
                    <input type="number" id="isr-base2" class="form-control" value="${isr.base2 || 79776.00}">
                </div>
            </div>
            
            <button class="btn btn-primary mt-4" id="save-settings">Guardar Configuración</button>
        </div>
    `;

    document.getElementById('save-settings').onclick = () => {
        state.settings.tss_rate = parseFloat(document.getElementById('tss-rate').value) / 100;
        state.settings.payrollAccounts = {
            incentives: document.getElementById('acc-inc').value,
            overtime: document.getElementById('acc-ot').value,
            discounts: document.getElementById('acc-disc').value,
            christmas: document.getElementById('acc-chr').value
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
                                <button class="btn-icon delete" onclick="deleteItem('periods', ${index})">
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
                state.periods.push({ name, frequency });
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
                    <th>Empleado</th>
                    <th>Monto</th>
                    <th>Concepto</th>
                    <th style="width: 100px">Acciones</th>
                </tr>
            </thead>
            <tbody>
                ${state.discounts.map((d, index) => `
                        <tr>
                            <td>${d.employeeName}</td>
                            <td>$${parseFloat(d.amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                            <td>${d.reason}</td>
                            <td>
                                <button class="btn-icon delete" onclick="deleteItem('discounts', ${index})">
                                    <i class="fas fa-trash"></i>
                                </button>
                            </td>
                        </tr>
                    `).join('')}
                ${state.discounts.length === 0 ? '<tr><td colspan="4" style="text-align:center">No hay descuentos registrados</td></tr>' : ''}
            </tbody>
        </table>
    </div>
`;

    document.getElementById('add-disc-btn').onclick = () => {
        showModal('Crear Descuento', `
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
                employeeName: document.getElementById('disc-emp').value,
                amount: document.getElementById('disc-amount').value,
                reason: document.getElementById('disc-reason').value,
                operation: state.settings.payrollAccounts?.discounts || ''
            };
            if (d.employeeName && d.amount) {
                state.discounts.push(d);
                saveState();
                renderSection('discounts');
                hideModal();
            }
        });
    };
};

// --- Module: Overtime ---
const renderOvertime = (container) => {
    container.innerHTML = `
        <div class="header-action">
        <h1>Horas Extras</h1>
        </div>
        <div class="card mt-4">
            <div class="form-row">
                <div class="form-group">
                    <label>Fecha</label>
                    <input type="date" id="ot-date" class="form-control" value="${new Date().toISOString().split('T')[0]}">
                </div>
                <div class="form-group">
                    <label>Empleado</label>
                    <select id="ot-emp" class="form-control">
                        ${state.employees.filter(e => e.type === 'fixed').map(e => `<option value="${e.firstName} ${e.lastName}" data-salary="${e.salary}">${e.firstName} ${e.lastName}</option>`).join('')}
                    </select>
                </div>
            </div>
            <div class="form-row mt-2">
                <div class="form-group">
                    <label>Cant. Horas</label>
                    <input type="number" id="ot-hours" class="form-control" placeholder="0">
                </div>
                <div class="form-group">
                    <label>Factor (Ej: 1.35)</label>
                    <input type="number" id="ot-factor" class="form-control" value="1.35" step="0.01">
                </div>
            </div>
            <div id="ot-result" class="mt-4 p-4 glass-bg rounded-md hidden">
                <h3>Resumen de Pago: <span id="ot-pay-value" class="text-accent"></span></h3>
            </div>
            <button class="btn btn-primary mt-4" id="calc-ot">Calcular y Registrar</button>
        </div>

        <div class="card mt-4">
            <h3>Horas Extras Registradas</h3>
            <table class="data-table">
                <thead>
                    <tr>
                        <th>Fecha</th>
                        <th>Empleado</th>
                        <th>Horas</th>
                        <th>Factor</th>
                        <th>Monto</th>
                        <th style="width: 100px">Acciones</th>
                    </tr>
                </thead>
                <tbody>
                    ${state.overtime.map((ot, index) => `
                        <tr>
                            <td>${ot.date}</td>
                            <td>${ot.employeeName}</td>
                            <td>${ot.hours}</td>
                            <td>${ot.factor}</td>
                            <td>$${parseFloat(ot.amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                            <td>
                                <button class="btn-icon delete" onclick="deleteItem('overtime', ${index})">
                                    <i class="fas fa-trash"></i>
                                </button>
                            </td>
                        </tr>
                    `).join('')}
                    ${state.overtime.length === 0 ? '<tr><td colspan="6" style="text-align:center">No hay registros de horas extras</td></tr>' : ''}
                </tbody>
            </table>
        </div>
`;

    document.getElementById('calc-ot').onclick = () => {
        const empSelect = document.getElementById('ot-emp');
        const salary = parseFloat(empSelect.selectedOptions[0].dataset.salary);
        const hours = parseFloat(document.getElementById('ot-hours').value);
        const factor = parseFloat(document.getElementById('ot-factor').value);
        const date = document.getElementById('ot-date').value;

        if (salary && hours && date) {
            const hourlyRate = (salary / 23.83) / 8;
            const extraPay = hourlyRate * hours * factor;

            const ot = {
                date: date,
                employeeName: empSelect.value,
                hours: hours,
                factor: factor,
                amount: extraPay.toFixed(2)
            };

            state.overtime.push(ot);
            saveState();
            renderSection('overtime');
        } else {
            alert('Por favor complete todos los campos.');
        }
    };
};

// --- Module: Incentives ---
const renderIncentives = (container) => {
    container.innerHTML = `
        <div class="header-action">
            <h1>Incentivos</h1>
            <button class="btn btn-primary" id="add-inc-btn">
                <i class="fas fa-gift"></i> Aplicar Incentivo
            </button>
        </div>
    <div class="card mt-4">
        <table class="data-table">
            <thead>
                <tr>
                    <th>Fecha</th>
                    <th>Empleado</th>
                    <th>Monto</th>
                    <th>Motivo</th>
                    <th style="width: 100px">Acciones</th>
                </tr>
            </thead>
            <tbody>
                ${state.incentives.map((inc, index) => `
                        <tr>
                            <td>${inc.date}</td>
                            <td>${inc.employeeName}</td>
                            <td>$${parseFloat(inc.amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                            <td>${inc.reason}</td>
                            <td>
                                <button class="btn-icon delete" onclick="deleteItem('incentives', ${index})">
                                    <i class="fas fa-trash"></i>
                                </button>
                            </td>
                        </tr>
                    `).join('')}
                ${state.incentives.length === 0 ? '<tr><td colspan="5" style="text-align:center">No hay incentivos registrados</td></tr>' : ''}
            </tbody>
        </table>
    </div>
`;

    document.getElementById('add-inc-btn').onclick = () => {
        showModal('Aplicar Incentivo', `
            <div class="form-group">
                <label>Fecha</label>
                <input type="date" id="inc-date" class="form-control" value="${new Date().toISOString().split('T')[0]}">
            </div>
            <div class="form-group">
                <label>Empleado</label>
                <select id="inc-emp" class="form-control">
                    ${state.employees.map(e => `<option value="${e.firstName} ${e.lastName}">${e.firstName} ${e.lastName}</option>`).join('')}
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
                operation: state.settings.payrollAccounts?.incentives || ''
            };
            if (inc.employeeName && inc.amount && inc.date) {
                state.incentives.push(inc);
                saveState();
                renderSection('incentives');
                hideModal();
            }
        });
    };
};

// ... More modules in next turn ...

// --- Module: Payroll Runs (Abrir Nómina) ---
const renderPayrollRuns = (container) => {
    container.innerHTML = `
        <div class="header-action">
            <h1>Gestión de Pagos (Nóminas)</h1>
            <button class="btn btn-primary" id="open-payroll-btn">
                <i class="fas fa-play"></i> Abrir Nueva Nómina
            </button>
        </div>
    <div class="card mt-4">
        <div id="active-payroll-info">
            ${state.activePayroll ? `
                    <div class="status-box success">
                        <h3>Nómina Actual: ${state.activePayroll.name}</h3>
                        <p>Periodo: ${state.activePayroll.periodType} | Inicio: ${state.activePayroll.startDate}</p>
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
                <select id="run-period" class="form-control">
                    ${state.periods.map(p => `<option value="${p.name}">${p.name} (${p.frequency})</option>`).join('')}
                </select>
            </div>
            <div class="form-group">
                <label>Fecha de Inicio del Pago</label>
                <input type="date" id="run-date" class="form-control">
            </div>
`, () => {
            state.activePayroll = {
                id: Date.now(),
                name: document.getElementById('run-name').value,
                periodType: document.getElementById('run-period').value,
                startDate: document.getElementById('run-date').value,
                status: 'open',
                dailyLogs: []
            };
            saveState();
            renderSection('payroll-runs');
            hideModal();
        });
    };
};

// --- Module: Daily Registration ---
const renderDailyRegistration = (container) => {
    if (!state.activePayroll) {
        container.innerHTML = '<h1>Registro Diario</h1><div class="card mt-4"><p class="text-danger">Debe abrir una nómina primero en la sección "Abrir Nómina".</p></div>';
        return;
    }

    const bounds = getPayrollBounds();
    container.innerHTML = `
    <h1>Registro Diario - Empleados Móviles</h1>
        <div class="card mt-4">
            <div class="form-row">
                <div class="form-group">
                    <label>Fecha</label>
                    <input type="date" id="reg-date" class="form-control" 
                           value="${bounds ? bounds.min : new Date().toISOString().split('T')[0]}"
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
                    <select id="reg-emp" class="form-control">
                        ${state.employees.filter(e => e.type === 'mobile').map(e => `<option value="${e.firstName} ${e.lastName}">${e.firstName} ${e.lastName}</option>`).join('')}
                    </select>
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label>Operación</label>
                    <select id="reg-op" class="form-control">
                        ${state.operations.map(o => `<option value="${o.name}">${o.name}</option>`).join('')}
                    </select>
                </div>
                <div class="form-group">
                    <label>Actividad</label>
                    <select id="reg-act" class="form-control">
                        ${state.activities.map(a => `<option value="${a.name}">${a.name}</option>`).join('')}
                    </select>
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
                        <option value="no">No — Sin descuento TSS</option>
                    </select>
                </div>
            </div>
            <button class="btn btn-primary" id="save-daily">Registrar Día de Trabajo</button>
        </div>

        <div class="card mt-4">
            <h3>Registros del Periodo Actual</h3>
            <table class="data-table">
                <thead>
                    <tr>
                        <th>Fecha</th>
                        <th>Empleado</th>
                        <th>Operación</th>
                        <th>Monto</th>
                        <th>TSS</th>
                        <th style="width: 100px">Acciones</th>
                    </tr>
                </thead>
                <tbody>
                    ${(state.activePayroll.dailyLogs || []).map((log, index) => `
                        <tr>
                            <td>${log.date}</td>
                            <td>${log.employee}</td>
                            <td>${log.op}</td>
                            <td>$${parseFloat(log.amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                            <td>${log.applyTSS === 'si' ? '<span class="status-badge fixed">Sí</span>' : '<span class="status-badge mobile">No</span>'}</td>
                            <td>
                                <button class="btn-icon edit" onclick="editDailyLog(${index})">
                                    <i class="fas fa-edit"></i>
                                </button>
                                <button class="btn-icon delete" onclick="deleteDailyLog(${index})">
                                    <i class="fas fa-trash"></i>
                                </button>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
`;

    document.getElementById('save-daily').onclick = () => {
        const empName = document.getElementById('reg-emp').value;
        const regDate = document.getElementById('reg-date').value;

        // Validation: Hire Date
        const employee = state.employees.find(e => `${e.firstName} ${e.lastName} ` === empName);
        if (employee && employee.hireDate && regDate < employee.hireDate) {
            alert(`No se puede registrar labor antes de la fecha de ingreso del empleado (${employee.hireDate})`);
            return;
        }

        const log = {
            date: regDate,
            employee: empName,
            op: document.getElementById('reg-op').value,
            act: document.getElementById('reg-act').value,
            amount: document.getElementById('reg-amount').value,
            applyTSS: document.getElementById('reg-tss').value
        };

        if (log.employee && log.amount) {
            if (!state.activePayroll.dailyLogs) state.activePayroll.dailyLogs = [];
            state.activePayroll.dailyLogs.push(log);
            saveState();
            renderSection('daily-registration');
            alert('Registro guardado');
        }
    };

    const deptSelect = document.getElementById('reg-dept');
    const empSelect = document.getElementById('reg-emp');
    deptSelect.onchange = () => {
        const selectedDept = deptSelect.value;
        const filteredEmps = state.employees.filter(e =>
            e.type === 'mobile' && (selectedDept === 'all' || e.department === selectedDept)
        );
        empSelect.innerHTML = filteredEmps.map(e =>
            `<option value="${e.firstName} ${e.lastName}">${e.firstName} ${e.lastName}</option>`
        ).join('');
    };
};

// --- Module: Closing ---
const renderClosing = (container) => {
    container.innerHTML = `
    <h1>Cierre de Nómina</h1>
        <div class="card mt-4">
            <p>Al cerrar la nómina, los registros del periodo actual quedarán bloqueados y no podrán ser modificados.</p>
            ${state.activePayroll ? `
                <div class="mt-4">
                    <button class="btn btn-danger" id="close-payroll-btn">
                        <i class="fas fa-lock"></i> Cerrar Nómina Actual (${state.activePayroll.name})
                    </button>
                </div>
            ` : '<p class="mt-4">No hay ninguna nómina abierta para cerrar.</p>'}
        </div>
`;

    if (state.activePayroll) {
        document.getElementById('close-payroll-btn').onclick = () => {
            if (confirm('¿Está seguro que desea cerrar esta nómina? Los montos calculados se guardarán en el historial para fines de Regalía Pascual.')) {

                // Save snapshots of each employee results
                const bounds = getPayrollBounds();
                const snapshot = {
                    payrollName: state.activePayroll.name,
                    periodStart: bounds.min,
                    periodEnd: bounds.max,
                    closedAt: new Date().toISOString(),
                    results: state.employees.map(emp => {
                        const res = calculateEmployeePayrollData(emp, state.activePayroll);
                        return {
                            idNumber: emp.idNumber,
                            fullName: `${emp.firstName} ${emp.lastName}`,
                            firstName: emp.firstName,
                            lastName: emp.lastName,
                            type: emp.type,
                            dept: emp.department,
                            base: res.base,
                            incentives: res.inc,
                            overtime: res.ot,
                            christmas: res.chr,
                            brute: res.brute,
                            tss: res.tss,
                            isr: res.isr,
                            disc: res.disc,
                            net: res.net
                        };
                    })
                };

                state.payrollHistory.push(snapshot);
                state.activePayroll = null;
                saveState();
                renderSection('closing');
                alert('La nómina ha sido cerrada y guardada en el historial.');
            }
        };
    } else {
        container.innerHTML += `
            <div class="card mt-4" style="text-align: center; padding: 40px;">
                <i class="fas fa-check-circle" style="font-size: 48px; color: var(--success); margin-bottom: 20px;"></i>
                <h2>No hay ninguna nómina abierta actualmente.</h2>
                <p class="text-gray">Puede crear un nuevo periodo desde la sección de "Periodos".</p>
            </div>
        `;
    }

    // --- Section: Historical Payrolls ---
    container.innerHTML += `
        <div class="mt-5">
            <h2 class="mb-4"><i class="fas fa-history"></i> Historial de Nóminas Cerradas</h2>
            <div class="card">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>Nombre de la Nómina</th>
                            <th>Periodo</th>
                            <th>Fecha de Cierre</th>
                            <th style="text-align: center">Acciones</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${state.payrollHistory.length > 0 ?
            state.payrollHistory.slice().reverse().map((run, i) => `
                                <tr>
                                    <td style="font-weight: 500">${run.payrollName}</td>
                                    <td>${run.periodStart} al ${run.periodEnd}</td>
                                    <td>${new Date(run.closedAt).toLocaleString()}</td>
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
            '<tr><td colspan="4" style="text-align: center; padding: 20px;">No hay nóminas cerradas en el historial.</td></tr>'
        }
                    </tbody>
                </table>
            </div>
        </div>
    `;
};

window.printHistoricalPayroll = (index) => {
    window.viewHistoricalPayroll(index);
    setTimeout(() => {
        window.print();
    }, 500);
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
                <tr>
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
                </tr>
            `;
        }).join('');

        reportHtml += `
            <div class="dept-report-section mb-4">
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
            </div>
        `;
    });

    contentArea.innerHTML = `
        <div class="header-action no-print">
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
            <button class="btn btn-primary" onclick="window.print()">
                <i class="fas fa-print"></i> Imprimir Reporte
            </button>
        </div>

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

// --- Utility: Payroll Calculation ---
const calculateEmployeePayrollData = (emp, activePayroll) => {
    const bounds = getPayrollBounds();
    const filterByPeriod = (item) => {
        if (!bounds || !item.date) return true;
        return item.date >= bounds.min && item.date <= bounds.max;
    };

    let base = 0;
    let tss = 0;
    const empFullName = `${emp.firstName || ''} ${emp.lastName || ''}`.trim().toLowerCase();

    if (emp.type === 'fixed') {
        const monthlySalary = parseFloat(emp.salary) || 0;
        const dailyRate = monthlySalary / 23.83;
        if (bounds && emp.hireDate) {
            try {
                const periodStart = new Date(bounds.min + 'T00:00:00');
                const periodEnd = new Date(bounds.max + 'T00:00:00');
                const hireDate = new Date(emp.hireDate + 'T00:00:00');
                const effectiveStart = hireDate > periodStart ? hireDate : periodStart;
                if (effectiveStart > periodEnd) {
                    base = 0;
                } else {
                    const workedDays = Math.round((periodEnd - effectiveStart) / (1000 * 60 * 60 * 24)) + 1;
                    base = dailyRate * workedDays;
                }
            } catch (e) { base = monthlySalary; }
        } else {
            base = monthlySalary;
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
    const disc = (state.discounts || []).filter(d => (d.employeeName || '').trim().toLowerCase() === empFullName).reduce((a, c) => a + (parseFloat(c.amount) || 0), 0);
    const chr = (state.christmasSalary || []).filter(c => (c.employeeName || '').trim().toLowerCase() === empFullName).reduce((a, c) => a + (parseFloat(c.amount) || 0), 0);

    const brute = base + inc + ot + chr;
    const taxableIncome = (base + inc + ot) - tss;
    const isr = calculateMonthlyISR(taxableIncome);
    const net = brute - tss - disc - isr;

    return { base, tss, inc, ot, disc, chr, brute, isr, net };
};

// --- Module: Reports ---
const renderReports = (container) => {
    if (!window.currentReportFilter || !Array.isArray(window.currentReportFilter)) {
        window.currentReportFilter = state.departments.map(d => d.name);
    }
    const filter = window.currentReportFilter;
    const currentTab = window.currentReportTab || 'departments';

    let html = `
        <div class="header-action">
            <div style="display: flex; align-items: center; gap: 20px;">
                <h1>Reportes</h1>
                
                <div class="tabs no-print" style="display: flex; gap: 10px; background: var(--glass-bg); padding: 5px; border-radius: 8px;">
                    <button class="btn ${currentTab === 'departments' ? 'btn-primary' : 'btn-secondary'}" onclick="window.setReportTab('departments')">
                        <i class="fas fa-sitemap"></i> Por Departamento
                    </button>
                    <button class="btn ${currentTab === 'operations' ? 'btn-primary' : 'btn-secondary'}" onclick="window.setReportTab('operations')">
                        <i class="fas fa-cogs"></i> Operaciones vs Actividad
                    </button>
                </div>
    `;

    if (currentTab === 'departments') {
        html += `
                <div class="multi-select-container no-print" id="dept-multi-select">
                    <div class="multi-select-btn" onclick="this.parentElement.classList.toggle('active')">
                        ${filter.length === state.departments.length ? 'Todos los Departamentos' : (filter.length === 0 ? 'Ningun Departamento' : `${filter.length} Seleccionados`)}
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
        `;
    }

    html += `
            </div>
            <button class="btn btn-secondary" onclick="window.print()">
                <i class="fas fa-print"></i> Imprimir Reporte
            </button>
        </div>
        
    <div class="card mt-4 print-area">
    `;

    if (currentTab === 'departments') {
        html += `
        <h2 style="text-align: center">Resumen de Pagos por Departamento</h2>
        <hr class="mt-4 mb-4" style="border: 0.5px solid var(--border-color)">
        `;

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

        const bounds = getPayrollBounds();
        const filterByPeriod = (item) => {
            if (!bounds || !item.date) return true;
            return item.date >= bounds.min && item.date <= bounds.max;
        };

        const filteredDepts = state.departments.filter(d => filter.includes(d.name));

        filteredDepts.forEach(dept => {
            const deptName = (dept.name || '').trim().toLowerCase();
            const deptEmps = state.employees.filter(e => (e.department || '').trim().toLowerCase() === deptName);
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

                const res = calculateEmployeePayrollData(emp, state.activePayroll);

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
                                    <td class="td-numeric" style="font-weight: bold">$${deptNet.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                `;
        });

        if (filter.length === state.departments.length) {
            const missingEmps = state.employees.filter(e => {
                const empId = e.idNumber || `${e.firstName}-${e.lastName}`;
                return !renderedEmpIds.has(empId);
            });

            if (missingEmps.length > 0) {
                reportHtml += `
                        <div class="dept-report-section mb-4" style="border: 1px dashed var(--warning); padding: 10px;">
                            <h3 style="color: var(--warning)">Otros Empleados (Sin departamento o desajustado)</h3>
                            <table class="data-table">
                                <thead>
                                    <tr><th>Nombre</th><th>Departamento Actual</th><th>Nota</th></tr>
                                </thead>
                                <tbody>
                                    ${missingEmps.map(emp => `<tr><td>${emp.firstName} ${emp.lastName}</td><td>${emp.department || 'Sin Dept.'}</td><td>Revisar asignación en lista de empleados</td></tr>`).join('')}
                                </tbody>
                            </table>
                        </div>
                    `;
            }
        }

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
        }

        html += reportHtml;

        if (state.employees.length === 0) {
            html += '<p style="text-align: center">No hay datos para mostrar en el reporte.</p>';
        }

    } else {
        html += `
        <h2 style="text-align: center">Comparativa de Operaciones por Actividad (Histórico + Actual)</h2>
        <hr class="mt-4 mb-4" style="border: 0.5px solid var(--border-color)">
        `;

        const opStats = {};

        const processCost = (opName, actName, amount) => {
            const op = opName || 'Sin Operación';
            const act = actName || 'Sin Actividad';
            if (!opStats[op]) opStats[op] = { total: 0, activities: {} };
            if (!opStats[op].activities[act]) opStats[op].activities[act] = 0;

            opStats[op].total += amount;
            opStats[op].activities[act] += amount;
        };

        if (state.activePayroll && state.activePayroll.dailyLogs) {
            state.activePayroll.dailyLogs.forEach(log => {
                processCost(log.op, log.act, parseFloat(log.amount) || 0);
            });
        }
        if (state.activePayroll) {
            state.employees.filter(e => e.type === 'fixed' && e.active !== false).forEach(emp => {
                const res = calculateEmployeePayrollData(emp, state.activePayroll);
                processCost(emp.operation, emp.activity, res.base || 0);
            });
        }

        state.payrollHistory.forEach(run => {
            run.results.forEach(res => {
                const emp = state.employees.find(e => e.idNumber === res.idNumber || `${e.firstName} ${e.lastName}` === res.fullName);
                const actName = emp ? emp.activity : 'Sin Actividad';
                const opName = emp ? emp.operation : 'Sin Operación';
                processCost(opName, actName, res.brute || 0);
            });
        });

        html += '<table class="data-table"><thead><tr><th>Operación</th><th>Actividad</th><th class="text-right">Costo Total (Mano de Obra)</th></tr></thead><tbody>';
        let grantTotal = 0;

        Object.keys(opStats).sort().forEach(op => {
            const data = opStats[op];
            const count = Object.keys(data.activities).length;
            let first = true;

            grantTotal += data.total;

            Object.keys(data.activities).sort((a, b) => data.activities[b] - data.activities[a]).forEach(act => {
                html += '<tr>';
                if (first) {
                    html += `<td rowspan="${count}" style="vertical-align: middle; font-weight: bold; border-right: 1px solid var(--border-color)">${op}</td>`;
                    first = false;
                }
                html += `<td>${act}</td><td class="text-right td-numeric">$${data.activities[act].toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td></tr>`;
            });

            html += `<tr style="background: rgba(255,255,255,0.05); font-weight: bold;">
                <td class="text-right">SUBTOTAL OPERACIÓN:</td>
                <td class="text-right td-numeric" style="color: var(--primary)">$${data.total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
            </tr>`;
        });

        html += `</tbody><tfoot><tr style="font-size: 1.1rem; border-top: 2px solid var(--primary)">
            <td colspan="2" class="text-right">TOTAL GENERAL:</td>
            <td class="text-right td-numeric" style="color: #4ade80">$${grantTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
        </tr></tfoot></table>`;
    }

    html += `</div>`;
    container.innerHTML = html;
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

// --- Module: Christmas Salary ---
const renderChristmasSalary = (container) => {
    const currentYear = new Date().getFullYear();

    // Calculate data for each employee
    const christmasData = state.employees.map(emp => {
        const empId = emp.idNumber;
        const empName = `${emp.firstName} ${emp.lastName}`;

        // Sum earnings from history for this year
        let accumulated = 0;
        state.payrollHistory.forEach(run => {
            const runYear = new Date(run.periodStart).getFullYear();
            if (runYear === currentYear) {
                const res = run.results.find(r => r.employeeId === empId);
                if (res) {
                    accumulated += (res.base + res.incentives + res.overtime);
                }
            }
        });

        const calculated = accumulated / 12;

        return {
            id: empId,
            name: empName,
            accumulated: accumulated,
            calculated: calculated,
            agreement: 'si',
            manualAmount: calculated.toFixed(2)
        };
    });

    container.innerHTML = `
        <div class="header-action">
            <h1>Salario de Navidad (Regalía Pascual) - Año ${currentYear}</h1>
            <div class="action-group" style="gap: 10px">
                <select id="chr-payment-mode" class="form-control" style="width: 250px">
                    <option value="current">Agregar a Nómina Abierta</option>
                    <option value="new">Crear Nómina Solo Regalía</option>
                </select>
                <button class="btn btn-primary" id="process-christmas-btn">
                    <i class="fas fa-check-circle"></i> Procesar Pagos Seleccionados
                </button>
            </div>
        </div>
        
        <div class="card mt-4">
            <p class="mb-4 text-gray">Este módulo calcula el acumulado del salario bruto (Sueldo + Incentivos + Extras) percibido durante el año actual y lo divide entre 12.</p>
            <table class="data-table">
                <thead>
                    <tr>
                        <th style="width: 40px"><input type="checkbox" id="select-all-chr"></th>
                        <th>Empleado</th>
                        <th style="text-align: right">Acumulado Anual</th>
                        <th style="text-align: right">Calculado (Acum/12)</th>
                        <th>¿De Acuerdo?</th>
                        <th style="text-align: right">Monto a Pagar</th>
                    </tr>
                </thead>
                <tbody>
                    ${christmasData.map((d, i) => `
                        <tr>
                            <td><input type="checkbox" class="chr-select" data-index="${i}"></td>
                            <td>${d.name}</td>
                            <td style="text-align: right">$${d.accumulated.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                            <td style="text-align: right; font-weight: bold">$${d.calculated.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                            <td>
                                <select class="form-control chr-agreement" data-index="${i}" style="width: 80px">
                                    <option value="si">SÍ</option>
                                    <option value="no">NO</option>
                                </select>
                            </td>
                            <td style="text-align: right">
                                <input type="number" class="form-control chr-manual-amount" data-index="${i}" 
                                       value="${d.manualAmount}" style="width: 120px; text-align: right" disabled>
                            </td>
                        </tr>
                    `).join('')}
                    ${christmasData.length === 0 ? '<tr><td colspan="6" style="text-align:center">No hay empleados registrados</td></tr>' : ''}
                </tbody>
            </table>
        </div>
    `;

    // Internal logic for the module
    const agreementSelects = container.querySelectorAll('.chr-agreement');
    agreementSelects.forEach(select => {
        select.onchange = (e) => {
            const index = e.target.dataset.index;
            const input = container.querySelector(`.chr-manual-amount[data-index="${index}"]`);
            input.disabled = (e.target.value === 'si');
            if (e.target.value === 'si') {
                input.value = christmasData[index].calculated.toFixed(2);
            }
        };
    });

    document.getElementById('select-all-chr').onclick = (e) => {
        const checks = container.querySelectorAll('.chr-select');
        checks.forEach(c => c.checked = e.target.checked);
    };

    document.getElementById('process-christmas-btn').onclick = () => {
        const selectedIndices = Array.from(container.querySelectorAll('.chr-select:checked')).map(c => parseInt(c.dataset.index));
        if (selectedIndices.length === 0) {
            alert('Por favor seleccione al menos un empleado.');
            return;
        }

        const mode = document.getElementById('chr-payment-mode').value;
        if (mode === 'current' && !state.activePayroll) {
            alert('Debe tener una nómina abierta para usar esta opción.');
            return;
        }

        if (!confirm(`¿Está seguro que desea procesar el pago de navidad para ${selectedIndices.length} empleados?`)) return;

        const payments = selectedIndices.map(idx => {
            const amt = parseFloat(container.querySelector(`.chr-manual-amount[data-index="${idx}"]`).value);
            return {
                employeeName: christmasData[idx].name,
                amount: amt,
                date: new Date().toISOString().split('T')[0],
                reason: `Regalía Pascual ${currentYear}`,
                operation: state.settings.payrollAccounts?.christmas || ''
            };
        });

        if (mode === 'current') {
            state.christmasSalary.push(...payments);
            saveState();
            alert('Pagos agregados a la nómina abierta.');
            renderSection('christmas-salary');
        } else {
            // Create a dedicated Christmas Payroll
            const newPayroll = {
                id: Date.now(),
                name: `REGALÍA PASCUAL ${currentYear}`,
                periodType: 'Especial (Navidad)',
                startDate: new Date().toISOString().split('T')[0],
                status: 'open',
                dailyLogs: [],
                isChristmasOnly: true,
                payments: payments
            };
            // Note: Currently state.activePayroll only supports one active. 
            // In a more complex app, we'd handle multiple or replace current.
            // For now, let's just push to christmasSalary and notify.
            state.christmasSalary.push(...payments);
            saveState();
            alert('Se han procesado los pagos como regalía pascual.');
            renderSection('christmas-salary');
        }
    };
};

window.quickAddChristmasSalary = (empName) => {
    switchSection('christmas-salary');
    // In a final version, we could auto-filter or highlight the employee
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
    const log = state.activePayroll.dailyLogs[index];
    const bounds = getPayrollBounds();
    showModal('Editar Registro Diario', `
        <div class="form-row">
            <div class="form-group">
                <label>Fecha</label>
                <input type="date" id="edit-reg-date" class="form-control" value="${log.date}"
                       ${bounds ? `min="${bounds.min}" max="${bounds.max}"` : ''}>
            </div>
            <div class="form-group">
                <label>Empleado</label>
                <select id="edit-reg-emp" class="form-control">
                    ${state.employees.filter(e => e.type === 'mobile').map(e => `<option value="${e.firstName} ${e.lastName}" ${log.employee === (e.firstName + ' ' + e.lastName) ? 'selected' : ''}>${e.firstName} ${e.lastName}</option>`).join('')}
                </select>
            </div>
        </div>
        <div class="form-row">
            <div class="form-group">
                <label>Operación</label>
                <select id="edit-reg-op" class="form-control">
                    ${state.operations.map(o => `<option value="${o.name}" ${log.op === o.name ? 'selected' : ''}>${o.name}</option>`).join('')}
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
            state.activePayroll.dailyLogs[index] = updatedLog;
            saveState();
            renderSection('daily-registration');
            hideModal();
            alert('Registro actualizado');
        }
    });
};

window.deleteDailyLog = (index) => {
    if (confirm('¿Seguro que desea eliminar este registro diario?')) {
        state.activePayroll.dailyLogs.splice(index, 1);
        saveState();
        renderSection('daily-registration');
    }
};

window.editEmployee = (index) => {
    const emp = state.employees[index];
    showModal('Editar Empleado', `
        <div class="form-row">
            <div class="form-group">
                <label>Nombres</label>
                <input type="text" id="edit-emp-fn" class="form-control" value="${emp.firstName}">
            </div>
            <div class="form-group">
                <label>Apellidos</label>
                <input type="text" id="edit-emp-ln" class="form-control" value="${emp.lastName}">
            </div>
        </div>
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
                    ${state.operations.map(o => `<option value="${o.name}" ${emp.operation === o.name ? 'selected' : ''}>${o.name}</option>`).join('')}
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
`, () => {
        const updatedEmp = {
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
        };

        if (updatedEmp.firstName && updatedEmp.idNumber) {
            state.employees[index] = updatedEmp;
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

window.editOperation = (index) => {
    const op = state.operations[index];
    showModal('Editar Operación', `
        <div class="form-group">
            <label>Nombre de la Operación</label>
            <input type="text" id="edit-op-name" class="form-control" value="${op.name}">
        </div>
        <div class="form-group">
            <label>Número de Cuenta Contable</label>
            <input type="text" id="edit-op-account" class="form-control" value="${op.account}">
        </div>
`, () => {
        const name = document.getElementById('edit-op-name').value;
        const account = document.getElementById('edit-op-account').value;
        if (name && account) {
            state.operations[index] = { name, account };
            saveState();
            renderSection('operations');
            hideModal();
        }
    });
};

window.editActivity = (index) => {
    const act = state.activities[index];
    showModal('Editar Actividad', `
        <div class="form-group">
            <label>Nombre de la Actividad</label>
            <input type="text" id="edit-act-name" class="form-control" value="${act.name}">
        </div>
        <div class="form-group">
            <label>Valor / Número</label>
            <input type="number" id="edit-act-value" class="form-control" value="${act.value}">
        </div>
`, () => {
        const name = document.getElementById('edit-act-name').value;
        const value = document.getElementById('edit-act-value').value;
        if (name && value) {
            state.activities[index] = { name, value };
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

window.deleteEmployee = (index) => {
    if (confirm('¿Seguro que desea eliminar este empleado?')) {
        state.employees.splice(index, 1);
        saveState();
        renderSection('employees');
    }
};

// --- Quick Action Helpers ---
window.quickAddIncentive = (employeeName) => {
    showModal('Aplicar Incentivo', `
        <div class="form-group">
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
            date: document.getElementById('inc-date').value,
            employeeName: document.getElementById('inc-emp').value,
            amount: document.getElementById('inc-amount').value,
            reason: document.getElementById('inc-reason').value,
            operation: state.settings.payrollAccounts?.incentives || ''
        };
        if (inc.employeeName && inc.amount && inc.date) {
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
        <div class="form-group">
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
            const hourlyRate = (salary / 23.83) / 8;
            const extraPay = hourlyRate * hours * factor;
            state.overtime.push({
                date,
                employeeName,
                hours,
                factor,
                amount: extraPay,
                operation: state.settings.payrollAccounts?.overtime || ''
            });
            saveState();
            renderSection('overtime');
            hideModal();
            saveState();
            renderSection('employees');
            hideModal();
            alert('Horas extras registradas');
        }
    });
};

window.quickAddDiscount = (employeeName) => {
    showModal('Crear Descuento', `
        <div class="form-group">
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
        <div class="form-group">
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

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    initRouter();
    document.getElementById('current-date').innerText = new Date().toLocaleDateString();
    switchSection('dashboard');
});
