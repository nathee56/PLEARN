const fs = require('fs');
const content = fs.readFileSync('src/routes/+layout.svelte', 'utf8');
let stack = [];
let lines = content.split('\n');
for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    for (let j = 0; j < line.length; j++) {
        if (line[j] === '{') {
            stack.push({ line: i + 1, col: j + 1 });
        } else if (line[j] === '}') {
            if (stack.length === 0) {
                console.log(`Extra close brace at L${i + 1}:C${j + 1}`);
            } else {
                stack.pop();
            }
        }
    }
}
stack.forEach(s => console.log(`Unclosed brace at L${s.line}:C${s.col}`));
