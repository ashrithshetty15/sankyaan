import axios from 'axios';

/**
 * Event Calendar — fetches upcoming earnings from NSE + static macro events.
 * Used by IV Crush scanner to find stocks with events in 1-5 days.
 */

// Cache earnings data for 6 hours
let earningsCache = { data: [], fetchedAt: 0 };
const CACHE_TTL = 6 * 60 * 60 * 1000;

// Top FnO stocks by OI (large cap + mid cap)
export const FNO_STOCKS = {
  // Large cap (2-3% OTM for IV Crush)
  large: ['RELIANCE', 'TCS', 'INFY', 'HDFCBANK', 'ICICIBANK', 'SBIN', 'BAJFINANCE',
          'KOTAKBANK', 'LT', 'BHARTIARTL', 'ITC', 'HCLTECH', 'AXISBANK', 'MARUTI', 'WIPRO'],
  // Mid cap (3-4% OTM for IV Crush)
  mid: ['TATAMOTORS', 'TECHM', 'SUNPHARMA', 'TITAN', 'ADANIENT', 'BAJAJFINSV',
        'POWERGRID', 'NTPC', 'COALINDIA', 'ONGC', 'HINDALCO', 'TATACONSUM',
        'APOLLOHOSP', 'DRREDDY', 'DIVISLAB'],
};

export const ALL_FNO_STOCKS = [...FNO_STOCKS.large, ...FNO_STOCKS.mid];

export function isLargeCap(symbol) {
  return FNO_STOCKS.large.includes(symbol);
}

/**
 * Fetch upcoming board meetings (earnings) from NSE.
 */
export async function getUpcomingEarnings(daysAhead = 5) {
  const now = Date.now();
  if (earningsCache.data.length > 0 && (now - earningsCache.fetchedAt) < CACHE_TTL) {
    return filterByDays(earningsCache.data, daysAhead);
  }

  try {
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'application/json, text/plain, */*',
      'Accept-Language': 'en-US,en;q=0.9',
      'Referer': 'https://www.nseindia.com/companies-listing/corporate-filings-event-calendar',
    };

    // Get cookies from NSE homepage first
    const homeResp = await axios.get('https://www.nseindia.com', {
      headers,
      timeout: 10000,
      maxRedirects: 5,
    });
    const cookies = (homeResp.headers['set-cookie'] || []).map(c => c.split(';')[0]).join('; ');

    // Fetch event calendar
    const today = new Date();
    const fromDate = formatNSEDate(today);
    const futureDate = new Date(today.getTime() + daysAhead * 24 * 60 * 60 * 1000);
    const toDate = formatNSEDate(futureDate);

    const url = 'https://www.nseindia.com/api/event-calendar?index=equities&from_date=' + fromDate + '&to_date=' + toDate;
    const resp = await axios.get(url, {
      headers: { ...headers, Cookie: cookies },
      timeout: 15000,
    });

    if (!Array.isArray(resp.data)) {
      console.warn('NSE event calendar: unexpected response format');
      earningsCache = { data: [], fetchedAt: now };
      return [];
    }

    // Filter for board meetings related to financial results
    const earnings = resp.data
      .filter(ev => {
        const purpose = (ev.bm_purpose || ev.purpose || '').toLowerCase();
        return purpose.includes('financial result') ||
               purpose.includes('quarterly result') ||
               purpose.includes('annual result') ||
               purpose.includes('audited result') ||
               purpose.includes('un-audited result');
      })
      .map(ev => ({
        symbol: ev.symbol || ev.company,
        name: ev.company || ev.symbol,
        date: ev.bm_date || ev.date,
        purpose: ev.bm_purpose || ev.purpose || 'Financial Results',
        event_type: 'earnings',
      }))
      .filter(ev => ALL_FNO_STOCKS.includes(ev.symbol));

    earningsCache = { data: earnings, fetchedAt: now };
    console.log('Event calendar: fetched ' + earnings.length + ' upcoming earnings for FnO stocks');
    return filterByDays(earnings, daysAhead);
  } catch (err) {
    console.error('Failed to fetch NSE event calendar:', err.message);
    return filterByDays(earningsCache.data, daysAhead);
  }
}

/**
 * Static macro events (RBI policy, budget, etc.)
 */
const MACRO_EVENTS_2026 = [
  { date: '2026-04-08', event_type: 'rbi_policy', name: 'RBI MPC Policy Decision', symbols: ['NIFTY', 'BANKNIFTY'] },
  { date: '2026-06-04', event_type: 'rbi_policy', name: 'RBI MPC Policy Decision', symbols: ['NIFTY', 'BANKNIFTY'] },
  { date: '2026-08-05', event_type: 'rbi_policy', name: 'RBI MPC Policy Decision', symbols: ['NIFTY', 'BANKNIFTY'] },
  { date: '2026-10-01', event_type: 'rbi_policy', name: 'RBI MPC Policy Decision', symbols: ['NIFTY', 'BANKNIFTY'] },
  { date: '2026-12-03', event_type: 'rbi_policy', name: 'RBI MPC Policy Decision', symbols: ['NIFTY', 'BANKNIFTY'] },
];

export function getUpcomingMacroEvents(daysAhead = 5) {
  const now = new Date();
  const cutoff = new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000);

  return MACRO_EVENTS_2026.filter(ev => {
    const evDate = new Date(ev.date);
    return evDate >= now && evDate <= cutoff;
  }).flatMap(ev =>
    ev.symbols.map(symbol => ({
      symbol,
      name: ev.name,
      date: ev.date,
      event_type: ev.event_type,
    }))
  );
}

/**
 * Get all upcoming events (earnings + macro) for the scanner.
 */
export async function getAllUpcomingEvents(daysAhead = 5) {
  const [earnings, macro] = await Promise.all([
    getUpcomingEarnings(daysAhead),
    Promise.resolve(getUpcomingMacroEvents(daysAhead)),
  ]);
  return [...earnings, ...macro];
}

/**
 * Calculate days until event from today.
 */
export function daysUntilEvent(dateStr) {
  const evDate = new Date(dateStr);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  evDate.setHours(0, 0, 0, 0);
  return Math.round((evDate - now) / (24 * 60 * 60 * 1000));
}

function formatNSEDate(d) {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return dd + '-' + mm + '-' + yyyy;
}

function filterByDays(events, daysAhead) {
  const now = new Date();
  const cutoff = new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000);
  return events.filter(ev => {
    const evDate = new Date(ev.date);
    return evDate >= now && evDate <= cutoff;
  });
}
