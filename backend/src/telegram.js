import axios from 'axios';

const TELEGRAM_API = `https://api.telegram.org/bot`;

function fmt(v, d = 2) { return v != null ? Number(v).toFixed(d) : 'N/A'; }
function fmtINR(n) { return n == null ? 'N/A' : `₹${Number(n).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`; }
function fmtOI(n) { return n == null ? '' : n >= 1e5 ? `${(n / 1e5).toFixed(1)}L` : n.toLocaleString('en-IN'); }

function getPCRLabel(pcr) {
  if (pcr == null) return 'Unknown';
  if (pcr > 1.2) return '🟢 Bullish';
  if (pcr < 0.8) return '🔴 Bearish';
  return '🟡 Neutral';
}

function escapeHTML(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function buildIndexBlock(emoji, name, spot, oiData, commentary) {
  const w = oiData?.weekly;
  const changePct = spot?.changePct ?? 0;
  const changeSign = changePct >= 0 ? '+' : '';
  const priceDir = changePct >= 0 ? '▲' : '▼';

  let block = `${emoji} <b>${escapeHTML(name)}</b>: ${fmtINR(spot?.price)} ${priceDir} ${changeSign}${fmt(changePct)}%\n`;

  if (w) {
    block += `PCR ${fmt(w.pcr)} · ${getPCRLabel(w.pcr)} | Max Pain: ${fmtINR(w.maxPain)}\n`;
    if (w.topCE?.length) {
      block += `🔴 Resistance: ${w.topCE.slice(0, 3).map(s => `${fmtINR(s.strike)}(${fmtOI(s.oi)})`).join(' · ')}\n`;
    }
    if (w.topPE?.length) {
      block += `🟢 Support: ${w.topPE.slice(0, 3).map(s => `${fmtINR(s.strike)}(${fmtOI(s.oi)})`).join(' · ')}\n`;
    }
    if (w.atmIV != null) {
      block += `IV: ${fmt(w.atmIV)}%`;
      if (w.expectedMove != null) block += ` | Exp.Move: ±${w.expectedMove}pts`;
      if (w.ivSkew != null) block += ` | Skew: ${w.ivSkew > 0 ? '+' : ''}${fmt(w.ivSkew)}%`;
      block += '\n';
    }
  }

  if (commentary) {
    block += `\n<i>${escapeHTML(commentary.replace(/\n\n/g, ' | '))}</i>`;
  }

  return block;
}

export async function postCommentaryToTelegram(payload) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) {
    console.warn('Telegram: TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not set');
    return;
  }

  const { spot, bankniftySpot, midcapSpot, finniftySpot, vix, nifty, banknifty, midcap, finnifty, commentaries, timestamp } = payload;
  const c = commentaries || {};

  const timeStr = new Date(timestamp).toLocaleTimeString('en-IN', {
    hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata'
  });

  const vixLine = vix
    ? `📊 <b>India VIX:</b> ${fmt(vix.value)} — ${escapeHTML(vix.level)}\n`
    : '';

  const header = `🎙️ <b>F&O Commentary</b> · ${timeStr} IST\n${vixLine}\n`;
  const divider = '\n━━━━━━━━━━━━━━━━━━━━\n';

  const blocks = [
    buildIndexBlock('🔵', 'Nifty 50',     spot,          nifty,     c.nifty),
    buildIndexBlock('🟣', 'Bank Nifty',   bankniftySpot, banknifty, c.banknifty),
    buildIndexBlock('🟢', 'Midcap Nifty', midcapSpot,    midcap,    c.midcap),
    buildIndexBlock('🟠', 'Fin Nifty',    finniftySpot,  finnifty,  c.finnifty),
  ];

  const fullText = header + blocks.join(divider);

  // Telegram limit is 4096 chars; split if needed
  const messages = [];
  if (fullText.length <= 4096) {
    messages.push(fullText);
  } else {
    // Send header + each index separately
    messages.push(header.trim());
    for (const block of blocks) {
      messages.push(block);
    }
  }

  for (const text of messages) {
    try {
      await axios.post(`${TELEGRAM_API}${token}/sendMessage`, {
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }, { timeout: 15000 });
    } catch (e) {
      console.error('Telegram send error:', e.response?.data || e.message);
    }
  }
}
