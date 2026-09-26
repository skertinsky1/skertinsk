/* ============================================================
   Рулетка с призами — Telegram Mini App
   ============================================================ */

const START_BALANCE = 2000;   // ежедневное начисление в 00:00
/* Сервера нет: весь баланс живёт в этом браузере. Пополняют его промокоды
   (список в codes.js) и ежедневные +2000. */
const BIGWIN_COINS = 1000;
const BIGWIN_MULT = 10;
const STORE_KEY = 'roulette.v1';

const RED_NUMS = [1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36];
const BLACK_NUMS = [2,4,6,8,10,11,13,15,17,20,22,24,26,28,29,31,33,35];
const RED = new Set(RED_NUMS);
const BLACK = new Set(BLACK_NUMS);

const WHEEL_ORDER = [0,32,15,19,4,21,2,25,17,34,6,27,13,36,11,30,8,23,10,5,24,16,33,1,20,14,31,9,22,18,29,7,28,12,35,3,26];

const FIELDS = [
  {spec:'red',   type:'red',      nums:RED_NUMS,   pay:2},
  {spec:'black', type:'black',    nums:BLACK_NUMS, pay:2},
  {spec:'n:0',   type:'straight', nums:[0],        pay:36}
];
const BY_SPEC = Object.fromEntries(FIELDS.map(f => [f.spec, f]));

/* ПРИЗЫ. Меняешь список — и магазин, и призовый кейс, и инвентарь
   подстраиваются сами.
      price  — цена в магазине. 0 = бесплатный приз (обнимашки).
      СКЛАДА НЕТ: количество призов не ограничено.
      weight — вес в призовом кейсе. Не указан или 0 = в кейс не попадает.

               Веса нормализуются автоматически, в сумме не обязаны давать 100. */
const PRIZES = [
  {id:'hug',      name:'Обнимашки', emoji:'🤗', price:0,     weight:0},   // есть ∞, вне кейса
  {id:'icecream', name:'Мороженка', emoji:'🍦', price:3000,  weight:50},  // есть 5
  {id:'choco',    name:'Шоколадка', emoji:'🍫', price:5000,  weight:30},  // есть 3
  {id:'pizza',    name:'Пицца',     emoji:'🍕', price:10000, weight:15},  // есть 2
  {id:'wish',     name:'Желание',   emoji:'🎁', price:30000, weight:5},   // есть 1

];

/* Инвентарь: сколько экземпляров каждого предмета у игрока.
   Попадает и из магазина, и из призового кейса. Не обнуляется при дневном сбое. */
function addItem(id, n){
  if (!id) return;
  state.inv[id] = (state.inv[id] || 0) + (n || 1);
}
const invCount = id => state.inv[id] || 0;

/* ── Игры ── */

const GAMES = {main:'🎰 Рулетка', dice:'🎲 Кости', case:'🎁 Кейсы'};
const GAME_IDS = Object.keys(GAMES);

/* Кости: выплата = 0.973 / шанс. 0.973 — тот же край, что и в рулетке (36/37 ≈ 2,70%). */
const DICE_RATIO = 0.973;
const DICE_STEPS = 10000;              // бросок — целое 0..9999, показываем /10000
const diceRollValue = () => randInt(DICE_STEPS);
const diceMult = p => DICE_RATIO / p;  // p — вероятность 0..1

/* Кейсы описаны ниже, в секции «Кейсы»: coinCase() и CASE_ITEM. */

/* ── Telegram ── */

const tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;
if (tg) { try { tg.ready(); tg.expand(); } catch(e) {} }

function resolvePlayer(){
  const u = tg && tg.initDataUnsafe ? tg.initDataUnsafe.user : null;
  if (u) {
    const name = [u.first_name, u.last_name].filter(Boolean).join(' ').trim();
    return {id:String(u.id), name: name || u.username || 'Игрок', username: u.username || ''};
  }
  const id = 'local-' + Math.random().toString(36).slice(2,10);
  return {id, name:'Локальный игрок', username:''};
}

/* ── DOM ── */

const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));

const el = {
    hudTimer:$('#hudTimer'),
    hudReal:$('#hudReal'), hudTest:$('#hudTest'),
    cardReal:$('#cardReal'), cardTest:$('#cardTest'),
    walletSw:$('#walletSw'), walletNote:$('#walletNote'),
  hudRecent:$('#hudRecent'), back:$('#btnBack'),
  wheel:$('#wheel'), result:$('#resultBadge'),
  spin:$('#btnSpin'), chips:$('#chips'), betHint:$('#betHint'),
  rows:$('#bigbets'), betSum:$('#betSum'), clear:$('#btnClear'), rebet:$('#btnRebet'),
  warn:$('#noBetWarn'), shop:$('#shopList'), spinList:$('#spinList'),
  invList:$('#invList'), invSub:$('#invSub'),
  buyList:$('#buyList'), testBadge:$('#testBadge'),
  modal:$('#modal'), modalBox:$('#modalBox'), toast:$('#toast'),
  diceRoll:$('#diceRoll'), diceBar:$('#diceBar'), diceBarWrap:$('#diceBarWrap'), diceMark:$('#diceMark'),
  diceChance:$('#diceChance'), diceChanceVal:$('#diceChanceVal'), diceUnder:$('#diceUnder'), diceOver:$('#diceOver'),
  diceMultUnder:$('#diceMultUnder'), diceMultOver:$('#diceMultOver'), diceHint:$('#diceHint'),
  diceRangeUnder:$('#diceRangeUnder'), diceRangeOver:$('#diceRangeOver'),
  caseBtn:$('#btnCase'), reel:$('#reel'), reelStrip:$('#reelStrip'), reelRes:$('#reelRes'),
  caseList:$('#caseList'), caseCards:$('#caseCards'), oddsHead:$('#oddsHead'),
  promoInput:$('#promoInput'), promoHint:$('#promoHint'), btnPromo:$('#btnPromo')
};

/* ── State ── */

function blankState(){
  return {
    v:1,
    player: resolvePlayer(),
    real: START_BALANCE,
    test: 0,
    wallet: 'real',
    lastReset: today(),
    spins: [],
    buys: [],
    byGame: {roulette:{spins:0,staked:0,won:0}, dice:{spins:0,staked:0,won:0}, case:{spins:0,staked:0,won:0}},
    stats: {spins:0, staked:0, won:0, best:0},
    day:   {spins:0, staked:0, won:0, best:0},
    prizes: {},
    inv: {},
    usedCodes: []
  };
}

let state = load();
let bets = new Map();
let lastBets = [];
let chip = 10;
let spinning = false;

function today(){
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
}

function load(){
  let s = null;
  try { s = JSON.parse(localStorage.getItem(STORE_KEY) || 'null'); } catch(e) {}
  if (!s || typeof s !== 'object') return blankState();
  const base = blankState();
  s = Object.assign(base, s);
  delete s.stock;                 // склад удалён, старые остатки игнорируются
  s.stats = Object.assign({spins:0,staked:0,won:0,best:0}, s.stats || {});
  s.day   = Object.assign({spins:0,staked:0,won:0,best:0}, s.day || {});
  s.byGame = Object.assign({roulette:{spins:0,staked:0,won:0}, dice:{spins:0,staked:0,won:0}, case:{spins:0,staked:0,won:0}}, s.byGame || {});
  s.prizes = s.prizes || {};
  s.inv = Object.assign({}, s.inv || {});
  s.player = s.player || resolvePlayer();
  /* Миграция: в старых сохранениях был один balance. Весь он становится
     реальным, тестовый — ноль. Иначе игрок потерял бы свои монеты. */
  s.real  = Math.max(0, Math.floor(Number(s.real)  || 0));
  s.test  = Math.max(0, Math.floor(Number(s.test)  || 0));
  s.real += Math.max(0, Math.floor(Number(s.balance) || 0));
  delete s.balance;
  s.wallet = s.wallet === 'test' ? 'test' : 'real';
  /* Поля серверной синхронизации больше нет — вычищаем из старых сохранений,
     чтобы они не копились в экспорте. */
  delete s.testGiven;
  delete s.pending;
  delete s.seeded;
  delete s.server;
  if (!Array.isArray(s.spins)) s.spins = [];
  if (!Array.isArray(s.buys)) s.buys = [];
  if (!Array.isArray(s.usedCodes)) s.usedCodes = [];
  return s;
}

function save(){
  state.lastReset = state.lastReset || today();
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch(e) {}
}

