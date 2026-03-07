import {
  getCachedOptionsChain,
  getCachedUnderlyingData,
  getCachedVIX,
  getFyersSymbol,
} from "./fyersService.js";
import { isLargeCap, daysUntilEvent } from "./eventCalendar.js";

/**
 * Options Strategy Scanner & Scoring Engine
 *
 * Scans live options chain data from TrueData and identifies
 * high-probability, low-risk trade setups.
 *
 * Strategies: Iron Condor, Bull Put Spread, Bear Call Spread, Short Strangle
 */

// Minimum criteria thresholds
const MIN_OI = 50000;       // Minimum open interest for liquidity
const MIN_VOLUME = 500;     // Minimum volume
const MAX_SPREAD_PCT = 2;   // Max bid-ask spread as % of LTP
const IV_CRUSH_MIN_OI = 500000; // 5L OI for IV Crush
const IV_CRUSH_MAX_SPREAD_PCT = 5; // 5% bid-ask for IV Crush

/**
 * Run a full scan across underlyings and return scored trade alerts.
 * @param {string[]} underlyings - e.g. ['NIFTY', 'BANKNIFTY']
 * @param {string} expiry - e.g. '27MAR2026'
 * @returns {Array} Array of scored trade alert objects
 */
export async function scanStrategies(underlyings, expiry, eventMap) {
  const alerts = [];

  for (const underlying of underlyings) {
    const fyersSymbol = getFyersSymbol(underlying);
    const chain = getCachedOptionsChain(fyersSymbol);
    const spot = getCachedUnderlyingData(fyersSymbol);

    if (!chain.length || !spot?.ltp) {
      console.warn(`No data for ${underlying} ${expiry}, skipping scan`);
      continue;
    }

    // Get ATM IV for IV Rank calculation
    const vix = getCachedVIX(fyersSymbol);
    // Use India VIX as proxy for IV rank: VIX 12-15 = low, 15-20 = medium, 20+ = high
    const ivRank = vix > 0 ? Math.min(100, Math.max(0, (vix - 10) * 5)) : 50;

    // Scan each strategy
    const ironCondors = scanIronCondors(chain, spot.ltp, ivRank, underlying, expiry);
    const bullPuts = scanBullPutSpreads(chain, spot.ltp, ivRank, underlying, expiry);
    const bearCalls = scanBearCallSpreads(chain, spot.ltp, ivRank, underlying, expiry);
    const strangles = scanShortStrangles(chain, spot.ltp, ivRank, underlying, expiry);

    // Check if this underlying has an upcoming event for IV Crush
    const eventInfo = eventMap ? eventMap.get(underlying) : null;
    const ivCrush = eventInfo ? scanIVCrush(chain, spot.ltp, ivRank, underlying, expiry, eventInfo) : [];

    alerts.push(...ironCondors, ...bullPuts, ...bearCalls, ...strangles, ...ivCrush);
  }

  // Enrich with margin, lot size, and percentages
  const LOT_SIZES = { NIFTY: 75, BANKNIFTY: 15 };
  for (const alert of alerts) {
    const lotSize = LOT_SIZES[alert.underlying] || 50;
    alert.lot_size = lotSize;

    if (alert.strategy === 'short_strangle') {
      alert.margin_required = Math.round(alert.breakeven[1] * 0.12 * lotSize);
    } else {
      alert.margin_required = Math.round(alert.max_loss * lotSize);
    }

    alert.max_profit_amt = Math.round(alert.max_profit * lotSize);
    alert.max_loss_amt = alert.max_loss != null ? Math.round(alert.max_loss * lotSize) : null;
    alert.profit_pct = alert.margin_required > 0
      ? parseFloat(((alert.max_profit * lotSize / alert.margin_required) * 100).toFixed(1))
      : 0;
    alert.loss_pct = alert.margin_required > 0 && alert.max_loss != null
      ? parseFloat(((alert.max_loss * lotSize / alert.margin_required) * 100).toFixed(1))
      : null;
  }

  // Sort by probability score descending
  alerts.sort((a, b) => b.probability_score - a.probability_score);

  return alerts;
}

