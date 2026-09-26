/* Тест промокодов. Проверяет, что список в web/codes.js и таблица для
   раздачи promo-codes.csv совпадают, уникальны и разложены как задумано.
   Ожидания берутся из bot/tools/codes_plan.js — того же файла, что и
   генератор, поэтому цифры не могут разъехаться.
   Запуск: npm test. */
const fs = require('fs');
const path = require('path');
const PLAN = require('../tools/codes_plan');

const ROOT = path.join(__dirname, '..', '..');
const CODES_JS = path.join(ROOT, 'web', 'codes.js');
const CODES_CSV = path.join(ROOT, 'promo-codes.csv');

let checks = 0;
const fail = [];
function ok(cond, msg){ checks++; if (!cond) fail.push(msg); }
function eq(a, b, msg){ ok(a === b, msg + ' (получено ' + JSON.stringify(a) + ', ждали ' + JSON.stringify(b) + ')'); }

const totalPlanned = PLAN.reduce((s, p) => s + p.count, 0);

/* codes.js делает ровно одно: window.CODES = {...}. Выполняем в песочнице. */
const window = {};
new Function('window', fs.readFileSync(CODES_JS, 'utf8'))(window);
const CODES = window.CODES;
ok(CODES && typeof CODES === 'object', 'codes.js назначил window.CODES');

const keys = Object.keys(CODES);
eq(keys.length, totalPlanned, 'всего кодов');

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

/* Каждый код должен лежать ровно в одном плановом номинале, и таких кодов
   должно быть ровно столько, сколько в плане. */
for (const p of PLAN){
  const tier = keys.filter(k => CODES[k].w === p.wallet && CODES[k].v === p.value);
  eq(tier.length, p.count,
     'кодов ' + p.wallet + '/' + p.value);
  for (const k of tier) ok(RE.test(k), 'код в нужном формате: ' + k);
}

/* Не должно быть ни одного кода вне плана: иначе в раздачу попадёт строка,
   которой нет в плане, и тест перестанет защищать. */
for (const k of keys){
  const rec = CODES[k];
  const inPlan = PLAN.some(p => p.wallet === rec.w && p.value === rec.v);
  ok(inPlan, 'код ' + k + ' (' + rec.w + '/' + rec.v + ') есть в плане');
  ok(rec.v > 0, 'сумма кода положительна: ' + k);
}

/* Таблица для раздачи обязана совпадать с тем, что проверяет приложение,
   иначе админ раздаст коды, которые не сработают (или наоборот). */
const csv = fs.readFileSync(CODES_CSV, 'utf8').trim().split(/\r?\n/);
eq(csv[0], 'code,wallet,value', 'шапка CSV');
const csvRows = csv.slice(1).map(l => l.split(','));
eq(csvRows.length, totalPlanned, 'строк в CSV');
const csvSet = new Set(csvRows.map(r => r[0]));
eq(csvSet.size, totalPlanned, 'коды в CSV уникальны');
for (const k of keys) ok(csvSet.has(k), 'код из приложения есть в CSV: ' + k);
for (const [code, wallet, value] of csvRows){
  const rec = CODES[code];
  ok(!!rec, 'код из CSV есть в приложении: ' + code);
  if (rec){ eq(rec.w, wallet, 'кошелёк совпадает для ' + code); eq(String(rec.v), value, 'сумма совпадает для ' + code); }
}

/* Раздавать должно быть удобно: CSV идёт блоками по кошельку и сумме,
   в том же порядке, что и план. */
const order = csvRows.map(r => r[1] + '/' + r[2]);
const expectOrder = [];
for (const p of PLAN) for (let i = 0; i < p.count; i++) expectOrder.push(p.wallet + '/' + p.value);
eq(order.join(' '), expectOrder.join(' '), 'CSV разложен блоками в порядке плана');

/* Генератор и план должны оставаться в репозитории: по ним коды восстанавливаются. */
ok(fs.existsSync(path.join(ROOT, 'bot', 'tools', 'gen_codes.js')), 'генератор gen_codes.js на месте');
ok(fs.existsSync(path.join(ROOT, 'bot', 'tools', 'codes_plan.js')), 'план codes_plan.js на месте');

if (fail.length){
  console.error('ПРОВАЛЕНО ' + fail.length + ' из ' + checks + ':');
  for (const f of fail) console.error('  - ' + f);
  process.exit(1);
}
console.log('OK — ' + checks + ' проверок пройдено');
