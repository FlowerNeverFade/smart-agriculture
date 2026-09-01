function finite(value) {
  if (value == null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function roundPrice(value) {
  return Math.round(Number(value) * 100) / 100;
}

function dateKey(value) {
  const text = String(value || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Builds a deterministic visual scenario anchored to an observed daily quote.
 * These values are never persisted and must not be used as market history or
 * as input to sales observations.
 */
export function buildDomesticMarketScenario(crop, requestedRangeDays = 30) {
  const anchorPrice = finite(crop?.latestPrice);
  if (anchorPrice == null || anchorPrice <= 0) return [];

  const rangeDays = Number(requestedRangeDays) <= 7 ? 7 : Number(requestedRangeDays) <= 30 ? 30 : 90;
  const cropCode = String(crop?.cropCode || 'crop');
  const phase = cropCode.split('').reduce((sum, character) => sum + character.charCodeAt(0), 0) % 29;
  const direction = (phase % 5) - 2;
  const rawOffset = index => (
    Math.sin((index + phase) / 4.8) * anchorPrice * 0.055
    + Math.cos((index + phase * 0.7) / 9.2) * anchorPrice * 0.025
    + (index - rangeDays + 1) * anchorPrice * 0.00045 * direction
  );
  const anchorOffset = rawOffset(rangeDays - 1);
  const end = new Date(`${dateKey(crop?.quoteDate)}T12:00:00Z`);

  return Array.from({ length: rangeDays }, (_, index) => {
    const date = new Date(end);
    date.setUTCDate(end.getUTCDate() - (rangeDays - index - 1));
    const value = Math.max(0.1, anchorPrice + rawOffset(index) - anchorOffset);
    return {
      date: date.toISOString().slice(0, 10),
      price: roundPrice(value),
      provenance: 'SIMULATED_SCENARIO',
      executable: false
    };
  });
}
