export const GLOBAL_WHOLESALE_ORIGIN = Object.freeze({
  id: 'farm-demo-origin',
  city: '重庆',
  label: '当前农场（重庆）',
  coordinates: Object.freeze([106.5516, 29.563])
});

export const GLOBAL_ROUTE_PROFILES = Object.freeze({
  AIR: Object.freeze({
    code: 'AIR', label: '航空冷链', icon: '✈️', color: '#5b8dd9', lineType: 'dashed',
    fixedDays: 1, kmPerDay: 3900, baseFreightCnyKg: 7.2, freightCnyKgPerKm: 0.00145,
    handlingCnyKg: 0.9, baseLossPct: 2.2, lossPctPerDay: 0.65
  }),
  RAIL: Object.freeze({
    code: 'RAIL', label: '铁路冷链', icon: '🚆', color: '#b88743', lineType: 'dotted',
    fixedDays: 4, kmPerDay: 850, baseFreightCnyKg: 3.0, freightCnyKgPerKm: 0.0005,
    handlingCnyKg: 0.65, baseLossPct: 3.5, lossPctPerDay: 0.7
  }),
  SEA: Object.freeze({
    code: 'SEA', label: '海运冷链', icon: '🚢', color: '#2f9d84', lineType: 'solid',
    fixedDays: 6, kmPerDay: 560, baseFreightCnyKg: 1.5, freightCnyKgPerKm: 0.00018,
    handlingCnyKg: 0.55, baseLossPct: 4.5, lossPctPerDay: 0.85
  })
});

export const GLOBAL_EXPORT_CROP_PROFILES = Object.freeze({
  tomato: Object.freeze({ shelfLifeDays: 14, demoOriginPriceCnyKg: 4.8, demoBuyerBaseCnyKg: 25, packingCnyKg: 1.2 }),
  corn: Object.freeze({ shelfLifeDays: 7, demoOriginPriceCnyKg: 3.6, demoBuyerBaseCnyKg: 18, packingCnyKg: 1.1 }),
  cucumber: Object.freeze({ shelfLifeDays: 10, demoOriginPriceCnyKg: 3.9, demoBuyerBaseCnyKg: 22, packingCnyKg: 1.2 }),
  eggplant: Object.freeze({ shelfLifeDays: 12, demoOriginPriceCnyKg: 4.2, demoBuyerBaseCnyKg: 23, packingCnyKg: 1.3 }),
  lettuce: Object.freeze({ shelfLifeDays: 6, demoOriginPriceCnyKg: 5.6, demoBuyerBaseCnyKg: 26, packingCnyKg: 1.5 }),
  pepper: Object.freeze({ shelfLifeDays: 18, demoOriginPriceCnyKg: 5.1, demoBuyerBaseCnyKg: 28, packingCnyKg: 1.25 }),
  rice: Object.freeze({ shelfLifeDays: 180, demoOriginPriceCnyKg: 4.7, demoBuyerBaseCnyKg: 13, packingCnyKg: 0.75 }),
  strawberry: Object.freeze({ shelfLifeDays: 5, demoOriginPriceCnyKg: 14.8, demoBuyerBaseCnyKg: 58, packingCnyKg: 2.2 }),
  sunflower: Object.freeze({ shelfLifeDays: 240, demoOriginPriceCnyKg: 8.4, demoBuyerBaseCnyKg: 19, packingCnyKg: 0.8 }),
  unknown: Object.freeze({ shelfLifeDays: 10, demoOriginPriceCnyKg: 5, demoBuyerBaseCnyKg: 24, packingCnyKg: 1.3 })
});