/**
 * Get ATM implied volatility from the options chain.
 */
function getATMImpliedVol(chain, spotPrice) {
  let closestStrike = chain[0];
  let minDiff = Infinity;

  for (const row of chain) {
    const diff = Math.abs(row.strike - spotPrice);
    if (diff < minDiff) {
      minDiff = diff;
      closestStrike = row;
    }
  }

  const ceIV = closestStrike?.ce?.iv || 0;
  const peIV = closestStrike?.pe?.iv || 0;

  if (ceIV && peIV) return (ceIV + peIV) / 2;
  return ceIV || peIV || 15; // fallback
}

/**
 * Check if an option has sufficient liquidity.
 */
function isLiquid(option) {
  if (!option) return false;
  if ((option.oi || 0) < MIN_OI) return false;
  if ((option.volume || 0) < MIN_VOLUME) return false;
  if (option.spread && option.ltp > 0) {
    if ((option.spread / option.ltp) * 100 > MAX_SPREAD_PCT) return false;
  }
  return true;
}

// ─── Iron Condor Scanner ─────────────────────────────────────────────

/**
 * Scan for Iron Condor setups.
 * Sell OTM put + call at ~0.20 delta, buy further OTM wings.
 * Best when: IV Rank > 50%, neutral outlook, stable underlying.
 */
function scanIronCondors(chain, spotPrice, ivRank, underlying, expiry) {
  if (ivRank < 40) return []; // Need elevated IV for premium selling

  const alerts = [];
  const stepSize = underlying === 'NIFTY' ? 50 : underlying === 'BANKNIFTY' ? 100 : 50;
  const wingWidth = stepSize * 2; // 2 strikes wide

  // Find sell strikes 2-5% OTM (proxy for ~0.15-0.25 delta)
  const putSellCandidates = chain.filter(r => {
    if (!r.pe || r.strike >= spotPrice) return false;
    const dist = (spotPrice - r.strike) / spotPrice;
    return dist >= 0.02 && dist <= 0.05 && isLiquid(r.pe);
  });

  const callSellCandidates = chain.filter(r => {
    if (!r.ce || r.strike <= spotPrice) return false;
    const dist = (r.strike - spotPrice) / spotPrice;
    return dist >= 0.02 && dist <= 0.05 && isLiquid(r.ce);
  });

  for (const putSell of putSellCandidates) {
    for (const callSell of callSellCandidates) {
      // Find buy legs (wings)
      const putBuyStrike = putSell.strike - wingWidth;
      const callBuyStrike = callSell.strike + wingWidth;

      const putBuy = chain.find(r => r.strike === putBuyStrike);
      const callBuy = chain.find(r => r.strike === callBuyStrike);

      if (!putBuy?.pe || !callBuy?.ce) continue;
      if (!putBuy.pe.ltp || !callBuy.ce.ltp) continue;

      // Calculate P&L
      const premiumCollected =
        (putSell.pe.ltp || 0) + (callSell.ce.ltp || 0) -
        (putBuy.pe.ltp || 0) - (callBuy.ce.ltp || 0);

      if (premiumCollected <= 0) continue;

      const maxLoss = wingWidth - premiumCollected;
      if (maxLoss <= 0) continue;

      const riskReward = premiumCollected / maxLoss;
      const lowerBreakeven = putSell.strike - premiumCollected;
      const upperBreakeven = callSell.strike + premiumCollected;

      // Score this setup
      const putDist = (spotPrice - putSell.strike) / spotPrice;
      const callDist = (callSell.strike - spotPrice) / spotPrice;
      const score = scoreStrategy({
        ivRank,
        riskReward,
        sellPutDelta: putDist < 0.02 ? 0.30 : putDist < 0.03 ? 0.22 : putDist < 0.04 ? 0.17 : 0.12,
        sellCallDelta: callDist < 0.02 ? 0.30 : callDist < 0.03 ? 0.22 : callDist < 0.04 ? 0.17 : 0.12,
        putOI: putSell.pe.oi || 0,
        callOI: callSell.ce.oi || 0,
        premiumCollected,
        maxLoss,
        strategy: 'iron_condor',
      });

      if (score < 45) continue; // Skip low-quality setups

      alerts.push({
        strategy: 'iron_condor',
        underlying,
        expiry,
        legs: [
          { strike: putBuyStrike, type: 'PE', action: 'BUY', ltp: putBuy.pe.ltp, iv: putBuy.pe.iv, delta: putBuy.pe.delta, oi: putBuy.pe.oi },
          { strike: putSell.strike, type: 'PE', action: 'SELL', ltp: putSell.pe.ltp, iv: putSell.pe.iv, delta: putSell.pe.delta, oi: putSell.pe.oi },
          { strike: callSell.strike, type: 'CE', action: 'SELL', ltp: callSell.ce.ltp, iv: callSell.ce.iv, delta: callSell.ce.delta, oi: callSell.ce.oi },
          { strike: callBuyStrike, type: 'CE', action: 'BUY', ltp: callBuy.ce.ltp, iv: callBuy.ce.iv, delta: callBuy.ce.delta, oi: callBuy.ce.oi },
        ],
        max_profit: premiumCollected,
        max_loss: maxLoss,
        breakeven: [lowerBreakeven, upperBreakeven],
        probability_score: score,
        risk_level: score >= 70 ? 'Low' : score >= 50 ? 'Medium' : 'High',
        iv_rank: ivRank,
        entry_price: premiumCollected,
      });

      // Only keep best 3 iron condors per underlying
      if (alerts.filter(a => a.strategy === 'iron_condor' && a.underlying === underlying).length >= 3) break;
    }
    if (alerts.filter(a => a.strategy === 'iron_condor' && a.underlying === underlying).length >= 3) break;
  }

  return alerts;
}

