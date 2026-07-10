const fs = require('fs');
let content = fs.readFileSync('app.js', 'utf8');

const replacement = `                        const rId = String(r.idNumber || '').trim();
                        const rReg = String(r.regNumber || '').trim();
                        const empReg = String(emp.regNumber || '').trim();
                        const sameId = (rId === empId && empId !== '');
                        const sameReg = (rReg === empReg && empReg !== '');
                        const sameName = rName === empName.toLowerCase() || normalizeName(rName) === normalizeName(empName);

                        // Strict: Must match ID AND (Name or part of Name), or Name exactly
                        if (sameName) return true;
                        if (sameId || sameReg) {`;

const startIdx = content.indexOf("const rId = String(r.idNumber || '').trim();");
const endIdx = content.indexOf("if (sameId) {", startIdx) + 13;

if (startIdx !== -1 && endIdx > startIdx) {
    const before = content.substring(0, startIdx);
    const after = content.substring(endIdx);
    content = before + replacement + after;
    fs.writeFileSync('app.js', content, 'utf8');
    console.log('Fixed sameReg!');
} else {
    console.log('Could not find injection point');
}