export const GLOBAL_WHOLESALE_MARKETS = Object.freeze([
  Object.freeze({ id: 'tokyo', country: '日本', city: '东京', marketName: '东京都中央批发市场', region: '东亚', coordinates: Object.freeze([139.75, 35.68]), modes: Object.freeze(['AIR', 'SEA']), demoPriceIndex: 1.15, demoBorderCostPct: 8, complianceHint: '需核对植物检疫、农残限量、日文标签与进口商资质。' }),
  Object.freeze({ id: 'singapore', country: '新加坡', city: '新加坡', marketName: '巴西班让批发中心', region: '东南亚', coordinates: Object.freeze([103.76, 1.29]), modes: Object.freeze(['AIR', 'SEA']), demoPriceIndex: 1.08, demoBorderCostPct: 3, complianceHint: '需核对进口许可、冷链交接、包装标签与买方规格。' }),
  Object.freeze({ id: 'dubai', country: '阿联酋', city: '迪拜', marketName: 'Al Aweer 果蔬市场', region: '中东', coordinates: Object.freeze([55.37, 25.18]), modes: Object.freeze(['AIR', 'SEA']), demoPriceIndex: 1.12, demoBorderCostPct: 5, complianceHint: '需核对清真/标签要求、进口商资质、温控记录与口岸查验。' }),
  Object.freeze({ id: 'rotterdam', country: '荷兰', city: '鹿特丹', marketName: 'Food Center Rotterdam', region: '欧洲', coordinates: Object.freeze([4.48, 51.92]), modes: Object.freeze(['AIR', 'RAIL', 'SEA']), demoPriceIndex: 0.98, demoBorderCostPct: 7, complianceHint: '需核对欧盟植物健康、农残、可追溯、包装和进口商责任。' }),
  Object.freeze({ id: 'london', country: '英国', city: '伦敦', marketName: 'New Covent Garden Market', region: '欧洲', coordinates: Object.freeze([-0.14, 51.49]), modes: Object.freeze(['AIR', 'RAIL']), demoPriceIndex: 1.05, demoBorderCostPct: 7, complianceHint: '需核对英国植物检疫、农残标准、进口申报与冷链承运能力。' }),
  Object.freeze({ id: 'los-angeles', country: '美国', city: '洛杉矶', marketName: 'Los Angeles Wholesale Produce Market', region: '北美', coordinates: Object.freeze([-118.24, 34.05]), modes: Object.freeze(['AIR', 'SEA']), demoPriceIndex: 1.1, demoBorderCostPct: 10, complianceHint: '需核对 USDA/口岸检疫、州级要求、进口商资质与标签规则。' }),
  Object.freeze({ id: 'toronto', country: '加拿大', city: '多伦多', marketName: 'Ontario Food Terminal', region: '北美', coordinates: Object.freeze([-79.5, 43.63]), modes: Object.freeze(['AIR', 'SEA']), demoPriceIndex: 1.04, demoBorderCostPct: 6, complianceHint: '需核对 CFIA 进口条件、双语标签、农残和冷链记录。' }),
  Object.freeze({ id: 'sydney', country: '澳大利亚', city: '悉尼', marketName: 'Sydney Markets', region: '大洋洲', coordinates: Object.freeze([151.0, -33.87]), modes: Object.freeze(['AIR', 'SEA']), demoPriceIndex: 1.18, demoBorderCostPct: 10, complianceHint: '需核对严格生物安全准入、处理证明、进口许可与温控。' }),
  Object.freeze({ id: 'sao-paulo', country: '巴西', city: '圣保罗', marketName: 'CEAGESP', region: '南美', coordinates: Object.freeze([-46.72, -23.54]), modes: Object.freeze(['AIR', 'SEA']), demoPriceIndex: 0.88, demoBorderCostPct: 11, complianceHint: '需核对 MAPA 植物检疫、进口许可、葡语标签与口岸清关。' })
]);

const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, Number(value) || 0));
const round = (value, digits = 2) => {
  const factor = 10 ** digits;
  return Math.round((Number(value) + Number.EPSILON) * factor) / factor;
};

export function exportCropProfile(cropCode) {
  return GLOBAL_EXPORT_CROP_PROFILES[String(cropCode || '').toLowerCase()] || GLOBAL_EXPORT_CROP_PROFILES.unknown;
}

export function greatCircleDistanceKm(from, to) {
  const [fromLon, fromLat] = from.map(Number);
  const [toLon, toLat] = to.map(Number);
  const radians = value => value * Math.PI / 180;
  const latitudeDelta = radians(toLat - fromLat);
  const longitudeDelta = radians(toLon - fromLon);
  const a = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(radians(fromLat)) * Math.cos(radians(toLat)) * Math.sin(longitudeDelta / 2) ** 2;
  return round(6371.0088 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)), 0);
}