// ─── Bull Put Spread Scanner ─────────────────────────────────────────

/**
 * Scan for Bull Put Spreads (credit put spreads).
 * Sell OTM put, buy further OTM put.
 * Best when: Bullish/neutral, IV elevated, underlying near support.
 */
function scanBullPutSpreads(chain, spotPrice, ivRank, underlying, expiry) {
  if (ivRank < 35) return [];

  const alerts = [];
  const stepSize = underlying === 'NIFTY' ? 50 : underlying === 'BANKNIFTY' ? 100 : 50;
  const wingWidth = stepSize * 2;

  const sellCandidates = chain.filter(r => {
    if (!r.pe || r.strike >= spotPrice) return false;
    const dist = (spotPrice - r.strike) / spotPrice;
    return dist >= 0.02 && dist <= 0.06 && isLiquid(r.pe);
  });

  for (const sell of sellCandidates) {
    const buyStrike = sell.strike - wingWidth;
    const buy = chain.find(r => r.strike === buyStrike);

    if (!buy?.pe?.ltp) continue;

    const premiumCollected = (sell.pe.ltp || 0) - (buy.pe.ltp || 0);
    if (premiumCollected <= 0) continue;

    const maxLoss = wingWidth - premiumCollected;
    if (maxLoss <= 0) continue;

    const riskReward = premiumCollected / maxLoss;
    const breakeven = sell.strike - premiumCollected;

    const putDist = (spotPrice - sell.strike) / spotPrice;
    const score = scoreStrategy({
      ivRank,
      riskReward,
      sellPutDelta: putDist < 0.02 ? 0.30 : putDist < 0.03 ? 0.22 : putDist < 0.04 ? 0.17 : 0.12,
      putOI: sell.pe.oi || 0,
      premiumCollected,
      maxLoss,
      strategy: 'bull_put_spread',
    });

    if (score < 45) continue;

    alerts.push({
      strategy: 'bull_put_spread',
      underlying,
      expiry,
      legs: [
        { strike: buyStrike, type: 'PE', action: 'BUY', ltp: buy.pe.ltp, iv: buy.pe.iv, delta: buy.pe.delta, oi: buy.pe.oi },
        { strike: sell.strike, type: 'PE', action: 'SELL', ltp: sell.pe.ltp, iv: sell.pe.iv, delta: sell.pe.delta, oi: sell.pe.oi },
      ],
      max_profit: premiumCollected,
      max_loss: maxLoss,
      breakeven: [breakeven],
      probability_score: score,
      risk_level: score >= 70 ? 'Low' : score >= 50 ? 'Medium' : 'High',
      iv_rank: ivRank,
      entry_price: premiumCollected,
    });

    if (alerts.length >= 3) break;
  }

  return alerts;
}