/* Смена суток по местному времени телефона. Сервера нет, поэтому и начисление
   здесь: раз в сутки +2000 реальных, монеты копятся и не сгорают.
   Статистика дня обнуляется — она ни на что не влияет. */
function checkDay(){
  if (state.lastReset === today()) return false;
  state.day = {spins:0, staked:0, won:0, best:0};
  state.lastReset = today();
  state.real += START_BALANCE;
  bets.clear();
  lastBets = [];
  save();
  return true;
}

const betTotal = () => Array.from(bets.values()).reduce((s,v) => s + v, 0);

/* Общая запись раунда для всех игр.
   game: id из GAMES, best — чистая прибыль лучшего исхода (для рекорда). */
function recordSpin(game, staked, payout, best, extra){
  state.spins.unshift(Object.assign({g:game, staked, payout, ts:Date.now()}, extra || {}));
  state.spins = state.spins.slice(0, 200);

  const gain = Math.max(0, payout - staked);
  state.day.spins++;
  state.day.staked += staked;
  state.day.won += payout;
  state.day.best = Math.max(state.day.best, best);

  const bg = state.byGame[game] || (state.byGame[game] = {spins:0, staked:0, won:0});
  bg.spins++;
  bg.staked += staked;
  bg.won += payout;

  state.stats.spins++;
  state.stats.staked += staked;
  state.stats.won += payout;
  state.stats.best = Math.max(state.stats.best, Math.max(best, gain));
  save();
}

/* ── Bets ── */

function betWins(f, n){
  if (f.type === 'straight') return n === 0;
  if (f.type === 'red')  return RED.has(n);
  if (f.type === 'black') return BLACK.has(n);
  return false;
}

/* ── Кошелёк: два баланса ──
   real — настоящие монеты. Их даёт игра и дневная выдача, тратиться на них
          можно по-настоящему: призы в магазине и призовый кейс.
   test — тестовые. Их выдаёт бот командой /test. Только игра: рулетка, кости
          и монетные кейсы. Призы и призовый кейс недоступны.
   wallet — какой баланс сейчас активен для ставок, переключается в HUD. */
const walletKey  = () => (state.wallet === 'test' ? 'test' : 'real');
const balance    = () => state[walletKey()];
const addBalance = n => { state[walletKey()] += Math.max(0, Math.floor(n)); };
const balanceOf  = w => state[w === 'test' ? 'test' : 'real'];
const addTo      = (w, n) => {
  const k = w === 'test' ? 'test' : 'real';
  state[k] += Math.max(0, Math.floor(n));
};
/* Приз и призовой кейс — только за настоящие монеты, независимо от переключателя. */
const canSpendReal = n => state.real >= n;

function chipSize(){
  if (chip === 'MAX') return balance();
  return Math.min(chip, balance());
}

/* Добавить произвольную сумму на поле. Ставки копятся:
   500 + 500 + 500 = 1500 на одном поле. */
function addBet(spec, amt){
  if (spinning || amt <= 0) return false;
  const put = Math.min(amt, balance());
  if (put <= 0){ toast('Монет нет — жди нового дня 🌅'); return false; }
  state[walletKey()] -= put;
  bets.set(spec, (bets.get(spec) || 0) + put);
  return true;
}

function placeBet(spec){
  if (spinning) return;
  if (chipSize() <= 0) return toast('Монет нет — жди нового дня 🌅');
  if (!addBet(spec, chipSize())) return;
  save();
  paintBets();
  paintHud();
}

function removeChip(spec){
  if (spinning) return;
  const cur = bets.get(spec);
  if (!cur) return;
  const back = chip === 'MAX' ? cur : Math.min(chip, cur);
  if (cur - back <= 0) bets.delete(spec);
  else bets.set(spec, cur - back);
  addBalance(back);
  save();
  paintBets();
  paintHud();
}

/* Повтор ставит ровно те же суммы, а не по одной фишке. */
function rebet(){
  if (spinning || !lastBets.length) return;
  let any = false;
  lastBets.forEach(e => { if (addBet(e.spec, e.amt)) any = true; });
  if (!any) return;
  save();
  paintBets();
  paintHud();
}

function bindFields(){
  const wrap = $('#bigbets');
  let holdTimer = 0;
  let longFired = false;

  const dropHold = () => clearTimeout(holdTimer);

  wrap.addEventListener('pointerdown', e => {
    const t = e.target.closest('[data-bet]');
    dropHold();
    if (!t || spinning) return;
    longFired = false;
    holdTimer = setTimeout(() => {
      longFired = true;
      removeChip(t.dataset.bet);
      haptic('warning');
    }, 350);
  });
  ['pointerup','pointerleave','pointercancel'].forEach(ev => wrap.addEventListener(ev, dropHold));
  wrap.addEventListener('pointermove', e => { if (e.buttons) dropHold(); });
  wrap.addEventListener('contextmenu', e => e.preventDefault());

  wrap.addEventListener('click', e => {
    const t = e.target.closest('[data-bet]');
    if (!t || spinning || longFired) return;
    placeBet(t.dataset.bet);
    haptic('light');
  });
}

function haptic(style){
  if (tg && tg.HapticFeedback) { try { tg.HapticFeedback.impactOccurred(style); } catch(e) {} }
}

function paintBets(){
  FIELDS.forEach(f => {
    const node = document.querySelector('#bigbets [data-bet="' + f.spec + '"]');
    if (!node) return;
    const amt = bets.get(f.spec) || 0;
    let chipEl = node.querySelector('.betchip');
    if (!amt){
      if (chipEl) chipEl.remove();
      node.classList.remove('has-bet');
      return;
    }
    if (!chipEl){
      chipEl = document.createElement('div');
      chipEl.className = 'betchip';
      node.appendChild(chipEl);
    }
    chipEl.textContent = fmt(amt);
    node.classList.add('has-bet');
  });

  const t = betTotal();
  el.betSum.textContent = fmt(t);
  el.spin.disabled = spinning || t === 0;
  el.warn.hidden = true;
}

/* ── Колесо ── */

const W = el.wheel;
const ctx = W.getContext('2d');
const TAU = Math.PI * 2;
const STEP = TAU / 37;
let rotation = 0;
let raf = 0;

function colorOf(n){
  if (n === 0) return '#16a34a';
  return RED.has(n) ? '#dc2626' : '#18181b';
}

function paintWheel(r0, r1){
  WHEEL_ORDER.forEach((n, i) => {
    const a0 = -Math.PI/2 + i*STEP;
    const a1 = a0 + STEP;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a0)*r0, Math.sin(a0)*r0);
    ctx.arc(0, 0, r1, a0, a1);
    ctx.arc(0, 0, r0, a1, a0, true);
    ctx.closePath();
    ctx.fillStyle = colorOf(n);
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(255,255,255,.2)';
    ctx.stroke();

    const am = a0 + STEP/2;
    const rr = (r0 + r1) / 2;
    ctx.save();
    ctx.translate(Math.cos(am)*rr, Math.sin(am)*rr);
    ctx.rotate(am + Math.PI/2);
    ctx.fillStyle = n === 0 ? '#ffffff' : (RED.has(n) ? '#ffffff' : '#d4d4d8');
    ctx.font = '700 11px system-ui,-apple-system,sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(n), 0, 0);
    ctx.restore();
  });
}

function paintDecor(r0, r1){
  ctx.beginPath();
  ctx.arc(0, 0, r1 + 2, 0, TAU);
  ctx.lineWidth = 4;
  ctx.strokeStyle = 'rgba(251,191,36,.85)';
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(0, 0, r0 - 3, 0, TAU);
  ctx.fillStyle = '#1b1830';
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(251,191,36,.5)';
  ctx.stroke();
}

function render(){
  const R = W.width / 2;
  const r0 = R * 0.14;
  const r1 = R * 0.96;
  ctx.clearRect(0, 0, W.width, W.height);
  ctx.save();
  ctx.translate(R, R);
  ctx.rotate(rotation);
  paintWheel(r0, r1);
  paintDecor(r0, r1);
  ctx.restore();
}

const easeOutQuart = k => 1 - Math.pow(1 - k, 4);
const norm = a => ((a % TAU) + TAU) % TAU;

function randInt(max){
  const buf = new Uint32Array(1);
  const limit = Math.floor(0xFFFFFFFF / max) * max;
  let v;
  do { crypto.getRandomValues(buf); v = buf[0]; } while (v >= limit);
  return v % max;
}

const roll = () => WHEEL_ORDER[randInt(37)];

