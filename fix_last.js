const fs = require('fs');
let content = fs.readFileSync('app.js', 'utf8');

const targetStr = `        }
    });

    container.innerHTML = \``;
const replaceStr = `        }
    });

    window.lastChristmasData = christmasData;

    container.innerHTML = \``;

if (content.includes(targetStr)) {
    content = content.replace(targetStr, replaceStr);
    fs.writeFileSync('app.js', content, 'utf8');
    console.log('Fixed lastChristmasData');
} else {
    console.log('Target not found for lastChristmasData');
}