// ─── Bear Call Spread Scanner ────────────────────────────────────────

/**
 * Scan for Bear Call Spreads (credit call spreads).
 * Sell OTM call, buy further OTM call.
 * Best when: Bearish/neutral, IV elevated, underlying near resistance.
 */
function scanBearCallSpreads(chain, spotPrice, ivRank, underlying, expiry) {
  if (ivRank < 35) return [];

  const alerts = [];
  const stepSize = underlying === 'NIFTY' ? 50 : underlying === 'BANKNIFTY' ? 100 : 50;
  const wingWidth = stepSize * 2;

  const sellCandidates = chain.filter(r => {
    if (!r.ce || r.strike <= spotPrice) return false;
    const dist = (r.strike - spotPrice) / spotPrice;
    return dist >= 0.02 && dist <= 0.06 && isLiquid(r.ce);
  });

  for (const sell of sellCandidates) {
    const buyStrike = sell.strike + wingWidth;
    const buy = chain.find(r => r.strike === buyStrike);

    if (!buy?.ce?.ltp) continue;

    const premiumCollected = (sell.ce.ltp || 0) - (buy.ce.ltp || 0);
    if (premiumCollected <= 0) continue;

    const maxLoss = wingWidth - premiumCollected;
    if (maxLoss <= 0) continue;

    const riskReward = premiumCollected / maxLoss;
    const breakeven = sell.strike + premiumCollected;

    const callDist = (sell.strike - spotPrice) / spotPrice;
    const score = scoreStrategy({
      ivRank,
      riskReward,
      sellCallDelta: callDist < 0.02 ? 0.30 : callDist < 0.03 ? 0.22 : callDist < 0.04 ? 0.17 : 0.12,
      callOI: sell.ce.oi || 0,
      premiumCollected,
      maxLoss,
      strategy: 'bear_call_spread',
    });

    if (score < 45) continue;

    alerts.push({
      strategy: 'bear_call_spread',
      underlying,
      expiry,
      legs: [
        { strike: sell.strike, type: 'CE', action: 'SELL', ltp: sell.ce.ltp, iv: sell.ce.iv, delta: sell.ce.delta, oi: sell.ce.oi },
        { strike: buyStrike, type: 'CE', action: 'BUY', ltp: buy.ce.ltp, iv: buy.ce.iv, delta: buy.ce.delta, oi: buy.ce.oi },
      ],
      max_profit: premiumCollected,
      max_loss: maxLoss,
      breakeven: [breakeven],
      probability_score: score,
      risk_level: score >= 70 ? 'Low' : score >= 50 ? 'Medium' : 'High',
      iv_rank: ivRank,
      entry_price: premiumCollected,
    });

    if (alerts.length >= 3) break;
  }

  return alerts;
}

// ─── Short Strangle Scanner ─────────────────────────────────────────

/**
 * Scan for Short Strangles.
 * Sell OTM put + call at ~0.15 delta.
 * Best when: Very high IV Rank (>65%), rangebound underlying.
 * Higher risk — undefined risk without hedging.
 */
