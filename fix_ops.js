const fs = require('fs');

let content = fs.readFileSync('app.js', 'utf8');

// 1. Update filters for useInLabor and useInAccounting
content = content.replace(
    /state\.operations\.filter\(o => o\.useInLabor === undefined \|\| o\.useInLabor\)/g,
    'state.operations.filter(o => o.active !== false && (o.useInLabor === undefined || o.useInLabor))'
);

content = content.replace(
    /state\.operations\.filter\(o => o\.useInAccounting === undefined \|\| o\.useInAccounting\)/g,
    'state.operations.filter(o => o.active !== false && (o.useInAccounting === undefined || o.useInAccounting))'
);

// 2. Update print manual sheet operations
content = content.replace(
    /const operations = window\.globalState\?\.operations \|\| state\.operations \|\| \[\];/g,
    'const operations = (window.globalState?.operations || state.operations || []).filter(o => o.active !== false);'
);

// 3. Add toggle function if not exists
if (!content.includes('window.toggleOperationStatus')) {
    const toggle_func = `
window.toggleOperationStatus = (index) => {
    if (state.operations[index]) {
        state.operations[index].active = state.operations[index].active === false ? true : false;
        saveState();
        renderSection('operations');
    }
};
`;
    content = content.replace('const renderOperations = (container) => {', toggle_func + '\nconst renderOperations = (container) => {');
}

// 4. Modify renderOperations HTML table
if (!content.includes('<th>Estado</th>')) {
    content = content.replace(
        '<th>Registrado por</th>\n                        <th style="width: 100px">Acciones</th>',
        '<th>Registrado por</th>\n                        <th>Estado</th>\n                        <th style="width: 100px">Acciones</th>'
    );
    
    const status_td = `
                            <td>\${op.active === false ? '<span class="status-badge mobile" style="background:#ef4444;">Inactiva</span>' : '<span class="status-badge fixed" style="background:#22c55e;">Activa</span>'}</td>
                            <td>
                                <button class="btn-icon" onclick="window.toggleOperationStatus(\${index})" title="Activar/Desactivar">
                                    <i class="fas fa-power-off" style="color: \${op.active === false ? '#9ca3af' : '#22c55e'};"></i>
                                </button>`;
                                
    content = content.replace(
        /<td><small>\$\{op\.createdBy \|\| 'Sistema'\}<\/small><\/td>\s*<td>\s*<button class="btn-icon edit" onclick="editOperation\(\$\{index\}\)">/g,
        `<td><small>\${op.createdBy || 'Sistema'}</small></td>` + status_td + `\n                                <button class="btn-icon edit" onclick="editOperation(\${index})">`
    );
}

fs.writeFileSync('app.js', content, 'utf8');
console.log("Done");
