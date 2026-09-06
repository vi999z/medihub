function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function calculateExpiryRisk({ quantityRemaining, dailyVelocity, daysLeft, reorderLevel = 10 }) {
  // ─── Edge case: no stock left — nothing to expire, no risk ───
  if (quantityRemaining <= 0) return 0;

  // ─── Edge case: already expired or expires today ───
  if (daysLeft <= 0) return 0.95;

  const safeStockBuffer = Math.max(1, reorderLevel * 0.6);
  const projectedSellThroughDays = dailyVelocity > 0 ? quantityRemaining / dailyVelocity : Infinity;

  let risk = 0;

  // ─── Core risk: will the stock sell through before expiry? ───
  if (projectedSellThroughDays > daysLeft) {
    // Takes longer to sell than days left → stock will likely expire before selling through
    // The bigger the gap, the higher the risk
    const shortageGap = (projectedSellThroughDays - daysLeft) / Math.max(1, projectedSellThroughDays);
    risk += 0.5 + shortageGap * 0.5;
  } else if (projectedSellThroughDays >= daysLeft * 0.75) {
    // Barely sells through in time (uses 75-100% of remaining shelf life) — moderate risk
    risk += 0.25;
  }

  // ─── Low stock buffer: small quantities are harder to move and more volatile ───
  if (quantityRemaining <= safeStockBuffer) {
    risk += 0.25;
  }

  // ─── No demand at all: stock is sitting still and will likely expire ───
  if (dailyVelocity <= 0) {
    risk += 0.2;
  }

  // ─── Time pressure: the closer to expiry, the more urgent ───
  if (daysLeft <= 3) {
    risk += 0.3;
  } else if (daysLeft <= 7) {
    risk += 0.2;
  } else if (daysLeft <= 14) {
    risk += 0.1;
  }

  return clamp(risk, 0, 0.95);
}

module.exports = { calculateExpiryRisk };