function scanShortStrangles(chain, spotPrice, ivRank, underlying, expiry) {
  if (ivRank < 55) return []; // Need high IV for strangles

  const alerts = [];

  const putCandidates = chain.filter(r => {
    if (!r.pe || r.strike >= spotPrice) return false;
    const dist = (spotPrice - r.strike) / spotPrice;
    return dist >= 0.03 && dist <= 0.06 && isLiquid(r.pe);
  });

  const callCandidates = chain.filter(r => {
    if (!r.ce || r.strike <= spotPrice) return false;
    const dist = (r.strike - spotPrice) / spotPrice;
    return dist >= 0.03 && dist <= 0.06 && isLiquid(r.ce);
  });

  for (const putSell of putCandidates) {
    for (const callSell of callCandidates) {
      const premiumCollected = (putSell.pe.ltp || 0) + (callSell.ce.ltp || 0);
      if (premiumCollected <= 0) continue;

      const lowerBreakeven = putSell.strike - premiumCollected;
      const upperBreakeven = callSell.strike + premiumCollected;

      // For strangles, max loss is theoretically unlimited.
      // Use 2x premium as a practical max loss estimate for scoring.
      const estimatedMaxLoss = premiumCollected * 2;
      const riskReward = premiumCollected / estimatedMaxLoss;

      const putDist = (spotPrice - putSell.strike) / spotPrice;
      const callDist = (callSell.strike - spotPrice) / spotPrice;
      const score = scoreStrategy({
        ivRank,
        riskReward,
        sellPutDelta: putDist < 0.02 ? 0.30 : putDist < 0.03 ? 0.22 : putDist < 0.04 ? 0.17 : 0.12,
        sellCallDelta: callDist < 0.02 ? 0.30 : callDist < 0.03 ? 0.22 : callDist < 0.04 ? 0.17 : 0.12,
        putOI: putSell.pe.oi || 0,
        callOI: callSell.ce.oi || 0,
        premiumCollected,
        maxLoss: estimatedMaxLoss,
        strategy: 'short_strangle',
      });

      // Higher threshold for strangles (undefined risk)
      if (score < 55) continue;

      alerts.push({
        strategy: 'short_strangle',
        underlying,
        expiry,
        legs: [
          { strike: putSell.strike, type: 'PE', action: 'SELL', ltp: putSell.pe.ltp, iv: putSell.pe.iv, delta: putSell.pe.delta, oi: putSell.pe.oi },
          { strike: callSell.strike, type: 'CE', action: 'SELL', ltp: callSell.ce.ltp, iv: callSell.ce.iv, delta: callSell.ce.delta, oi: callSell.ce.oi },
        ],
        max_profit: premiumCollected,
        max_loss: null, // Undefined
        breakeven: [lowerBreakeven, upperBreakeven],
        probability_score: score,
        risk_level: 'High', // Strangles are always higher risk
        iv_rank: ivRank,
        entry_price: premiumCollected,
      });

      if (alerts.filter(a => a.strategy === 'short_strangle').length >= 2) break;
    }
    if (alerts.filter(a => a.strategy === 'short_strangle').length >= 2) break;
  }

  return alerts;
}


// ─── IV Crush Scanner ────────────────────────────────────────────────

/**
 * Scan for IV Crush setups — sell premium before events (earnings, RBI policy).
 * Defined risk only: Iron Condors and credit spreads.
 * Requires IVR > 50, event within 1-5 days, high OI, tight spreads.
 */
