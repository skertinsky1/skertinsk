/* Генератор промокодов.
   Один запуск делает сразу два файла из одного и того же списка:
     web/codes.js      — список для приложения (попадает на GitHub Pages)
     promo-codes.csv   — таблица для раздачи подруге
   Если запустить повторно, коды пересоберутся заново, поэтому запускать
   ровно один раз и коммитить оба файла вместе.

   ВАЖНО: прежние коды не перегенерируются. Генератор читает существующий
   web/codes.js и догенерирует только нехватку по плану. Иначе повторный
   запуск выдал бы новые коды вместо уже розданных, и подруга не смогла бы
   ввести то, что получила. */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const PLAN = require('./codes_plan');

/* Алфавит без по-настоящему неоднозначных символов: убраны 0 и O, а также
   1 и I (с ними похожие l и L остаются читаемыми за счёт того, что I нет).
   5 и S оставлены: между ними различают на слух, зато это вдвое расширяет
   алфавит и делает коды короще. Если коды будут диктовать вслух — исключи
   5 и S из ALPHA и пересобери список одним запуском этого файла. */
const ALPHA = 'ABCDEFGHJKLMNPQRTUVWXYZ23456789';
const GROUPS = 3;
const GROUP_LEN = 4;

function group(){
  let s = '';
  for (let i = 0; i < GROUP_LEN; i++) s += ALPHA[crypto.randomInt(ALPHA.length)];
  return s;
}

/* promoKey() в приложении снимает дефисы, поэтому два разных кода не должны
   схлопнуться в один — иначе один промокод отдал бы сумму дважды. */
const norm = c => c.replace(/[^A-Z0-9]/g, '');

const root = path.join(__dirname, '..', '..');
const webDir = path.join(root, 'web');
const codesPath = path.join(webDir, 'codes.js');

/* Уже выданные коды: они переезжают в новый список как есть. */
const kept = [];
const used = new Set();
if (fs.existsSync(codesPath)){
  const win = {};
  new Function('window', fs.readFileSync(codesPath, 'utf8'))(win);
  const old = win.CODES || {};
  for (const code of Object.keys(old)){
    const rec = old[code];
    if (!rec || !rec.w) continue;
    kept.push({ code, wallet: rec.w, value: rec.v });
    used.add(norm(code));
  }
}

function makeCode(){
  for (;;){
    const parts = [];
    for (let g = 0; g < GROUPS; g++) parts.push(group());
    const code = parts.join('-');
    const n = norm(code);
    if (used.has(n)) continue;
    used.add(n);
    return code;
  }
}

const added = [];
for (const p of PLAN){
  const have = kept.filter(r => r.wallet === p.wallet && r.value === p.value).length;
  const need = p.count - have;
  if (need < 0){
    console.warn('ВНИМАНИЕ: ' + p.wallet + '/' + p.value + ' уже ' + have +
                ' кодов, а в плане ' + p.count + ' — лишние оставлены как есть.');
  }
  for (let i = 0; i < need; i++){
    const code = makeCode();
    kept.push({ code, wallet: p.wallet, value: p.value });
    added.push({ code, wallet: p.wallet, value: p.value });
  }
}

/* Сортируем блоками: сначала реальные по убыванию суммы, потом тестовые.
   Так удобнее раздавать и проверять, не перемешиваясь. */
kept.sort((a, b) =>
  a.wallet === b.wallet ? b.value - a.value : a.wallet === 'real' ? -1 : 1);

/* В приложение — компактная карта, чтобы ввод промокода был O(1). */
const map = {};
for (const r of kept) map[r.code] = { w: r.wallet, v: r.value };

const byTier = PLAN.map(p =>
  p.wallet + '/' + p.value + '×' + p.count).join(', ');
const js = '/* Промокоды. Файл создан bot/tools/gen_codes.js — руками не править.\n' +
  '   w: real | test   v: сколько монет начислить   (' + byTier + '). */\n' +
  'window.CODES = ' + JSON.stringify(map, null, 0) + ';\n';
fs.writeFileSync(codesPath, js, 'utf8');

/* Для раздачи: код, кошелёк, сколько даёт. */
const csv = 'code,wallet,value\n' +
  kept.map(r => r.code + ',' + r.wallet + ',' + r.value).join('\n') + '\n';
fs.writeFileSync(path.join(root, 'promo-codes.csv'), csv, 'utf8');

const cnt = (w, v) => kept.filter(r => r.wallet === w && r.value === v).length;
console.log('всего кодов: ' + kept.length + ' (новых добавлено: ' + added.length + ')');
for (const p of PLAN) console.log('  ' + p.wallet + '/' + p.value + ': ' + cnt(p.wallet, p.value) + ' из ' + p.count);
console.log('web/codes.js      ' + fs.statSync(codesPath).size + ' байт');
console.log('promo-codes.csv   ' + fs.statSync(path.join(root, 'promo-codes.csv')).size + ' байт');
if (added.length) console.log('новые: ' + added.map(r => r.code + ' (' + r.wallet + '/' + r.value + ')').join(', '));
