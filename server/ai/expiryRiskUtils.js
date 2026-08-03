function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function calculateExpiryRisk({ quantityRemaining, dailyVelocity, daysLeft, reorderLevel = 10 }) {
  const safeStockBuffer = Math.max(1, reorderLevel * 0.6);
  const projectedSellThroughDays = dailyVelocity > 0 ? quantityRemaining / dailyVelocity : Infinity;

  let risk = 0;

  if (daysLeft <= 0) {
    return 0.95;
  }

  if (projectedSellThroughDays < daysLeft) {
    const shortageGap = (daysLeft - projectedSellThroughDays) / Math.max(1, daysLeft);
    risk += 0.5 + shortageGap * 0.5;
  } else if (projectedSellThroughDays <= daysLeft * 1.25) {
    risk += 0.25;
  }

  if (quantityRemaining <= safeStockBuffer) {
    risk += 0.15;
  }

  if (dailyVelocity <= 0) {
    risk += 0.2;
  }

  if (daysLeft <= 7) {
    risk += 0.2;
  } else if (daysLeft <= 30) {
    risk += 0.08;
  }

  return clamp(risk, 0, 0.95);
}

module.exports = { calculateExpiryRisk };