function scanIVCrush(chain, spotPrice, ivRank, underlying, expiry, eventInfo) {
  if (ivRank < 70) return []; // IVR must be > 70

  const daysToEvent = daysUntilEvent(eventInfo.date);
  if (daysToEvent < 1 || daysToEvent > 5) return [];

  // Entry window: 10:15 AM - 11:30 AM IST only
  const now = new Date();
  const ist = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  const mins = ist.getHours() * 60 + ist.getMinutes();
  if (mins < 615 || mins > 690) return []; // 10:15=615, 11:30=690

  const alerts = [];
  const largeCap = isLargeCap(underlying) || underlying === 'NIFTY' || underlying === 'BANKNIFTY';
  const otmPctMin = largeCap ? 0.02 : 0.03;
  const otmPctMax = largeCap ? 0.03 : 0.04;

  const stepSize = underlying === 'NIFTY' ? 50 : underlying === 'BANKNIFTY' ? 100 : 50;
  const wingWidth = stepSize * 2;

  // IV Crush liquidity check (stricter OI, looser spread than standard)
  function isIVCrushLiquid(option) {
    if (!option) return false;
    if ((option.oi || 0) < IV_CRUSH_MIN_OI) return false;
    if (option.ltp > 0 && option.spread) {
      if ((option.spread / option.ltp) * 100 > IV_CRUSH_MAX_SPREAD_PCT) return false;
    }
    return true;
  }

  function buildExitRules() {
    return {
      profit_target_pct: 50,
      stop_loss_multiplier: 1.5,
      exit_post_event_mins: 60,
      no_hold_past_expiry_week: true,
    };
  }

  function buildEventMeta() {
    return {
      event_type: eventInfo.event_type,
      event_date: eventInfo.date,
      days_to_event: daysToEvent,
      event_name: eventInfo.name,
      exit_rules: buildExitRules(),
    };
  }

  // --- Iron Condor (preferred for IV Crush) ---
  const putSellCandidates = chain.filter(r => {
    if (!r.pe || r.strike >= spotPrice) return false;
    const dist = (spotPrice - r.strike) / spotPrice;
    return dist >= otmPctMin && dist <= otmPctMax && isIVCrushLiquid(r.pe);
  });

  const callSellCandidates = chain.filter(r => {
    if (!r.ce || r.strike <= spotPrice) return false;
    const dist = (r.strike - spotPrice) / spotPrice;
    return dist >= otmPctMin && dist <= otmPctMax && isIVCrushLiquid(r.ce);
  });

  for (const putSell of putSellCandidates) {
    for (const callSell of callSellCandidates) {
      const putBuyStrike = putSell.strike - wingWidth;
      const callBuyStrike = callSell.strike + wingWidth;
      const putBuy = chain.find(r => r.strike === putBuyStrike);
      const callBuy = chain.find(r => r.strike === callBuyStrike);

      if (!putBuy?.pe || !callBuy?.ce) continue;
      if (!putBuy.pe.ltp || !callBuy.ce.ltp) continue;

      const premiumCollected =
        (putSell.pe.ltp || 0) + (callSell.ce.ltp || 0) -
        (putBuy.pe.ltp || 0) - (callBuy.ce.ltp || 0);

      if (premiumCollected <= 0) continue;

      const maxLoss = wingWidth - premiumCollected;
      if (maxLoss <= 0) continue;

      const riskReward = premiumCollected / maxLoss;
      if (riskReward < 0.5) continue; // R:R >= 1:2

      const putDist = (spotPrice - putSell.strike) / spotPrice;
      const callDist = (callSell.strike - spotPrice) / spotPrice;
      const score = scoreStrategy({
        ivRank,
        riskReward,
        sellPutDelta: putDist < 0.02 ? 0.30 : putDist < 0.03 ? 0.22 : 0.17,
        sellCallDelta: callDist < 0.02 ? 0.30 : callDist < 0.03 ? 0.22 : 0.17,
        putOI: putSell.pe.oi || 0,
        callOI: callSell.ce.oi || 0,
        premiumCollected,
        maxLoss,
        strategy: 'iv_crush',
      });

      if (score < 50) continue;

      alerts.push({
        strategy: 'iv_crush',
        underlying,
        expiry,
        legs: [
          { strike: putBuyStrike, type: 'PE', action: 'BUY', ltp: putBuy.pe.ltp, iv: putBuy.pe.iv, delta: putBuy.pe.delta, oi: putBuy.pe.oi },
          { strike: putSell.strike, type: 'PE', action: 'SELL', ltp: putSell.pe.ltp, iv: putSell.pe.iv, delta: putSell.pe.delta, oi: putSell.pe.oi },
          { strike: callSell.strike, type: 'CE', action: 'SELL', ltp: callSell.ce.ltp, iv: callSell.ce.iv, delta: callSell.ce.delta, oi: callSell.ce.oi },
          { strike: callBuyStrike, type: 'CE', action: 'BUY', ltp: callBuy.ce.ltp, iv: callBuy.ce.iv, delta: callBuy.ce.delta, oi: callBuy.ce.oi },
        ],
        max_profit: premiumCollected,
        max_loss: maxLoss,
        breakeven: [putSell.strike - premiumCollected, callSell.strike + premiumCollected],
        probability_score: score,
        risk_level: score >= 70 ? 'Low' : score >= 50 ? 'Medium' : 'High',
        iv_rank: ivRank,
        entry_price: premiumCollected,
        ...buildEventMeta(),
      });

      if (alerts.filter(a => a.strategy === 'iv_crush').length >= 3) break;
    }
    if (alerts.filter(a => a.strategy === 'iv_crush').length >= 3) break;
  }

  // --- Credit Spreads (fallback if not enough Iron Condors) ---
  if (alerts.length < 2) {
    // Bull Put Spread
    for (const sell of putSellCandidates) {
      if (alerts.length >= 3) break;
      const buyStrike = sell.strike - wingWidth;
      const buy = chain.find(r => r.strike === buyStrike);
      if (!buy?.pe?.ltp) continue;

      const premium = (sell.pe.ltp || 0) - (buy.pe.ltp || 0);
      if (premium <= 0) continue;
      const loss = wingWidth - premium;
      if (loss <= 0 || premium / loss < 0.5) continue;

      const putDist = (spotPrice - sell.strike) / spotPrice;
      const score = scoreStrategy({
        ivRank, riskReward: premium / loss,
        sellPutDelta: putDist < 0.02 ? 0.30 : putDist < 0.03 ? 0.22 : 0.17,
        putOI: sell.pe.oi || 0, premiumCollected: premium, maxLoss: loss,
        strategy: 'iv_crush',
      });
      if (score < 50) continue;

      alerts.push({
        strategy: 'iv_crush', underlying, expiry,
        legs: [
          { strike: buyStrike, type: 'PE', action: 'BUY', ltp: buy.pe.ltp, iv: buy.pe.iv, delta: buy.pe.delta, oi: buy.pe.oi },
          { strike: sell.strike, type: 'PE', action: 'SELL', ltp: sell.pe.ltp, iv: sell.pe.iv, delta: sell.pe.delta, oi: sell.pe.oi },
        ],
        max_profit: premium, max_loss: loss,
        breakeven: [sell.strike - premium],
        probability_score: score,
        risk_level: score >= 70 ? 'Low' : score >= 50 ? 'Medium' : 'High',
        iv_rank: ivRank, entry_price: premium,
        ...buildEventMeta(),
      });
    }

    // Bear Call Spread
    for (const sell of callSellCandidates) {
      if (alerts.length >= 3) break;
      const buyStrike = sell.strike + wingWidth;
      const buy = chain.find(r => r.strike === buyStrike);
      if (!buy?.ce?.ltp) continue;

      const premium = (sell.ce.ltp || 0) - (buy.ce.ltp || 0);
      if (premium <= 0) continue;
      const loss = wingWidth - premium;
      if (loss <= 0 || premium / loss < 0.5) continue;

      const callDist = (sell.strike - spotPrice) / spotPrice;
      const score = scoreStrategy({
        ivRank, riskReward: premium / loss,
        sellCallDelta: callDist < 0.02 ? 0.30 : callDist < 0.03 ? 0.22 : 0.17,
        callOI: sell.ce.oi || 0, premiumCollected: premium, maxLoss: loss,
        strategy: 'iv_crush',
      });
      if (score < 50) continue;

      alerts.push({
        strategy: 'iv_crush', underlying, expiry,
        legs: [
          { strike: sell.strike, type: 'CE', action: 'SELL', ltp: sell.ce.ltp, iv: sell.ce.iv, delta: sell.ce.delta, oi: sell.ce.oi },
          { strike: buyStrike, type: 'CE', action: 'BUY', ltp: buy.ce.ltp, iv: buy.ce.iv, delta: buy.ce.delta, oi: buy.ce.oi },
        ],
        max_profit: premium, max_loss: loss,
        breakeven: [sell.strike + premium],
        probability_score: score,
        risk_level: score >= 70 ? 'Low' : score >= 50 ? 'Medium' : 'High',
        iv_rank: ivRank, entry_price: premium,
        ...buildEventMeta(),
      });
    }
  }

  return alerts;
}