/* Сектор i отрисован от a0 = -PI/2 + i*STEP до a0 + STEP, его середина — -PI/2 + (i+0.5)*STEP.
   Чтобы середина сектора встала под указатель (верх, -PI/2), нужен поворот -(i+0.5)*STEP. */
const rotForIndex = i => -((i + 0.5) * STEP);

/* Хит-тест: какой сектор реально под указателем при данном повороте.
   Использует ту же геометрию, что paintWheel, — чтобы ловить рассинхрон. */
function sectorAtPointer(rot){
  const a = norm(-Math.PI/2 - rot);
  for (let j = 0; j < WHEEL_ORDER.length; j++){
    const a0 = norm(-Math.PI/2 + j*STEP);
    const a1 = a0 + STEP;
    if (a >= a0 && a < a1) return j;
    if (a1 > TAU && a < a1 - TAU) return j;
  }
  return -1;
}

function selfTestWheel(){
  const bad = [];
  for (let i = 0; i < WHEEL_ORDER.length; i++){
    const j = sectorAtPointer(rotForIndex(i));
    if (j !== i) bad.push(WHEEL_ORDER[i] + '->' + (j < 0 ? '?' : WHEEL_ORDER[j]));
  }
  return bad;
}

function spinWheel(n, done){
  const i = WHEEL_ORDER.indexOf(n);
  const target = rotForIndex(i);

  let d = norm(target) - norm(rotation);
  if (d <= 0) d += TAU;
  d += (5 + Math.floor(Math.random()*2)) * TAU;

  const dur = 2600 + Math.floor(Math.random()*700);
  const from = rotation;
  rotation = from + d;
  const t0 = performance.now();

  cancelAnimationFrame(raf);
  (function frame(t){
    const k = Math.min(1, (t - t0) / dur);
    rotation = from + d * easeOutQuart(k);
    render();
    if (k < 1) raf = requestAnimationFrame(frame);
    else {
      rotation = norm(target);
      render();
      const shown = sectorAtPointer(rotation);
      if (shown !== i) console.error('Рассинхрон колеса: объявлено', n, 'под указателем', WHEEL_ORDER[shown]);
      done();
    }
  })(t0);
}

/* ── Спин ── */

function spin(){
  if (spinning) return;
  if (!bets.size){ el.warn.hidden = false; return; }

  spinning = true;
  el.spin.disabled = true;
  el.result.hidden = true;

  const placed = Array.from(bets.entries());
  lastBets = placed.map(e => ({spec:e[0], amt:e[1]}));
  const staked = placed.reduce((s,e) => s + e[1], 0);
  bets.clear();
  paintBets();

  const n = roll();

  spinWheel(n, () => {
    let payout = 0;
    let bestSingle = 0;
    for (let i = 0; i < placed.length; i++){
      const f = BY_SPEC[placed[i][0]];
      if (!f || !betWins(f, n)) continue;
      const amt = placed[i][1];
      payout += Math.round(amt * f.pay);
      bestSingle = Math.max(bestSingle, Math.round(amt * (f.pay - 1)));
    }
    const profitSpin = payout - staked;

    addBalance(payout);
    recordSpin('roulette', staked, payout, bestSingle, {n});

    showResult(n, profitSpin);
    paintHud();
    paintRecent();
    if (stack[stack.length-1] === 'history') paintHistory();
  
    spinning = false;
    el.spin.disabled = true;

    if (payout > 0 && (bestSingle >= BIGWIN_COINS || (staked > 0 && payout / staked >= BIGWIN_MULT))){
      bigWinModal(n, bestSingle, staked);
    }
  });
}

function showResult(n, net){
  el.result.hidden = false;
  el.result.className = 'result ' + (n === 0 ? 'is-z' : RED.has(n) ? 'is-r' : 'is-b');
  el.result.innerHTML = '<span>' + n + '</span><small>' + (net > 0 ? '+' + net : net) + '</small>';

  const spec = n === 0 ? 'n:0' : RED.has(n) ? 'red' : 'black';
  const field = document.querySelector('#bigbets [data-bet="' + spec + '"]');
  if (field){
    field.classList.remove('hit');
    void field.offsetWidth;
    field.classList.add('hit');
  }

  if (net > 0) toast('+' + net + ' 🏆');
  else if (net < 0) toast(net + ' 😔');
}

/* ── Кости ── */

let diceChance = 50;
let diceBusy = false;
let diceTimer = 0;

const dicePUnder = () => diceChance / 100;
const dicePOver  = () => 1 - diceChance / 100;
const fmtMult = m => 'x' + m.toFixed(2);
const fmtRoll = v => (v / DICE_STEPS).toFixed(4);
const fmtPct = v => v.toFixed(2).replace('.', ',') + '%';

/* Выплата в целых монетах. Именно floor, не round: округление вверх
   давало игроку положительный EV на некоторых порогах (до +1,75%
   на пороге 92,5% фишкой 10). floor гарантирует выплату <= amt*m,
   то есть преимущество казино всегда не меньше DICE_RATIO. */
const dicePay = (m, amt) => Math.floor(amt * m);

/* Сторона бессмысленна, если выплата не больше ставки: игрок будет
   "выигрывать" почти каждый раунд и не получать ничего. */
const diceSideUsable = (m, amt) => m > 1 && dicePay(m, amt) > amt;

function paintDice(){
  const stake = chipSize();
  const mu = diceMult(dicePUnder());
  const mo = diceMult(dicePOver());
  const muOk = diceSideUsable(mu, stake);
  const moOk = diceSideUsable(mo, stake);
  el.diceChanceVal.textContent = fmtPct(diceChance);
  el.diceMultUnder.textContent = mu > 1 ? fmtMult(mu) + (muOk ? '' : ' · без выгоды') : 'невыгодно';
  el.diceMultOver.textContent  = mo > 1 ? fmtMult(mo) + (moOk ? '' : ' · без выгоды') : 'невыгодно';

  /* Границы берутся из того же условия, по которому считается выигрыш:
     меньше  = v <  t * STEPS, больше = v >= t * STEPS. Верхняя граница «меньше»
     на шаг ниже порога, потому что v целое, иначе подпись врала бы на тир. */
  const tStep = diceChance / 100 * DICE_STEPS;
  el.diceRangeUnder.textContent = tStep > 1
    ? 'выпадет 0.0000 – ' + ((tStep - 1) / DICE_STEPS).toFixed(4)
    : 'порог слишком низкий';
  el.diceRangeOver.textContent = tStep < DICE_STEPS - 1
    ? 'выпадет ' + (tStep / DICE_STEPS).toFixed(4) + ' – 99.9999'
    : 'порог слишком высокий';
  el.diceUnder.disabled = diceBusy || !muOk || !balance();
  el.diceOver.disabled  = diceBusy || !moOk || !balance();
  el.diceBarWrap.style.setProperty('--t', diceChance + '%');
  el.diceMark.dataset.label = fmtPct(diceChance);
  el.diceMark.classList.toggle('dicebar__mark--flip', diceChance > 88);
  el.diceHint.innerHTML = 'Фишка: <b>' + (chip === 'MAX' ? 'MAX (' + fmt(stake) + ')' : fmt(stake)) + '</b> · выбери сторону';
}

/* Выпадение фиксируется один раз в начале и передаётся сюда же:
   число на экране обязано быть тем же, по которому считается выплата. */
function diceStop(side, amt, v){
  diceBusy = false;
  clearInterval(diceTimer);
  el.diceRoll.classList.remove('is-rolling');

  const t = diceChance / 100;                 // порог
  const p = side === 'under' ? t : 1 - t;     // вероятность выигрыша
  const m = diceMult(p);
  /* Сравниваем с ПОРОГОМ. Раньше для «Больше» сравнивали с вероятностью
     (1 - порог), из-за чего при пороге 98% эта сторона выигрывала
     в 98% раундов с коэффициентом x48,65. */
  const won = side === 'under' ? v < t * DICE_STEPS : v >= t * DICE_STEPS;
  const payout = won ? dicePay(m, amt) : 0;

  el.diceRoll.textContent = fmtRoll(v);
  el.diceRoll.classList.add(won ? 'is-win' : 'is-lose');
  el.diceBar.style.width = (v / DICE_STEPS * 100) + '%';

    addBalance(payout);
    recordSpin('dice', amt, payout, payout - amt, {roll:v, side, chance:diceChance});

  if (payout > 0 && (payout - amt >= BIGWIN_COINS || m >= BIGWIN_MULT)){
    bigWinModal(v, payout - amt, amt, 'dice');
  }

  paintDice();
  paintHud();
  if (stack[stack.length-1] === 'history') paintHistory();

  /* Как в рулетке: показываем чистую разницу, а не выплату — иначе при
     выигрыше не видно, сколько реально заработано. */
  const net = payout - amt;
  if (net > 0) toast('+' + fmt(net) + ' 🎲');
  else toast('−' + fmt(amt) + ' 😔');
}

