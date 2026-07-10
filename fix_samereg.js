const fs = require('fs');
let content = fs.readFileSync('app.js', 'utf8');

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
    
    fs.writeFileSync('app.js', content, 'utf8');
    console.log('Added sameReg matching logic.');
} else {
    console.log('Could not find target string for sameReg.');
}
