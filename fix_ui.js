const fs = require('fs');
let content = fs.readFileSync('app.js', 'utf8');

const regex = /window\.toggleOperationStatus = \(index\) => \{[\s\S]*?renderSection\('operations'\);\s*\}\s*\};\s*<div class="form-group">/m;

const replacement = `window.toggleOperationStatus = (index) => {
    if (state.operations[index]) {
        state.operations[index].active = state.operations[index].active === false ? true : false;
        saveState();
        renderSection('operations');
    }
};

const renderOperations = (container) => {
    container.innerHTML = \`
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
                        <th>Estado</th>
                        <th style="width: 100px">Acciones</th>
                    </tr>
                </thead>
                <tbody>
                    \${state.operations.map((op, index) => \`
                        <tr>
                            <td>OP-\${op.opNumber || (index + 1)}</td>
                            <td>\${op.name}</td>
                            <td>\${op.account}</td>
                            <td>
                                <div style="display: flex; gap: 5px; flex-wrap: wrap;">
                                    \${(op.useInAccounting === undefined || op.useInAccounting) ? '<span class="status-badge fixed" style="font-size: 0.6rem">Contabilidad</span>' : ''}
                                    \${(op.useInLabor === undefined || op.useInLabor) ? '<span class="status-badge mobile" style="font-size: 0.6rem">Fijos/Móviles</span>' : ''}
                                </div>
                            </td>
                            <td><small>\${op.createdBy || 'Sistema'}</small></td>
                            <td>\${op.active === false ? '<span class="status-badge mobile" style="background:#ef4444;">Inactiva</span>' : '<span class="status-badge fixed" style="background:#22c55e;">Activa</span>'}</td>
                            <td>
                                <button class="btn-icon" onclick="window.toggleOperationStatus(\${index})" title="Activar/Desactivar">
                                    <i class="fas fa-power-off" style="color: \${op.active === false ? '#9ca3af' : '#22c55e'};"></i>
                                </button>
                                <button class="btn-icon edit" onclick="editOperation(\${index})">
                                    <i class="fas fa-edit"></i>
                                </button>
                                <button class="btn-icon delete admin-only" onclick="deleteItem('operations', \${index})">
                                    <i class="fas fa-trash"></i>
                                </button>
                            </td>
                        </tr>
                    \`).join('')}
                    \${state.operations.length === 0 ? '<tr><td colspan="7" style="text-align:center">No hay operaciones registradas</td></tr>' : ''}
                </tbody>
            </table>
        </div>
    \`;

    document.getElementById('add-op-btn').onclick = () => {
        showModal('Nueva Operación', \`
            <div class="form-group">
                <label>Nombre de la Operación</label>
                <input type="text" id="op-name" class="form-control" placeholder="Ej: Cosecha">
            </div>
            <div class="form-group">`;

content = content.replace(regex, replacement);
fs.writeFileSync('app.js', content, 'utf8');
console.log("Fixed!");