function rollDice(side){
  if (diceBusy) return;
  const t = diceChance / 100;
  const p = side === 'under' ? t : 1 - t;
  const m = diceMult(p);
  const amt = chipSize();
  if (!diceSideUsable(m, amt)){
    toast(m <= 1 ? 'Коэффициент ниже x1 — невыгодно' : 'Выплата ≤ ставки 🪙');
    return;
  }
  if (amt <= 0) return toast('Монет нет — жди нового дня 🌅');
  if (balance() < amt) return toast('Не хватает монет 🪙');

  state[walletKey()] -= amt;
  diceBusy = true;
  el.diceRoll.classList.remove('is-win','is-lose');
  el.diceRoll.classList.add('is-rolling');
  paintDice();
  paintHud();
  haptic('light');

  /* Итог выбирается один раз и анимация к нему подъезжает.
     Раньше diceStop бросал новый ролл, то есть на экране показывалось
     одно число, а выплата считалась по другому. */
  const v = diceRollValue();
  const FRAMES = 11, DUR = 700, from = randInt(DICE_STEPS);
  let i = 0;
  clearInterval(diceTimer);
  diceTimer = setInterval(() => {
    i++;
    if (i >= FRAMES){ clearInterval(diceTimer); return; }
    /* Плавный подъезд к v, последние два кадра — уже сам v */
    if (i >= FRAMES - 1){ el.diceRoll.textContent = fmtRoll(v); return; }
    const k = i / (FRAMES - 1);
    const eased = Math.round(from + (v - from) * (k * k * (3 - 2 * k)));
    el.diceRoll.textContent = fmtRoll(i % 3 ? eased : randInt(DICE_STEPS));
  }, DUR / FRAMES);
  setTimeout(() => diceStop(side, amt, v), DUR);
}

/* ── Кейсы ── */

let caseSel = 'coins50';
let caseBusy = false;
let caseLand = 0;

const prizeById = id => PRIZES.find(p => p.id === id) || null;

/* Редкости и доли — один шаблон на все монетные кейсы.
   Выплата = цена × mult, поэтому множительности и EV одинаковы для всех цен. */
/* Монетные кейсы. Множители одинаковые для всех кейсов, поэтому любая цена
   даёт ту же раскладку: кейс за 50 = 30/200/1 000/3 000/10 000,
   кейс за 500 = 300/2 000/10 000/30 000/100 000.

   slots считаются из chance, а не задаются руками: барабан собирается из
   slots, а игрок видит chance. Если развести их числами, игра обещает
   79.92%, а выпадает 72%. */
const allocSlots = shares => {
  const raw = shares.map(s => s * 100);
  const fl  = raw.map(Math.floor);
  for (let i = 0; i < fl.length; i++) if (fl[i] < 1) fl[i] = 1;
  const rest = 100 - fl.reduce((a, b) => a + b, 0);
  const idx = raw.map((x, i) => i).sort((a, b) => (raw[b] - raw[a]) || (a - b));
  for (let n = 0; n < rest; n++) fl[idx[n % idx.length]]++;
  return fl;
};

/* target — желаемое распределение, подсказка для настройки. Реальный шанс
   задаётся слотами: allocSlots округляет доли до целых и даёт минимум 1 слот,
   то есть из 100 плиток тир не может выпасть реже 1%. Показываем slots/100 —
   ровно то, что на барабане. Сумма target должна быть ровно 100: при большей
   сумме слоты не соберутся в 100 плиток и показанный шанс разойдётся с
   барабаном. Других копий этих чисел в проекте нет — это единственный источник. */
const COIN_CHANCES = [
  {id:'milspec',    name:'Mil-Spec',   icon:'🪙', target:79.92, mult:0.4},
  {id:'restricted', name:'Restricted', icon:'🥈', target:15.98, mult:1.5},
  {id:'classified', name:'Classified', icon:'🥉', target:3.20,  mult:4},
  {id:'covert',     name:'Covert',     icon:'🔴', target:0.64,  mult:15},
  {id:'special',    name:'Special',    icon:'👑', target:0.26,  mult:150}
];
const COIN_SLOTS = allocSlots(COIN_CHANCES.map(t => t.target / 100));
const COIN_TIERS = COIN_CHANCES.map((t, i) => Object.assign({}, t, {slots: COIN_SLOTS[i]}));

const coinCase = (id, price, label, icon) => ({id, price, label, icon, kind:'coins', tiers:
  /* chance = слоты: барабан из 100 плиток, один слот это ровно 1%. */
  COIN_TIERS.map(t => ({id:t.id, name:t.name, icon:t.icon, chance:+(t.slots).toFixed(2), slots:t.slots, coins:Math.round(price * t.mult)}))
});

/* ── Призовый кейс ──
   Полностью строится из PRIZES: шансы нормализуются из weight, слоты — из доли.
   Ничего дописывать не нужно — меняешь PRIZES и кейс меняется сам.

   Ставки и выплаты считаются по цене, заданной в COIN_TIERS, поэтому при
   уменьшении цены кейса выплаты уменьшаются ровно во столько же раз,
   сколько сама цена.

   Баланс кейсов: RTP обоих выше 100% — это демо-щедрость, а не ошибка.
   Монетный: слоты 80/15/3/1/1 при множителях 0.4/1.5/4/15/150 -> 231,5% цены.
   Призовой: веса 50/30/15/5, пустого слота нет -> шансы обратно пропорциональны
   цене приза. EV = 6000 за кейс в 5000 -> 120% цены, вклад каждого тира одинаков.
   Считать RTP призового кейса в монетах бессмысленно: prize в нём это не монеты,
   а настоящие призы, ценность для игрока задаётся тем, что он хочет получить.
   Меняется одним числом: weight у PRIZES. */
/* Вес пустого слота «без приза» в призовом кейсе (в тех же единицах, что weight у PRIZES). */
const CASE_ITEM_NOTHING = 0;   // пустого слота нет: кейс всегда выдаёт предмет

const CASE_ITEM = {id:'items', price:5000, label:'Призовый кейс', icon:'🎁', kind:'items', nothing:CASE_ITEM_NOTHING, tiers:buildItemTiers()};

/* Слоты по методу наибольшего остатка: доли округляются вниз до целых,
   недобранные слоты раздаются наибольшим долям. В сумме всегда ровно 100.
   Каждому тиру гарантируется минимум 1 слот: иначе редкий тир выпадает по
   шансу, но на барабане его нет — барабан остановится на другом предмете,
   а выплата посчитается по выпавшему. allocSlots объявлен выше. */

/* Пустой слот добавляется только при CASE_ITEM_NOTHING > 0. allocSlots даёт
   каждому тиру минимум 1 слот, поэтому при нулевом весе он всё равно занял бы
   слот и сумма перестала бы равняться 100. */
function buildItemTiers(){
  const pool  = PRIZES.filter(p => p.weight > 0);
  const hasNothing = CASE_ITEM_NOTHING > 0;
  const total = pool.reduce((s, p) => s + p.weight, 0) + (hasNothing ? CASE_ITEM_NOTHING : 0);
  const shares = pool.map(p => p.weight / total);
  if (hasNothing) shares.push(CASE_ITEM_NOTHING / total);
  const slots  = allocSlots(shares);
  /* chance из slots: один слот из 100 — ровно 1%, цифра всегда совпадает
     с барабаном. При весах 50/30/15/5 это те же 50/30/15/5. */
  const tiers  = pool.map((p, i) => ({id:p.id, chance:+(slots[i]).toFixed(2), slots:slots[i]}));
  if (hasNothing) tiers.push({id:null, chance:+(slots[pool.length]).toFixed(2), slots:slots[pool.length]});
  return tiers;
}

const CASE_ORDER = ['coins50', 'coins500', 'coins2500', 'items'];
const CASES = {
  coins50:   coinCase('coins50',   50,   'Монетный',      '🪙'),
  coins500:  coinCase('coins500',  500,  'Монетный XL',  '💸'),
  coins2500: coinCase('coins2500', 2500, 'Монетный XXL', '💰'),
  items:     CASE_ITEM
};
const REEL_COPIES = 3;