export function routeFacts(market, mode, origin = GLOBAL_WHOLESALE_ORIGIN) {
  const profile = GLOBAL_ROUTE_PROFILES[String(mode || '').toUpperCase()];
  if (!profile || !market?.modes?.includes(profile.code)) return null;
  const distanceKm = greatCircleDistanceKm(origin.coordinates, market.coordinates);
  const transitDays = Math.max(1, Math.ceil(profile.fixedDays + distanceKm / profile.kmPerDay));
  const freightCnyKg = round(profile.baseFreightCnyKg + distanceKm * profile.freightCnyKgPerKm);
  const expectedLossPct = round(clamp(profile.baseLossPct + transitDays * profile.lossPctPerDay, 1, 35), 1);
  return Object.freeze({
    mode: profile.code,
    modeLabel: profile.label,
    modeIcon: profile.icon,
    color: profile.color,
    lineType: profile.lineType,
    distanceKm,
    transitDays,
    freightCnyKg,
    handlingCnyKg: profile.handlingCnyKg,
    expectedLossPct,
    provenance: 'SIMULATED'
  });
}

export function demoBuyerQuoteCnyKg(cropCode, market) {
  const profile = exportCropProfile(cropCode);
  return round(profile.demoBuyerBaseCnyKg * Number(market?.demoPriceIndex || 1));
}

export function estimateGlobalWholesaleRoute({
  cropCode,
  market,
  mode,
  quantityKg = 1000,
  originPriceCnyKg,
  packingCnyKg,
  buyerQuoteCnyKg
} = {}) {
  const crop = exportCropProfile(cropCode);
  const route = routeFacts(market, mode);
  if (!route) return null;
  const quantity = clamp(quantityKg, 1, 1000000);
  const originPrice = clamp(originPriceCnyKg ?? crop.demoOriginPriceCnyKg, 0, 100000);
  const packing = clamp(packingCnyKg ?? crop.packingCnyKg, 0, 100000);
  const buyerQuote = clamp(buyerQuoteCnyKg ?? demoBuyerQuoteCnyKg(cropCode, market), 0, 100000);
  const borderRate = clamp(market?.demoBorderCostPct, 0, 100) / 100;
  const preBorderUnitCost = originPrice + packing + route.freightCnyKg + route.handlingCnyKg;
  const borderCostCnyKg = round(preBorderUnitCost * borderRate);
  const totalCostCny = round(quantity * (preBorderUnitCost + borderCostCnyKg));
  const sellableKg = round(quantity * (1 - route.expectedLossPct / 100), 1);
  const landedCostCnyKg = sellableKg > 0 ? round(totalCostCny / sellableKg) : null;
  const simulatedRevenueCny = round(sellableKg * buyerQuote);
  const simulatedMarginCny = round(simulatedRevenueCny - totalCostCny);
  const shelfLifeRatio = route.transitDays / Math.max(1, crop.shelfLifeDays);
  const readinessStatus = route.transitDays >= crop.shelfLifeDays
    ? 'UNAVAILABLE'
    : shelfLifeRatio >= 0.65
      ? 'HUMAN_REVIEW'
      : 'NEEDS_EVIDENCE';
  return Object.freeze({
    ...route,
    cropCode: String(cropCode || 'unknown'),
    shelfLifeDays: crop.shelfLifeDays,
    quantityKg: quantity,
    originPriceCnyKg: round(originPrice),
    packingCnyKg: round(packing),
    buyerQuoteCnyKg: round(buyerQuote),
    demoBorderCostPct: round(borderRate * 100, 1),
    borderCostCnyKg,
    sellableKg,
    landedCostCnyKg,
    totalCostCny,
    simulatedRevenueCny,
    simulatedMarginCny,
    simulatedMarginCnyKg: sellableKg > 0 ? round(simulatedMarginCny / sellableKg) : null,
    readinessStatus,
    provenance: 'SIMULATED',
    executable: false
  });
}

