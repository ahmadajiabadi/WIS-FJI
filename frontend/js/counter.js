const fs = require('fs');
const content = fs.readFileSync('c:\\xampp\\htdocs\\Scanner CS\\frontend\\js\\app.js', 'utf8');
const tags = ['div', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'span', 'h1', 'h2', 'h3', 'i', 'p', 'button', 'select', 'option', 'img', 'form'];
tags.forEach(tag => {
    const open = (content.match(new RegExp('<' + tag + '(\\s|>)', 'g')) || []).length;
    const close = (content.match(new RegExp('</' + tag + '>', 'g')) || []).length;
    console.log(`${tag}: ${open} / ${close}`);
});
console.log('{ / }: ', (content.match(/{/g)||[]).length, (content.match(/}/g)||[]).length);
console.log('( / ): ', (content.match(/\(/g)||[]).length, (content.match(/\)/g)||[]).length);