/* Точный взвешанный выбор: шансы заданы с точностью до 0,01%, розыгрыш до 0,0001%. */
function pickWeighted(list){
  const r = randInt(1000000) / 10000;
  let acc = 0;
  for (const it of list){
    acc += it.chance;
    if (r < acc) return it;
  }
  return list[list.length-1];
}

/* Перемешивание Фишера—Йетса. */
function shuffled(list){
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--){
    const j = randInt(i + 1);
    const tmp = a[i]; a[i] = a[j]; a[j] = tmp;
  }
  return a;
}

/* Лента собирается блоками по slots, а потом перемешивается. Без перемешивания
   порядок был детерминированным: сначала 80 Mil-Spec, потом 15 Restricted, и так
   далее. На экране это выглядело сломанным барабаном — длинные одноцветные
   полосы, и игрок видел «Mil-Spec, Mil-Spec, Mil-Spec» подряд. Шансы от
   перемешивания не меняются: плиток по-прежнему ровно 100, из них 80 Mil-Spec,
   просто лежат они в случайном порядке.

   Серии всё равно будут — при тире в 80% пять Mil-Spec подряд математически
   нормально. Перемешивание убирает именно полосатость, а не серии. */
function reelOf(cfg){
  return shuffled(cfg.tiers.reduce((a,t) => a.concat(new Array(t.slots).fill(t)), []));
}

function tileHtml(cfg, t){
  if (cfg.kind === 'items'){
    const p = t.id ? prizeById(t.id) : null;
    /* В барабане призового кейса только смайлик: «Мороженка»/«Шоколадка»
       не влезали в 84px и вылезали за края плитки. Что выпало — показывает
       строка результата под барабаном и список шансов. */
    return '<div class="slot slot--emoji" data-tier="' + (t.id || 'empty') + '">' +
      '<span class="slot__ico">' + (p ? p.emoji : '🫙') + '</span></div>';
  }
  return '<div class="slot" data-tier="' + t.id + '">' +
    '<span class="slot__ico">' + t.icon + '</span>' +
    '<b>' + fmt(t.coins) + '</b><i>' + t.name + '</i></div>';
}

/* Каждая копия ленты перемешивается по-своему, чтобы полоса не читалась как
   повтор одного и того же блока. Последняя копия — ровно та `one`, по которой
   openCase() ищет слот выигрыша: барабан останавливается именно на ней, и если
   её порядок не совпадёт с порядком в hits, остановка уедет на чужой тир. */
function buildReel(cfg, one){
  one = one || reelOf(cfg);
  let html = '';
  for (let c = 0; c < REEL_COPIES; c++){
    const copy = (c === REEL_COPIES - 1) ? one : reelOf(cfg);
    for (const t of copy) html += tileHtml(cfg, t);
  }
  el.reelStrip.innerHTML = html;
  el.reelStrip.style.transition = 'none';
  el.reelStrip.style.transform = 'translateX(0px)';
}

/* Карточки кейсов рисуются из CASES, а не руками в разметке:
   иначе id в HTML разъезжаются с CASES и кейс падает на undefined. */
function buildCaseCards(){
  el.caseCards.innerHTML = CASE_ORDER.map(id => {
    const c = CASES[id];
    return '<button class="casecard" data-case="' + id + '">' +
      '<span class="casecard__ico">' + c.icon + '</span>' +
      '<b>' + c.label + '</b>' +
      '<i>' + fmt(c.price) + ' монет' + (c.kind === 'items' ? ' · предмет' : '') + '</i>' +
    '</button>';
  }).join('');
}

function paintCase(){
  const cfg = CASES[caseSel];
  $$('.casecard').forEach(c => c.classList.toggle('is-active', c.dataset.case === caseSel));

  /* Призовый кейс и призы — только за настоящие монеты.
     Монетные кейсы берутся из активного кошелька, как и ставки. */
  const items = cfg.kind === 'items';
  const bal = items ? state.real : balance();
  const affordable = bal >= cfg.price;
  el.caseBtn.disabled = caseBusy || !affordable;
  el.caseBtn.textContent = caseBusy ? 'КРУТИМ...'
    : !affordable ? (items ? 'НУЖНЫ РЕАЛЬНЫЕ' : 'МАЛО МОНЕТ')
    : 'ОТКРЫТЬ ЗА ' + fmt(cfg.price) + (items ? '' : ' · ' + walletName());

  el.oddsHead.textContent = cfg.label + ' · шансы';
  el.caseList.innerHTML = cfg.tiers.map(t => {
    if (cfg.kind === 'items'){
      const p = t.id ? prizeById(t.id) : null;
      return '<div class="odd">' +
        '<div class="odd__ico">' + (p ? p.emoji : '🫙') + '</div>' +
        '<div class="odd__name">' + (p ? p.name : 'Ничего') +
          '<i>' + (p ? 'стоимость в магазине: ' + fmt(p.price) : 'пустой кейс') + '</i></div>' +
        '<div class="odd__chance">' + t.chance + '%</div>' +
        '<div class="odd__left">∞</div></div>';
    }
    return '<div class="odd">' +
      '<div class="odd__ico">' + t.icon + '</div>' +
      '<div class="odd__name">' + t.name +
        '<i>шанс ' + t.chance + '% · в барабане ' + t.slots + ' из 100</i></div>' +
      '<div class="odd__chance">' + fmt(t.coins) + ' 🪙</div>' +
      '<div class="odd__left">x' + (t.coins / cfg.price).toFixed(1).replace('.0','') + '</div></div>';
  }).join('');
}

function finishCase(cfg, tier){
  caseBusy = false;
  const landed = $$('.slot', el.reelStrip)[caseLand];
  if (landed) landed.classList.add('is-win');

  if (cfg.kind === 'items'){
    const p = tier.id ? prizeById(tier.id) : null;
    const payout = p ? p.price : 0;
    if (p){
      addItem(p.id);
      state.buys.unshift({id:p.id, name:p.name, emoji:p.emoji, price:cfg.price, fromCase:true, balance:state.real, ts:Date.now()});
      state.buys = state.buys.slice(0, 100);
    }
    recordSpin('case', cfg.price, payout, 0, p ? {kind:'items', prize:p.id, prizeName:p.name, emoji:p.emoji} : {kind:'items', prize:null});
    el.reelRes.innerHTML = p ? '<b>' + p.emoji + ' ' + p.name + '</b>' : '🫙 Ничего';
    showModal(
      '<div class="modal__ico">' + (p ? p.emoji : '🫙') + '</div>' +
      '<div class="modal__ttl">' + (p ? 'Приз!' : 'Пусто') + '</div>' +
      (p
        ? '<div class="modal__big">' + p.name + '</div>' +
          '<div class="modal__txt">стоимость в магазине: <b>' + fmt(p.price) + '</b></div>'
        : '<div class="modal__txt">В этот раз не повезло.</div>') +
      '<div class="modal__btns"><button class="btn" data-close>ОК</button></div>'
    );
  } else {
    const won = tier.coins;
    addBalance(won);
    recordSpin('case', cfg.price, won, won - cfg.price, {kind:'coins', coins:won, tier:tier.name, caseId:cfg.id});
    el.reelRes.innerHTML = '<b>' + tier.icon + ' ' + fmt(won) + ' монет</b> · ' + tier.name;
    toast('+' + fmt(won) + ' 🪙 ' + tier.name);
    if (won - cfg.price >= BIGWIN_COINS || won / cfg.price >= BIGWIN_MULT){
      showModal(
        '<div class="modal__ico">' + tier.icon + '</div>' +
        '<div class="modal__ttl">' + tier.name + '!</div>' +
        '<div class="modal__big">+' + fmt(won) + '</div>' +
        '<div class="modal__txt">кейс ' + fmt(cfg.price) + ' · x' + (won / cfg.price).toFixed(1).replace('.0','') + '</div>' +
        '<div class="modal__txt">Баланс: <b>' + fmt(balance()) + '</b></div>' +
        '<div class="modal__btns"><button class="btn" data-close>Крутить ещё</button></div>'
      );
    }
  }

  paintCase();
  paintHud();
  if (stack[stack.length-1] === 'shop') paintShop();
  if (stack[stack.length-1] === 'inv')  paintInv();
  if (stack[stack.length-1] === 'history') paintHistory();
}