// ─── Scoring Engine ──────────────────────────────────────────────────

/**
 * Score a strategy setup from 0–100.
 *
 * Components:
 *   IV Rank/Percentile (25 pts) — higher IV = better for selling
 *   OI & Volume liquidity (15 pts) — higher = easier fills
 *   Delta distance (20 pts) — wider = safer
 *   Risk/Reward ratio (20 pts) — better ratio = higher score
 *   Strategy-specific bonus (20 pts) — historical edge factors
 */
function scoreStrategy(params) {
  const {
    ivRank = 50,
    riskReward = 0.3,
    sellPutDelta = 0.20,
    sellCallDelta = 0.20,
    putOI = 0,
    callOI = 0,
    premiumCollected = 0,
    maxLoss = 1,
    strategy,
  } = params;

  let score = 0;

  // 1. IV Rank component (25 pts)
  // IV Rank 40 = 10pts, 50 = 15pts, 60 = 20pts, 70+ = 25pts
  score += Math.min(25, Math.max(0, (ivRank - 30) * 0.625));

  // 2. Liquidity component (15 pts)
  const avgOI = ((putOI || 0) + (callOI || 0)) / 2;
  if (avgOI >= 500000) score += 15;
  else if (avgOI >= 200000) score += 12;
  else if (avgOI >= 100000) score += 9;
  else if (avgOI >= MIN_OI) score += 6;

  // 3. Delta distance (20 pts) — lower delta = further OTM = safer
  const avgDelta = ((sellPutDelta || 0) + (sellCallDelta || 0)) / 2;
  if (avgDelta <= 0.12) score += 20;      // Very far OTM
  else if (avgDelta <= 0.16) score += 17;
  else if (avgDelta <= 0.20) score += 14;
  else if (avgDelta <= 0.25) score += 10;
  else score += 6;

  // 4. Risk/Reward (20 pts)
  if (riskReward >= 0.50) score += 20;
  else if (riskReward >= 0.40) score += 16;
  else if (riskReward >= 0.30) score += 12;
  else if (riskReward >= 0.20) score += 8;
  else score += 4;

  // 5. Strategy-specific bonus (20 pts)
  switch (strategy) {
    case 'iron_condor':
      // Bonus for balanced (put delta ≈ call delta)
      if (sellPutDelta && sellCallDelta) {
        const deltaBalance = 1 - Math.abs(sellPutDelta - sellCallDelta) / Math.max(sellPutDelta, sellCallDelta);
        score += deltaBalance * 10;
      }
      // Bonus for wide range
      score += Math.min(10, riskReward * 20);
      break;

    case 'bull_put_spread':
    case 'bear_call_spread':
      // Defined risk bonus
      score += 10;
      // Extra points for good risk/reward on spreads
      score += Math.min(10, riskReward * 15);
      break;

    case 'iv_crush':
      // Bonus for high IV (main edge for crush)
      score += Math.min(10, (ivRank - 50) * 0.5);
      // Defined risk bonus
      score += 10;
      break;
    case 'short_strangle':
      // Penalty for undefined risk, but bonus for very high IV
      score += Math.min(10, (ivRank - 55) * 0.5);
      score += Math.min(10, riskReward * 20);
      break;
  }

  return Math.max(0, Math.min(100, Math.round(score)));
}

/**
 * Get the nearest weekly/monthly expiry string for an underlying.
 * Returns a string like '27MAR2026'.
 */
export function getNextExpiry(underlying) {
  const now = new Date();
  const day = now.getDay();
  const months = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];

  // Weekly expiry: NIFTY expires Thursday, BANKNIFTY expires Wednesday
  const expiryDay = underlying === 'BANKNIFTY' ? 3 : 4; // Wed or Thu
  let daysUntilExpiry = (expiryDay - day + 7) % 7;
  if (daysUntilExpiry === 0) daysUntilExpiry = 7; // If today is expiry, get next week

  const expiryDate = new Date(now);
  expiryDate.setDate(expiryDate.getDate() + daysUntilExpiry);

  const dd = String(expiryDate.getDate()).padStart(2, '0');
  const mmm = months[expiryDate.getMonth()];
  const yyyy = expiryDate.getFullYear();

  return `${dd}${mmm}${yyyy}`;
}

export default {
  scanStrategies,
  getNextExpiry,
};
