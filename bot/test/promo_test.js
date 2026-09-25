/* Тест промокодов. Проверяет, что список в web/codes.js и таблица для
   раздачи promo-codes.csv совпадают, уникальны и разложены как задумано:
   100 реальных по 5000 и 200 тестовых по 5000. Запуск: npm test. */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const CODES_JS = path.join(ROOT, 'web', 'codes.js');
const CODES_CSV = path.join(ROOT, 'promo-codes.csv');

let checks = 0;
const fail = [];
function ok(cond, msg){ checks++; if (!cond) fail.push(msg); }
function eq(a, b, msg){ ok(a === b, msg + ' (получено ' + JSON.stringify(a) + ', ждали ' + JSON.stringify(b) + ')'); }

/* codes.js делает ровно одно: window.CODES = {...}. Выполняем в песочнице. */
const window = {};
new Function('window', fs.readFileSync(CODES_JS, 'utf8'))(window);
const CODES = window.CODES;
ok(CODES && typeof CODES === 'object', 'codes.js назначил window.CODES');

const keys = Object.keys(CODES);
eq(keys.length, 300, 'всего кодов');

/* Формат: три группы по 4 символа, без неоднозначных знаков. */
const RE = /^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/;
for (const k of keys) ok(RE.test(k), 'код в нужном формате: ' + k);

/* promoKey() в приложении снимает дефисы, поэтому два разных кода не должны
   схлопнуться в один — иначе один промокод отдал бы сумму дважды. */
const norm = k => k.replace(/[^A-Z0-9]/g, '');
const seen = new Set();
for (const k of keys){
  const n = norm(k);
  ok(!seen.has(n), 'код без дефисов не коллизирует: ' + k);
  seen.add(n);
}

let real = 0, test = 0;
for (const k of keys){
  const rec = CODES[k];
  eq(rec.v, 5000, 'сумма у кода ' + k);
  if (rec.w === 'real') real++;
  else if (rec.w === 'test') test++;
  else fail.push('неизвестный кошелёк у ' + k + ': ' + rec.w);
}
eq(real, 100, 'кодов на реальный баланс');
eq(test, 200, 'кодов на тестовый баланс');

/* Таблица для раздачи обязана совпадать с тем, что проверяет приложение,
   иначе админ раздаст коды, которые не сработают (или наоборот). */
const csv = fs.readFileSync(CODES_CSV, 'utf8').trim().split(/\r?\n/);
eq(csv[0], 'code,wallet,value', 'шапка CSV');
const csvRows = csv.slice(1).map(l => l.split(','));
eq(csvRows.length, 300, 'строк в CSV');
const csvSet = new Set(csvRows.map(r => r[0]));
eq(csvSet.size, 300, 'коды в CSV уникальны');
for (const k of keys) ok(csvSet.has(k), 'код из приложения есть в CSV: ' + k);
for (const [code, wallet, value] of csvRows){
  const rec = CODES[code];
  ok(!!rec, 'код из CSV есть в приложении: ' + code);
  if (rec){ eq(rec.w, wallet, 'кошелёк совпадает для ' + code); eq(String(rec.v), value, 'сумма совпадает для ' + code); }
}

/* Генератор должен оставаться в репозитории: по нему коды восстанавливаются. */
ok(fs.existsSync(path.join(ROOT, 'bot', 'tools', 'gen_codes.js')), 'генератор gen_codes.js на месте');

if (fail.length){
  console.error('ПРОВАЛЕНО ' + fail.length + ' из ' + checks + ':');
  for (const f of fail) console.error('  - ' + f);
  process.exit(1);
}
console.log('OK — ' + checks + ' проверок пройдено');