function openCase(){
  if (caseBusy) return;
  const cfg = CASES[caseSel];
  if (cfg.kind === 'items'){
    if (!canSpendReal(cfg.price)) return toast('Призовый кейс — только за реальные 🪙');
  } else if (balance() < cfg.price) return toast('Не хватает монет 🪙');

  const tier = pickWeighted(cfg.tiers);

  caseBusy = true;
  if (cfg.kind === 'items') state.real -= cfg.price;
  else state[walletKey()] -= cfg.price;
  $$('.slot', el.reelStrip).forEach(s => s.classList.remove('is-win'));
  el.reelRes.textContent = 'Крутим…';
  haptic('medium');

  /* Остановка берётся в последней копии барабана, на СЛУЧАЙНОМ слоте внутри
     блока выигрыша, а не на фиксированном.
     Раньше здесь стоял lastIndexOf() — он возвращал один и тот же индекс для
     каждого тира, поэтому все выигрыши Mil-Spec выглядели пиксель в пиксель
     одинаково и барабан казался заевшим.
     Шаг берётся из реального offsetLeft, а не из width: у слота есть margin,
     и шаг = width + 2*margin. */
  const one = reelOf(cfg);
  /* Лента пересобирается под этот спин из того же перемешанного массива, по
     которому ниже ищется слот выигрыша. Иначе DOM и hits считались бы от
     разных перемешиваний и барабан останавливался бы на другом тире, чем
     показывает строка результата. */
  buildReel(cfg, one);
  const want = tier.id || 'empty';
  const hits = [];
  for (let i = 0; i < one.length; i++) if ((one[i].id || 'empty') === want) hits.push(i);
  if (!hits.length){
    /* На барабане нет ни одного слота этого тира — рассинхрон конфигурации.
       Раньше здесь стоял return, но он оставил бы caseBusy = true и уже
       списанные за кейс монеты, то есть игрока блокировало бы навсегда. */
    console.error('Кейс: тир ' + want + ' отсутствует на барабане', cfg.id);
    caseBusy = false; addBalance(cfg.price); paintCase(); paintHud();
    return toast('Кейс настроен неверно 🪙');
  }
  const idx = hits[randInt(hits.length)];
  const slots = $$('.slot', el.reelStrip);
  const landIdx = (REEL_COPIES - 1) * one.length + idx;
  caseLand = landIdx;
  const target = slots[landIdx];
  const offset = target.offsetLeft + target.offsetWidth / 2 - el.reel.clientWidth / 2;

  el.reelStrip.style.transition = 'none';
  el.reelStrip.style.transform = 'translateX(0px)';
  void el.reelStrip.offsetWidth;
  el.reelStrip.style.transition = 'transform 4.4s cubic-bezier(.09,.68,.06,1)';
  el.reelStrip.style.transform = 'translateX(' + (-offset) + 'px)';

  paintCase();
  paintHud();
  setTimeout(() => finishCase(cfg, tier), 4500);
}

/* ── HUD ── */

const walletName = () => (walletKey() === 'test' ? 'тестовых' : 'реальных');

function paintHud(){
  el.hudReal.textContent = fmt(state.real);
  el.hudTest.textContent = fmt(state.test);
  el.testBadge.hidden = !(state.test > 0);

  const onTest = walletKey() === 'test';
  el.cardReal.classList.toggle('is-wallet', !onTest);
  el.cardTest.classList.toggle('is-wallet', onTest);

  if (!el.walletSw) return;
  $$('.walletsw__btn', el.walletSw).forEach(b => {
    const w = b.dataset.wallet;
    b.classList.toggle('is-active', w === walletKey());
    b.setAttribute('aria-selected', w === walletKey() ? 'true' : 'false');
    /* Нельзя переключиться на пустой кошелёк — иначе кнопки ставок
       просто не работают и игрок не понимает почему. */
    b.disabled = (w === 'test' ? state.test : state.real) <= 0;
  });

  el.walletNote.innerHTML = onTest
    ? 'Играешь на <b>тестовых</b>. Призы и призовой кейс только за 💰 реальные.'
    : 'Играешь на <b>реальных</b>.';
}

function paintRecent(){
  const list = state.spins.slice(0, 12);
  el.hudRecent.innerHTML = list.map(s => {
    const g = s.g || 'roulette';
    if (g === 'dice')
      return '<div class="rchip d"><i></i>' + ((s.roll/DICE_STEPS)*100).toFixed(0) + '%</div>';
    if (g === 'case')
      return '<div class="rchip ' + (s.prize ? 'z' : 'b') + '"><i></i>' + (s.emoji || '🫙') + '</div>';
    const c = s.n === 0 ? 'z' : RED.has(s.n) ? 'r' : 'b';
    const dot = s.n === 0 ? '🟢' : RED.has(s.n) ? '🔴' : '⚫';
    return '<div class="rchip ' + c + '"><i></i>' + s.n + ' ' + dot + '</div>';
  }).join('');
}

function paintTimer(){
  const now = new Date();
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  let s = Math.max(0, Math.floor((end - now) / 1000));
  const h = Math.floor(s/3600); s -= h*3600;
  const m = Math.floor(s/60);   s -= m*60;
  el.hudTimer.textContent = h + 'ч ' + String(m).padStart(2,'0') + 'м';
  return s === 0;
}

const fmt = n => Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

/* ── Магазин ── */

function paintInv(){
  const rows = PRIZES.filter(p => invCount(p.id) > 0);
  const total = PRIZES.reduce((s, p) => s + invCount(p.id), 0);
  const found  = rows.length;

  el.invSub.textContent = total
    ? 'Собрано ' + found + ' из ' + PRIZES.length + ' · всего предметов: ' + total +
      ' · копится из магазина и призового кейса, никуда не девается'
    : 'Пока пусто. Предметы попадают сюда из магазина и из призового кейса.';

  if (!rows.length){
    el.invList.innerHTML = '<div class="panel"><div class="panel__head">Пусто</div>' +
      '<div class="list"><div class="row"><span>Ни одного предмета</span></div></div></div>';
    return;
  }

  el.invList.innerHTML = rows.map(p => {
    const n = invCount(p.id);
    return '<div class="prize">' +
      '<div class="prize__ico">' + p.emoji + '</div>' +
      '<div class="prize__info">' +
        '<div class="prize__name">' + p.name + '</div>' +
        '<div class="prize__meta">в магазине <b>' + fmt(p.price) + '</b> · магазинная цена, не влияет на инвентарь</div>' +
      '</div>' +
      '<div class="inv__n">×' + n + '</div>' +
    '</div>';
  }).join('');
}

function paintShop(){
  el.shop.innerHTML = PRIZES.map(p => {
    const ps = state.prizes[p.id] || {bought:0, spent:0};
    const free = p.price === 0;
    const afford = free || canSpendReal(p.price);
    return '<div class="prize">' +
      '<div class="prize__ico">' + p.emoji + '</div>' +
      '<div class="prize__info">' +
        '<div class="prize__name">' + p.name + '</div>' +
        '<div class="prize__meta">' + (free ? '🆓 бесплатно' : '🪙 ' + fmt(p.price)) +
          (ps.bought ? ' · куплено ' + ps.bought : '') + '</div>' +
      '</div>' +
      '<button class="prize__buy" data-buy="' + p.id + '"' + (afford ? '' : ' disabled') + '>' +
        (free ? 'Взять' : afford ? 'Купить' : 'Мало') +
      '</button>' +
    '</div>';
  }).join('');
}

/* Покупка целиком на телефоне: сервера нет, списание считается здесь.
   Склада нет — количество не ограничено. */
function buyPrize(id){
  const p = PRIZES.find(x => x.id === id);
  if (!p) return;
  if (p.price > 0 && !canSpendReal(p.price)) return toast('Не хватает реальных монет 😕');

  state.real -= p.price;
  addItem(p.id);
  state.buys.unshift({id, name:p.name, emoji:p.emoji, price:p.price, balance:state.real, ts:Date.now()});
  state.buys = state.buys.slice(0, 100);
  save();

  paintShop();
  paintHud();
  if (stack[stack.length-1] === 'history') paintHistory();

  prizeModal(p);
}

function prizeModal(p){
  showModal(
    '<div class="modal__ico">🎉</div>' +
    '<div class="modal__ttl">Приз куплен!</div>' +
    '<div class="modal__big">' + p.emoji + ' ' + p.name + '</div>' +
    '<div class="modal__txt">за <b>' + fmt(p.price) + '</b> монет</div>' +
    '<div class="modal__txt">Остаток: <b>' + fmt(state.real) + '</b></div>' +
    '<div class="modal__btns"><button class="btn" data-close>ОК</button></div>'
  );
}

