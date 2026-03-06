import TelegramBot from 'node-telegram-bot-api';

let bot = null;
let chatId = null;

const STRATEGY_LABELS = {
  iron_condor: 'IRON CONDOR',
  bull_put_spread: 'BULL PUT SPREAD',
  bear_call_spread: 'BEAR CALL SPREAD',
  short_strangle: 'SHORT STRANGLE',
};

export function initTelegramBot() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    console.log('Telegram bot not configured. Set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID in .env');
    return false;
  }

  bot = new TelegramBot(token, { polling: false });
  console.log('Telegram bot initialized');
  return true;
}

export async function sendTradeAlert(alert) {
  if (!bot || !chatId) return;

  try {
    const strategy = STRATEGY_LABELS[alert.strategy] || alert.strategy;
    const expiry = alert.expiry
      ? new Date(alert.expiry).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
      : '-';

    const breakevenStr = Array.isArray(alert.breakeven)
      ? alert.breakeven.map(b => Number(b).toLocaleString('en-IN', { maximumFractionDigits: 0 })).join(' \u2014 ')
      : '-';

    const legsStr = (Array.isArray(alert.legs) ? alert.legs : [])
      .map(leg => {
        const action = leg.action === 'SELL' ? 'SELL' : 'BUY ';
        const oi = leg.oi ? Number(leg.oi).toLocaleString('en-IN') : '-';
        return `${action} ${leg.type} ${leg.strike} @ ${Number(leg.ltp).toFixed(2)} | OI: ${oi}`;
      })
      .join('\n');

    const profitStr = alert.max_profit_amt
      ? `Rs.${Number(alert.max_profit_amt).toLocaleString('en-IN')}`
      : Number(alert.max_profit).toFixed(2);
    const lossStr = alert.max_loss_amt != null
      ? `Rs.${Number(alert.max_loss_amt).toLocaleString('en-IN')}`
      : 'Unlimited';
    const marginStr = alert.margin_required
      ? `Rs.${Number(alert.margin_required).toLocaleString('en-IN')}`
      : '-';

    const msg = [
      `*${strategy}* | ${alert.underlying} | Exp: ${expiry}`,
      `Score: ${alert.probability_score} | Risk: ${alert.risk_level}`,
      '',
      `Max Profit: ${profitStr}${alert.profit_pct ? ` (${alert.profit_pct}%)` : ''}`,
      `Max Loss: ${lossStr}${alert.loss_pct ? ` (${alert.loss_pct}%)` : ''}`,
      `Margin: ${marginStr} | Lot: ${alert.lot_size || '-'}`,
      '',
      `Breakeven: ${breakevenStr}`,
      '',
      'Legs:',
      '```',
      legsStr,
      '```',
    ].join('\n');

    await bot.sendMessage(chatId, msg, { parse_mode: 'Markdown' });
  } catch (err) {
    console.error('Telegram send error:', err.message);
  }
}

export async function sendScanSummary(alertCount, underlyings) {
  if (!bot || !chatId) return;

  try {
    const now = new Date().toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' });
    const msg = alertCount > 0
      ? `Scan complete at ${now} IST\n${alertCount} new trade alert${alertCount > 1 ? 's' : ''} found for ${underlyings.join(', ')}`
      : `Scan complete at ${now} IST \u2014 no qualifying trades found`;

    await bot.sendMessage(chatId, msg);
  } catch (err) {
    console.error('Telegram summary error:', err.message);
  }
}

export function isBotReady() {
  return bot !== null && chatId !== null;
}
