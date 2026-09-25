/* Генератор промокодов.
   Один запуск делает сразу два файла из одного и того же списка:
     web/codes.js      — список для приложения (попадает на GitHub Pages)
     promo-codes.csv   — таблица для раздачи подруге (в репозиторий не для публикации)
   Если запустить повторно, коды пересоберутся заново, поэтому запускать
   ровно один раз и коммитить оба файла вместе. */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

/* Алфавит без по-настоящему неоднозначных символов: убраны 0 и O, а также
   1 и I (с ними похожие l и L остаются читаемыми за счёт того, что I нет).
   5 и S оставлены: между ними различают на слух, зато это вдвое расширяет
   алфавит и делает коды короче. Если коды будут диктовать вслух — исключи
   5 и S из ALPHA и пересобери список одним запуском этого файла. */
const ALPHA = 'ABCDEFGHJKLMNPQRTUVWXYZ23456789';
const GROUPS = 3;
const GROUP_LEN = 4;

const PLAN = [
  { wallet: 'real', value: 5000, count: 100 },
  { wallet: 'test', value: 5000, count: 200 }
];

function group(){
  let s = '';
  for (let i = 0; i < GROUP_LEN; i++) s += ALPHA[crypto.randomInt(ALPHA.length)];
  return s;
}

const used = new Set();
function makeCode(){
  for (;;){
    const parts = [];
    for (let g = 0; g < GROUPS; g++) parts.push(group());
    const code = parts.join('-');
    if (used.has(code)) continue;
    used.add(code);
    return code;
  }
}

const rows = [];
for (const p of PLAN){
  for (let i = 0; i < p.count; i++){
    rows.push({ code: makeCode(), wallet: p.wallet, value: p.value });
  }
}

/* Сортируем так, чтобы реальные и тестовые шли блоками — так удобнее
   раздавать и проверять, не перемешиваясь. */
rows.sort((a, b) => (a.wallet === b.wallet ? 0 : a.wallet === 'real' ? -1 : 1));

const root = path.join(__dirname, '..', '..');
const webDir = path.join(root, 'web');

/* В приложение — компактная карта, чтобы ввод промокода был O(1). */
const map = {};
for (const r of rows) map[r.code] = { w: r.wallet, v: r.value };

const js = '/* Промокоды. Файл создан bot/tools/gen_codes.js — руками не править.\n' +
  '   w: real | test   v: сколько монет начислить   100 реальных + 200 тестовых. */\n' +
  'window.CODES = ' + JSON.stringify(map, null, 0) + ';\n';
fs.writeFileSync(path.join(webDir, 'codes.js'), js, 'utf8');

/* Для раздачи: код, кошелёк, сколько даёт. */
const csv = 'code,wallet,value\n' +
  rows.map(r => r.code + ',' + r.wallet + ',' + r.value).join('\n') + '\n';
fs.writeFileSync(path.join(root, 'promo-codes.csv'), csv, 'utf8');

const real = rows.filter(r => r.wallet === 'real').length;
const test = rows.filter(r => r.wallet === 'test').length;
console.log('готово: ' + rows.length + ' кодов (' + real + ' real, ' + test + ' test)');
console.log('web/codes.js      ' + fs.statSync(path.join(webDir, 'codes.js')).size + ' байт');
console.log('promo-codes.csv   ' + fs.statSync(path.join(root, 'promo-codes.csv')).size + ' байт');
console.log('первые коды: ' + rows.slice(0, 3).map(r => r.code + ' (' + r.wallet + ')').join(', '));