function bigWinModal(n, best, staked, game){
  if (game === 'dice'){
    showModal(
      '<div class="modal__ico">🎲</div>' +
      '<div class="modal__ttl">Крупный выигрыш!</div>' +
      '<div class="modal__big">+' + fmt(best) + '</div>' +
      '<div class="modal__txt">Выпало <b>' + (n / DICE_STEPS).toFixed(4) + '</b> · ставка ' + fmt(staked) + '</div>' +
      '<div class="modal__txt">Баланс: <b>' + fmt(state.real) + '</b></div>' +
      '<div class="modal__btns"><button class="btn" data-close>Крутить ещё</button></div>'
    );
    return;
  }
  showModal(
    '<div class="modal__ico">' + (n === 0 ? '🟢' : RED.has(n) ? '🔴' : '⚫') + '</div>' +
    '<div class="modal__ttl">Крупный выигрыш!</div>' +
    '<div class="modal__big">+' + fmt(best) + '</div>' +
    '<div class="modal__txt">Выпало <b>' + n + '</b> · ставка ' + fmt(staked) + '</div>' +
    '<div class="modal__txt">Баланс: <b>' + fmt(state.real) + '</b></div>' +
    '<div class="modal__btns"><button class="btn" data-close>Крутить ещё</button></div>'
  );
}

/* ── История ── */

function timeAgo(ts){
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return 'только что';
  if (s < 3600) return Math.floor(s/60) + ' мин назад';
  if (s < 86400) return Math.floor(s/3600) + ' ч назад';
  return Math.floor(s/86400) + ' дн назад';
}

function paintHistory(){
  const gameOf = s => s.g || 'roulette';
  const icon = s => {
    if (gameOf(s) === 'dice')
      return '<div class="item__n d">' + ((s.roll/DICE_STEPS)*100).toFixed(0) + '</div>';
    if (gameOf(s) === 'case')
      return '<div class="item__n ' + (s.prize ? 'z' : '') + '">' + (s.emoji || '🫙') + '</div>';
    return '<div class="item__n ' + (s.n === 0 ? 'z' : RED.has(s.n) ? 'r' : 'b') + '">' + s.n + '</div>';
  };
  const label = s => {
    if (gameOf(s) === 'dice')
      return (s.side === 'under' ? 'меньше ' : 'больше ') + s.chance + '% · выпало ' + (s.roll/DICE_STEPS).toFixed(4);
    if (gameOf(s) === 'case')
      return 'кейс · ' + (s.prizeName || 'пусто');
    return GAMES.main.replace('🎰 ','') + ' · ставка';
  };

  el.spinList.innerHTML = state.spins.length
    ? state.spins.slice(0, 60).map(s => {
        const net = s.payout - s.staked;
        return '<div class="item">' + icon(s) +
          '<div class="item__info">' + timeAgo(s.ts) + ' · ' + label(s) +
            (gameOf(s) === 'roulette' ? ' ' + fmt(s.staked) : '') + '</div>' +
          '<div class="item__sum ' + (net > 0 ? 'up' : net < 0 ? 'down' : '') + '">' +
            (net > 0 ? '+' : '') + fmt(net) + '</div></div>';
      }).join('')
    : '<div class="empty">Пока пусто. Крути колесо 🎰</div>';

  el.buyList.innerHTML = state.buys.length
    ? state.buys.slice(0, 60).map(b =>
        '<div class="item"><div class="item__n">' + b.emoji + '</div>' +
        '<div class="item__info">' + b.name + (b.fromCase ? ' · из кейса' : '') + ' · ' + timeAgo(b.ts) + '</div>' +
        '<div class="item__sum down">−' + fmt(b.price) + '</div></div>'
      ).join('')
    : '<div class="empty">Призов пока нет 🛍</div>';
}

/* Экран статистики убран из интерфейса: он занимал четыре панели и отодвигал
   игру вниз. Счётчики state.stats продолжают считаться и сохраняться — просто
   рисовать их теперь некуда, поэтому paintStats удалён вместе с вызовами.
   А поля экрана «Данные» раньше заполнялись именно внутри paintStats, поэтому
   для них появилась отдельная функция. */
function paintData(){
  $('#stPlayer').textContent = state.player.name;
  $('#stId').textContent = state.player.id;
  $('#stSaved').textContent = new Date().toLocaleTimeString('ru-RU');
  $('#stReset').textContent = state.lastReset;
}

/* ── Навигация ── */

const stack = ['main'];
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

function go(name, push){
  if (GAME_IDS.indexOf(name) !== -1){ stack.length = 0; stack.push(name); }
  else if (push !== false && stack[stack.length-1] !== name) stack.push(name);
  apply();
}

function apply(){
  const cur = stack[stack.length-1];
  $$('.screen').forEach(s => s.classList.toggle('is-active', s.id === 'screen' + cap(cur)));
  $$('.tab').forEach(t => t.classList.toggle('is-active', t.dataset.go === cur));
  el.back.hidden = stack.length < 2;
  if (tg && tg.BackButton){
    if (stack.length > 1) tg.BackButton.show(); else tg.BackButton.hide();
  }
  if (cur === 'shop')    paintShop();
  if (cur === 'inv')     paintInv();
  if (cur === 'history') paintHistory();
  if (cur === 'data')    paintData();
  if (cur === 'main')    paintBets();
  if (cur === 'dice')    paintDice();
  if (cur === 'case')    paintCase();
  window.scrollTo(0, 0);
}

function back(){
  if (stack.length < 2) return;
  stack.pop();
  apply();
}

if (tg && tg.BackButton) tg.BackButton.onClick(back);
el.back.addEventListener('click', back);

/* ── Модалка / тост ── */

let modalCb = null;

function showModal(html, onClose){
  el.modalBox.innerHTML = html;
  el.modal.hidden = false;
  modalCb = onClose || null;
}

function closeModal(){
  el.modal.hidden = true;
  if (modalCb) { const f = modalCb; modalCb = null; f(); }
}

el.modal.addEventListener('click', e => {
  if (e.target === el.modal || e.target.closest('[data-close]')) closeModal();
});

let toastTimer = 0;
function toast(text){
  el.toast.textContent = text;
  el.toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.toast.hidden = true; }, 2400);
}

/* ── Промокоды ──
   Баланс пополняется только промокодом из codes.js (создаётся генератором
   bot/tools/gen_codes.js).
   Список статичный, сервера нет: введённый код сверяется с таблицей, сумма
   падает в нужный кошелёк, а код запоминается как использованный. Повторно
   тот же код не сработает. Коды одноразовые: один код = одна порция. */

const promoKey = s => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

/* Индекс с ключами без дефисов: код можно ввести с ними или без, в любом
   регистре — сводим к одной строке и ищем за O(1). */
const PROMO_VALUES = (() => {
  const src = (window.CODES && typeof window.CODES === 'object') ? window.CODES : {};
  const out = {};
  for (const k of Object.keys(src)){
    const rec = src[k] || {};
    out[promoKey(k)] = { w: rec.w === 'test' ? 'test' : 'real', v: Math.max(0, Math.floor(Number(rec.v) || 0)) };
  }
  return out;
})();

function setPromoHint(text, isError){
  if (!el.promoHint) return;
  el.promoHint.textContent = text;
  el.promoHint.style.color = isError ? '#f87171' : '';
}

function applyPromo(){
  if (!el.promoInput) return;
  const key = promoKey(el.promoInput.value);
  if (!key) return;

  const rec = PROMO_VALUES[key];
  if (!rec){
    setPromoHint('Такого промокода нет ❌', true);
    return;
  }
  if (state.usedCodes.indexOf(key) !== -1){
    setPromoHint('Этот промокод уже использован ⚠️', true);
    el.promoInput.select();
    return;
  }

  state.usedCodes.push(key);
  if (state.usedCodes.length > 500) state.usedCodes.splice(0, state.usedCodes.length - 500);
  addTo(rec.w, rec.v);
  save();
  el.promoInput.value = '';

  const label = rec.w === 'test' ? '🧪 Тестовый' : '💰 Реальный';
  setPromoHint(label + ': +' + fmt(rec.v) + ' ✅', false);
  toast(label.split(' ')[0] + ' +' + fmt(rec.v) + ' 🎁');

  paintHud(); paintBets(); paintDice(); paintCase();
  const view = stack[stack.length-1];
  if (view === 'shop') paintShop();
  if (view === 'inv')  paintInv();
}
/* ── Экспорт / импорт ── */

