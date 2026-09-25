require('dotenv').config();

const { Bot, GrammyError } = require('grammy');

const TOKEN = process.env.BOT_TOKEN || '';
const WEBAPP_URL = String(process.env.WEBAPP_URL || '').replace(/\/+$/, '');

if (!TOKEN){
  console.error('BOT_TOKEN is not set');
  process.exit(1);
}

const bot = new Bot(TOKEN);
const botName = 'Рулетка с призами';

/* Бот — только лаунчер: по /start присылает кнопку, открывающую Mini App.
   Денег, состояния и админских команд здесь больше нет: баланс живёт в
   телефоне игрока, пополняется промокодами (bot/tools/gen_codes.js).

   HTTP не поднимается вообще. grammY работает на long polling — это
   исходящие запросы к api.telegram.org, поэтому белый IP, домен, туннель
   и открытый порт не нужны. Бот должен быть просто запущен. */

bot.command('start', ctx => {
  const text = '🎰 <b>' + botName + '</b>\n\n' +
    'Крути колесо, кости и кейсы, обменивай выигрыш на призы.\n' +
    'Каждый день начисляется 2000 монет — они копятся. Деньги и история ' +
    'хранятся в самом приложении.';
  const extra = WEBAPP_URL
    ? { parse_mode: 'HTML',
        reply_markup: { inline_keyboard: [[{ text: '🎰 Открыть рулетку', web_app: { url: WEBAPP_URL } }]] } }
    : { parse_mode: 'HTML' };
  return ctx.reply(text, extra);
});

bot.catch(err => {
  const e = err && err.error;
  if (e instanceof GrammyError) console.error('[grammy]', e.description || e.message);
  else console.error('[bot]', (err && err.message) || err);
});

bot.init()
  .then(() => {
    console.log('bot @' + bot.botInfo.username + (WEBAPP_URL ? '' : '  ⚠️ WEBAPP_URL не задан'));
    return bot.start({ onStart: () => console.log('polling started') });
  })
  .catch(err => {
    console.error('[bot]', err.message);
    process.exit(1);
  });

process.on('unhandledRejection', e => console.error('[unhandled]', (e && e.message) || e));