function exportData(){
  const blob = new Blob([JSON.stringify(state, null, 2)], {type:'application/json'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'roulette-' + today() + '.json';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function importData(file){
  const r = new FileReader();
  r.onload = () => {
    try {
      const s = JSON.parse(r.result);
      if (!s || typeof s !== 'object') throw 0;
      /* Принимаем и новые файлы (real/test), и старые (balance). */
      const hasNew = typeof s.real === 'number' || typeof s.test === 'number';
      const hasOld = typeof s.balance === 'number';
      if (!hasNew && !hasOld) throw 0;
      state = Object.assign(blankState(), s);
      delete state.stock;
      state.stats = Object.assign({spins:0,staked:0,won:0,best:0}, s.stats || {});
      state.day = Object.assign({spins:0,staked:0,won:0,best:0}, s.day || {});
      state.byGame = Object.assign(blankState().byGame, s.byGame || {});
      state.player = s.player || resolvePlayer();
      state.prizes = s.prizes || {};
      state.inv = Object.assign({}, s.inv || {});
      state.usedCodes = Array.isArray(s.usedCodes) ? s.usedCodes : [];
      state.spins = Array.isArray(s.spins) ? s.spins : [];
      state.buys = Array.isArray(s.buys) ? s.buys : [];
      /* Старый balance целиком становится реальным — монеты не теряются.
         Считаем от s, а не от state: у blankState() real = 2000, и старый
         файл получил бы ещё дневные сверху. */
      state.real = (hasNew ? Math.max(0, Math.floor(Number(s.real) || 0)) : 0)
                 + (hasOld ? Math.max(0, Math.floor(Number(s.balance) || 0)) : 0);
      state.test = Math.max(0, Math.floor(Number(s.test) || 0));
      state.wallet = state.wallet === 'test' ? 'test' : 'real';
      delete state.balance;
      delete state.pending;
      delete state.seeded;
      delete state.server;
      bets.clear();
      lastBets = [];
      save();
      apply();
      paintHud(); paintRecent();
      /* Теперь состояние целиком локальное, поэтому импорт возвращает деньги,
         инвентарь и историю одним куском. */
      toast('Данные восстановлены ✅');
    } catch(e){ toast('Файл не подходит ❌'); }
  };
  r.readAsText(file);
}

function wipe(){
  showModal(
    '<div class="modal__ico">⚠️</div>' +
    '<div class="modal__ttl">Стереть всё?</div>' +
    '<div class="modal__txt">Баланс, история, сток и статистика сбросятся. Отменить будет нельзя.</div>' +
    '<div class="modal__btns">' +
      '<button class="btn btn--danger" style="width:100%" id="wipeYes">Да, стереть</button>' +
      '<button class="btn btn--ghost" style="width:100%" data-close>Отмена</button>' +
    '</div>'
  );
  $('#wipeYes').onclick = () => {
    localStorage.removeItem(STORE_KEY);
    state = blankState();
    bets.clear(); lastBets = [];
    save(); apply();
    paintHud(); paintRecent(); paintBets(); paintDice();
    buildReel(CASES[caseSel]); paintCase();
    const top = stack[stack.length-1];    if (top === 'shop') paintShop();
    if (top === 'history') paintHistory();
      closeModal();
    toast('Начинаем с нуля 🎰');
  };
}

/* ── События ── */

el.spin.addEventListener('click', spin);
el.clear.addEventListener('click', () => {
  const t = betTotal();
  if (!t) return;
  addBalance(t);
  bets.clear();
  save(); paintBets(); paintHud();
});
el.rebet.addEventListener('click', rebet);

/* Переключатель кошелька. Ставки на поле остаются: они уже списаны,
   просто вернутся в тот кошелёк, откуда были взяты. */
if (el.walletSw) el.walletSw.addEventListener('click', e => {
  const btn = e.target.closest('.walletsw__btn');
  if (!btn || btn.disabled || spinning || caseBusy) return;
  const w = btn.dataset.wallet === 'test' ? 'test' : 'real';
  if (w === walletKey()) return;
  state.wallet = w;
  save();
  paintHud(); paintBets(); paintCase();
  if (stack[stack.length-1] === 'shop') paintShop();
  toast(w === 'test' ? '🧪 Тестовый баланс' : '💰 Реальный баланс');
});

/* Фишка общая для всех игр: панелей чипов несколько, синхронизируем по значению. */
document.addEventListener('click', e => {
  const c = e.target.closest('.chip');
  if (!c) return;
  chip = c.dataset.chip === 'MAX' ? 'MAX' : +c.dataset.chip;
  const label = chip === 'MAX' ? 'MAX (' + fmt(balance()) + ')' : chip;
  $$('.chip').forEach(x => x.classList.toggle('is-active', x.dataset.chip === c.dataset.chip));
  el.betHint.innerHTML = 'Фишка: <b>' + label + '</b> · тап — поставить, удержание — снять';
  el.diceHint.innerHTML = 'Фишка: <b>' + label + '</b> · выбери сторону';
  paintDice();
});

el.diceChance.addEventListener('input', () => {
  diceChance = +el.diceChance.value;
  paintDice();
});
el.diceUnder.addEventListener('click', () => rollDice('under'));
el.diceOver.addEventListener('click', () => rollDice('over'));
el.caseBtn.addEventListener('click', openCase);

/* Делегирование на контейнер, а не addEventListener на каждую карточку:
   карточки рисуются в buildCaseCards() при инициализации, и прямые слушатели
   навешивались бы на пустой набор — переключение перестало бы работать. */
el.caseCards.addEventListener('click', e => {
  const c = e.target.closest('[data-case]');
  if (!c || caseBusy) return;
  const next = c.dataset.case;
  if (!CASES[next]) return;
  caseSel = next;
  buildReel(CASES[caseSel]);
  el.reelRes.textContent = 'Выбрано: ' + CASES[caseSel].label;
  paintCase();
});

el.shop.addEventListener('click', e => {
  const b = e.target.closest('[data-buy]');
  if (b && !b.disabled) buyPrize(b.dataset.buy);
});

/* Промокод: кнопка и Enter в поле. */
if (el.btnPromo) el.btnPromo.addEventListener('click', applyPromo);
if (el.promoInput) el.promoInput.addEventListener('keydown', e => {
  if (e.key === 'Enter'){ e.preventDefault(); applyPromo(); }
});

$$('.tab').forEach(t => t.addEventListener('click', () => go(t.dataset.go)));

$('#btnClearSpins').addEventListener('click', () => {
  state.spins = [];
  save(); paintHistory(); paintRecent();
});
$('#btnExport').addEventListener('click', exportData);
$('#btnImport').addEventListener('click', () => $('#fileImport').click());
$('#fileImport').addEventListener('change', e => {
  if (e.target.files[0]) importData(e.target.files[0]);
  e.target.value = '';
});
$('#btnWipe').addEventListener('click', wipe);

/* ── Тик ── */

function onNewDay(){
  bets.clear();
  lastBets = [];
  paintHud(); paintBets(); paintRecent(); paintDice(); paintCase();
  if (stack[stack.length-1] === 'shop') paintShop();
  if (stack[stack.length-1] === 'history') paintHistory();
  toast('Новый день 🌅 +' + fmt(START_BALANCE) + ' 🎁');
}

setInterval(() => {
  const rolled = checkDay();
  paintTimer();
  if (rolled) onNewDay();
}, 1000);

document.addEventListener('visibilitychange', () => {
  if (document.hidden) return;
  if (checkDay()) onNewDay();
  else { paintTimer(); paintHud(); paintBets(); }
});

/* ── Старт ── */

bindFields();
const firstRun = checkDay();
render();
apply();
paintTimer();
paintHud();
paintRecent();
paintBets();
paintDice();
buildCaseCards();
buildReel(CASES[caseSel]);
paintCase();
el.betHint.innerHTML = 'Фишка: <b>' + chip + '</b> · тап — поставить, удержание — снять';
save();
if (firstRun) toast('Новый день 🌅 +' + fmt(START_BALANCE) + ' 🎁');

/* Хелперы для отладки из консоли браузера: roulette.promo() */
window.roulette = {
  get balance(){ return balance(); },
  get real(){ return state.real; },
  get test(){ return state.test; },
  get used(){ return state.usedCodes.length; },
  set wallet(w){ state.wallet = w === 'test' ? 'test' : 'real'; save(); paintHud(); paintBets(); },
  selfTest(){ return selfTestWheel(); },
  promo(){ return applyPromo(); },
  wipe(){ wipe(); }};

/* Сервера нет — синхронизироваться некуда. Смена суток ловится таймером
   и обработчиком visibilitychange выше. */
