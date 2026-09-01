package com.agriloop;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.http.HttpStatus;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.stereotype.Service;

import javax.crypto.Cipher;
import javax.crypto.spec.IvParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Base64;
import java.util.Collection;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;
import java.util.stream.Collectors;

/**
 * Daily wholesale-price read model for farm administrators.
 *
 * <p>The upstream publishes one quotation per market and day.  AgriLoop does
 * not invent OHLC ticks or interpolate missing dates: it archives attributable
 * daily observations and leaves gaps visible in the chart.</p>
 */
@Service
class MarketPriceService {
    static final String SNAPSHOT_TYPE = "market-price-snapshot";
    static final String SOURCE_URL = "https://pfsc.agri.cn/";
    static final ZoneId BUSINESS_ZONE = ZoneId.of("Asia/Shanghai");
    static final List<CropQuoteDefinition> CATALOG = List.of(
            new CropQuoteDefinition("tomato", "番茄", "西红柿", "135", "🍅"),
            new CropQuoteDefinition("corn", "玉米", "鲜食玉米", "155", "🌽"),
            new CropQuoteDefinition("cucumber", "黄瓜", "黄瓜", "139", "🥒"),
            new CropQuoteDefinition("eggplant", "茄子", "茄子", "138", "🍆"),
            new CropQuoteDefinition("lettuce", "生菜", "生菜", "81", "🥬"),
            new CropQuoteDefinition("pepper", "辣椒", "青椒", "137", "🌶️"),
            new CropQuoteDefinition("rice", "水稻", "大米", "6", "🌾"),
            new CropQuoteDefinition("strawberry", "草莓", "草莓", "174", "🍓"),
            new CropQuoteDefinition("sunflower", "向日葵", "葵花籽", "33", "🌻")
    );
    private static final Map<String, CropQuoteDefinition> CATALOG_BY_CODE = CATALOG.stream()
            .collect(Collectors.toUnmodifiableMap(CropQuoteDefinition::cropCode, definition -> definition));

    private final AgriStore store;
    private final MarketPriceProvider provider;
    private final AgriProperties properties;
    private final ConcurrentMap<String, Instant> lastAttemptAt = new ConcurrentHashMap<>();
    private final ConcurrentMap<String, MarketQuoteBatch> transientLatest = new ConcurrentHashMap<>();

    MarketPriceService(AgriStore store, MarketPriceProvider provider, AgriProperties properties) {
        this.store = store;
        this.provider = provider;
        this.properties = properties;
    }

    Map<String, Object> overview(String farmId, int requestedRangeDays, boolean includeCatalog, UserPrincipal principal) {
        if (principal == null || !principal.isFarmAdmin()) {
            throw new ApiException(HttpStatus.FORBIDDEN, "MARKET_PRICE_FORBIDDEN", "只有农场管理员可以查看农产品市场行情");
        }
        String selectedFarm = String.valueOf(farmId == null ? "" : farmId).trim();
        if (selectedFarm.isBlank() || !principal.canAccessFarm(selectedFarm)) {
            throw new ApiException(HttpStatus.FORBIDDEN, "FARM_FORBIDDEN", "当前账号没有该农场的行情查看权限");
        }

        int rangeDays = normalizeRange(requestedRangeDays);
        Set<String> farmCropCodes = activeFarmCropCodes(selectedFarm);
        List<CropQuoteDefinition> definitions = includeCatalog
                ? CATALOG
                : CATALOG.stream().filter(definition -> farmCropCodes.contains(definition.cropCode())).toList();
        definitions.forEach(this::refreshIfDue);

        LocalDate cutoff = LocalDate.now(BUSINESS_ZONE).minusDays(rangeDays - 1L);
        Map<String, Map<LocalDate, Map<String, Object>>> byCrop = snapshotIndex(cutoff);
        List<Map<String, Object>> crops = definitions.stream()
                .map(definition -> cropView(definition, byCrop.getOrDefault(definition.cropCode(), Map.of()), farmCropCodes, rangeDays))
                .toList();

        LocalDate asOf = crops.stream().map(item -> parseDate(item.get("quoteDate")))
                .filter(Optional::isPresent).map(Optional::get).max(Comparator.naturalOrder()).orElse(null);
        long available = crops.stream().filter(item -> Boolean.TRUE.equals(item.get("available"))).count();
        boolean live = crops.stream().anyMatch(item -> "LIVE".equals(item.get("status")));

        Map<String, Object> source = new LinkedHashMap<>();
        source.put("provider", "MOA_PFSC");
        source.put("name", "全国农产品批发市场价格信息系统");
        source.put("url", SOURCE_URL);
        source.put("cadence", "DAILY");
        source.put("provinceCode", properties.getMarketPriceProvinceCode());
        source.put("provinceName", properties.getMarketPriceProvinceName());
        source.put("preferredMarket", properties.getMarketPricePreferredMarket());
        source.put("unit", "元/公斤");
        source.put("method", "市场上报的大宗交易均价；跨市场汇总为简单平均，非成交量加权");
        source.put("disclaimer", "行情仅供经营参考，不构成保价或销售承诺；出货前仍需核对品质、规格、物流和采购方实时询价。");

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("farmId", selectedFarm);
        result.put("scope", includeCatalog ? "ALL_CATALOG" : "FARM_CROPS");
        result.put("rangeDays", rangeDays);
        result.put("sourceStatus", live ? "LIVE" : available > 0 ? "CACHED" : properties.isMarketPriceEnabled() ? "UNAVAILABLE" : "DISABLED");
        result.put("asOf", asOf == null ? null : asOf.toString());
        result.put("generatedAt", Instant.now().toString());
        result.put("historyPersistence", store.persistenceKind());
        result.put("farmCropCodes", new ArrayList<>(farmCropCodes));
        result.put("availableCropCount", available);
        result.put("totalCropCount", crops.size());
        result.put("source", source);
        result.put("crops", crops);
        return result;
    }

    @Scheduled(cron = "${agriloop.market-price-refresh-cron:0 20 6 * * *}", zone = "Asia/Shanghai")
    void refreshActiveCrops() {
        if (!properties.isMarketPriceEnabled() || !store.databaseReady()) return;
        activeCropCodesAcrossFarms().stream().map(CATALOG_BY_CODE::get).filter(java.util.Objects::nonNull)
                .forEach(definition -> {
                    try { refresh(definition); }
                    catch (RuntimeException ignored) { /* The next page request remains a retry path. */ }
                });
    }

    private void refreshIfDue(CropQuoteDefinition definition) {
        if (!properties.isMarketPriceEnabled()) return;
        String key = sourceKey(definition.cropCode());
        Instant last = lastAttemptAt.get(key);
        long cacheMinutes = Math.max(1, properties.getMarketPriceCacheMinutes());
        if (last != null && last.plus(cacheMinutes, ChronoUnit.MINUTES).isAfter(Instant.now())) return;
        refresh(definition);
    }

    private void refresh(CropQuoteDefinition definition) {
        String key = sourceKey(definition.cropCode());
        lastAttemptAt.put(key, Instant.now());
        try {
            Optional<MarketQuoteBatch> fetched = provider.fetch(definition, properties.getMarketPriceProvinceCode());
            if (fetched.isEmpty()) return;
            MarketQuoteBatch batch = fetched.get();
            transientLatest.put(key, batch);
            if (store.databaseReady()) {
                Map<String, Object> snapshot = snapshot(definition, batch);
                store.save(SNAPSHOT_TYPE, snapshotId(definition.cropCode(), batch.sourceDate()), snapshot);
            }
        } catch (Exception ignored) {
            // A market-data outage never turns into fabricated prices.  The
            // caller receives the latest attributed snapshot or UNAVAILABLE.
        }
    }

    private Map<String, Map<LocalDate, Map<String, Object>>> snapshotIndex(LocalDate cutoff) {
        Map<String, Map<LocalDate, Map<String, Object>>> byCrop = new LinkedHashMap<>();
        for (Map<String, Object> snapshot : store.list(SNAPSHOT_TYPE)) addSnapshot(byCrop, snapshot, cutoff);
        for (Map.Entry<String, MarketQuoteBatch> entry : transientLatest.entrySet()) {
            String cropCode = entry.getKey().substring(entry.getKey().indexOf('|') + 1);
            CropQuoteDefinition definition = CATALOG_BY_CODE.get(cropCode);
            if (definition != null) addSnapshot(byCrop, snapshot(definition, entry.getValue()), cutoff);
        }
        return byCrop;
    }

    private void addSnapshot(Map<String, Map<LocalDate, Map<String, Object>>> index,
                             Map<String, Object> snapshot, LocalDate cutoff) {
        String cropCode = Jsons.text(snapshot, "cropCode", "").toLowerCase(Locale.ROOT);
        String provinceCode = Jsons.text(snapshot, "provinceCode", "");
        Optional<LocalDate> date = parseDate(snapshot.get("quoteDate"));
        if (!properties.getMarketPriceProvinceCode().equals(provinceCode)
                || !CATALOG_BY_CODE.containsKey(cropCode)
                || date.isEmpty()
                || date.get().isBefore(cutoff)) return;
        index.computeIfAbsent(cropCode, ignored -> new LinkedHashMap<>()).put(date.get(), snapshot);
    }

    private Map<String, Object> cropView(CropQuoteDefinition definition,
                                         Map<LocalDate, Map<String, Object>> dated,
                                         Set<String> farmCropCodes,
                                         int rangeDays) {
        List<Map<String, Object>> history = dated.entrySet().stream().sorted(Map.Entry.comparingByKey())
                .map(entry -> historyPoint(entry.getValue())).toList();
        Map<String, Object> latestSnapshot = dated.entrySet().stream().max(Map.Entry.comparingByKey())
                .map(Map.Entry::getValue).orElse(null);
        LocalDate today = LocalDate.now(BUSINESS_ZONE);
        boolean fresh = latestSnapshot != null && today.equals(parseDate(latestSnapshot.get("quoteDate")).orElse(null))
                && transientLatest.containsKey(sourceKey(definition.cropCode()));
        Double latestPrice = latestSnapshot == null ? null : finite(latestSnapshot.get("price"));
        Double previousPrice = history.size() < 2 ? null : finite(history.get(history.size() - 2).get("price"));
        Double change = latestPrice == null || previousPrice == null ? null : round(latestPrice - previousPrice);
        Double changePct = change == null || previousPrice == 0 ? null : round(change / previousPrice * 100);
        List<Double> lastSeven = history.stream().skip(Math.max(0, history.size() - 7L))
                .map(point -> finite(point.get("price"))).filter(java.util.Objects::nonNull).toList();
        Double movingAverage7 = lastSeven.isEmpty() ? null : round(lastSeven.stream().mapToDouble(Double::doubleValue).average().orElse(0));
        Double sevenDayChangePct = lastSeven.size() < 2 || lastSeven.get(0) == 0 ? null
                : round((lastSeven.get(lastSeven.size() - 1) - lastSeven.get(0)) / lastSeven.get(0) * 100);

        Map<String, Object> view = new LinkedHashMap<>();
        view.put("cropCode", definition.cropCode());
        view.put("cropName", definition.cropName());
        view.put("marketVarietyName", definition.marketVarietyName());
        view.put("emoji", definition.emoji());
        view.put("inFarm", farmCropCodes.contains(definition.cropCode()));
        view.put("available", latestPrice != null);
        view.put("status", latestPrice == null ? "UNAVAILABLE" : fresh ? "LIVE" : "CACHED");
        view.put("quoteDate", latestSnapshot == null ? null : latestSnapshot.get("quoteDate"));
        view.put("latestPrice", latestPrice);
        view.put("unit", "元/公斤");
        view.put("change", change);
        view.put("changePct", changePct);
        view.put("sevenDayChangePct", sevenDayChangePct);
        view.put("movingAverage7", movingAverage7);
        view.put("minPrice", latestSnapshot == null ? null : latestSnapshot.get("minPrice"));
        view.put("maxPrice", latestSnapshot == null ? null : latestSnapshot.get("maxPrice"));
        view.put("marketCount", latestSnapshot == null ? 0 : latestSnapshot.get("marketCount"));
        view.put("priceBasis", latestSnapshot == null ? null : latestSnapshot.get("priceBasis"));
        view.put("preferredMarket", properties.getMarketPricePreferredMarket());
        view.put("marketQuotes", latestSnapshot == null ? List.of() : latestSnapshot.getOrDefault("marketQuotes", List.of()));
        view.put("history", history);
        view.put("historyDays", history.size());
        view.put("requestedRangeDays", rangeDays);
        view.put("salesObservation", salesObservation(latestPrice, changePct, movingAverage7, history.size()));
        return view;
    }

    static Map<String, Object> salesObservation(Double current, Double changePct, Double movingAverage7, int observationDays) {
        String tone = "NEUTRAL";
        String label = "数据积累中";
        String message = "先比较各市场报价，并结合采收成熟度、品质规格、订单和物流成本线下询价。";
        if (current != null && movingAverage7 != null && observationDays >= 3) {
            if (changePct != null && changePct >= 1 && current > movingAverage7) {
                tone = "STRONG"; label = "价格偏强";
                message = "可优先向高价市场分批询价，但不要仅凭单日上涨决定全部出货。";
            } else if (changePct != null && changePct <= -1 && current < movingAverage7) {
                tone = "WEAK"; label = "价格回落";
                message = "可优先核对已有订单与耐储性，避免仅凭短期下跌集中出货。";
            } else {
                tone = "RANGE"; label = "价格震荡";
                message = "可采用分批销售，并同步比较采购报价、品质等级、物流和采收窗口。";
            }
        }
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("tone", tone); result.put("label", label); result.put("message", message);
        result.put("basis", "最近可用日价与7日简单移动平均；缺失日期不插值");
        result.put("actionable", observationDays >= 3);
        return result;
    }

    private Map<String, Object> snapshot(CropQuoteDefinition definition, MarketQuoteBatch batch) {
        List<MarketQuote> quotes = batch.quotes().stream().filter(quote -> quote.price() > 0).toList();
        double average = quotes.stream().mapToDouble(MarketQuote::price).average().orElse(Double.NaN);
        MarketQuote preferred = quotes.stream()
                .filter(quote -> quote.marketName().equals(properties.getMarketPricePreferredMarket()))
                .findFirst().orElse(null);
        Double price = preferred == null ? (Double.isFinite(average) ? round(average) : null) : round(preferred.price());
        List<Map<String, Object>> marketQuotes = quotes.stream().sorted(Comparator.comparingDouble(MarketQuote::price).reversed())
                .map(quote -> {
                    Map<String, Object> item = new LinkedHashMap<>();
                    item.put("marketName", quote.marketName()); item.put("price", round(quote.price())); item.put("unit", "元/公斤");
                    item.put("preferred", quote.marketName().equals(properties.getMarketPricePreferredMarket()));
                    return item;
                }).toList();
        Map<String, Object> snapshot = new LinkedHashMap<>();
        snapshot.put("snapshotId", snapshotId(definition.cropCode(), batch.sourceDate()));
        snapshot.put("cropCode", definition.cropCode());
        snapshot.put("cropName", definition.cropName());
        snapshot.put("marketVarietyId", definition.varietyId());
        snapshot.put("marketVarietyName", definition.marketVarietyName());
        snapshot.put("provinceCode", properties.getMarketPriceProvinceCode());
        snapshot.put("provinceName", properties.getMarketPriceProvinceName());
        snapshot.put("quoteDate", batch.sourceDate().toString());
        snapshot.put("price", price);
        snapshot.put("priceBasis", preferred == null ? "PROVINCE_SIMPLE_AVERAGE" : "PREFERRED_MARKET");
        snapshot.put("preferredMarket", properties.getMarketPricePreferredMarket());
        snapshot.put("minPrice", quotes.isEmpty() ? null : round(quotes.stream().mapToDouble(MarketQuote::price).min().orElse(0)));
        snapshot.put("maxPrice", quotes.isEmpty() ? null : round(quotes.stream().mapToDouble(MarketQuote::price).max().orElse(0)));
        snapshot.put("averagePrice", Double.isFinite(average) ? round(average) : null);
        snapshot.put("marketCount", quotes.size());
        snapshot.put("marketQuotes", marketQuotes);
        snapshot.put("unit", "元/公斤");
        snapshot.put("fetchedAt", batch.fetchedAt().toString());
        snapshot.put("sourceMode", "LIVE");
        snapshot.put("provenance", "OBSERVED");
        snapshot.put("dataOrigin", "MOA_PFSC");
        snapshot.put("sourceUrl", SOURCE_URL);
        return snapshot;
    }

    private Map<String, Object> historyPoint(Map<String, Object> snapshot) {
        Map<String, Object> point = new LinkedHashMap<>();
        point.put("date", snapshot.get("quoteDate"));
        point.put("price", snapshot.get("price"));
        point.put("minPrice", snapshot.get("minPrice"));
        point.put("maxPrice", snapshot.get("maxPrice"));
        point.put("marketCount", snapshot.get("marketCount"));
        point.put("priceBasis", snapshot.get("priceBasis"));
        return point;
    }

    private Set<String> activeFarmCropCodes(String farmId) {
        return store.list("plot").stream()
                .filter(plot -> farmId.equals(Jsons.text(plot, "farmId", "")))
                .filter(plot -> !"INACTIVE".equalsIgnoreCase(Jsons.text(plot, "status", "ACTIVE")))
                .map(plot -> Jsons.text(plot, "cropCode", "").toLowerCase(Locale.ROOT))
                .filter(CATALOG_BY_CODE::containsKey)
                .collect(Collectors.toCollection(LinkedHashSet::new));
    }

    private Set<String> activeCropCodesAcrossFarms() {
        return store.list("plot").stream()
                .filter(plot -> !"INACTIVE".equalsIgnoreCase(Jsons.text(plot, "status", "ACTIVE")))
                .map(plot -> Jsons.text(plot, "cropCode", "").toLowerCase(Locale.ROOT))
                .filter(CATALOG_BY_CODE::containsKey)
                .collect(Collectors.toCollection(LinkedHashSet::new));
    }

    private String sourceKey(String cropCode) { return properties.getMarketPriceProvinceCode() + "|" + cropCode; }
    private String snapshotId(String cropCode, LocalDate date) { return sourceKey(cropCode).replace('|', '-') + "-" + date; }
    private int normalizeRange(int rangeDays) { return rangeDays <= 7 ? 7 : rangeDays <= 30 ? 30 : 90; }
    private static Double finite(Object value) {
        double number = Jsons.numberValue(value, Double.NaN);
        return Double.isFinite(number) ? number : null;
    }
    private static double round(double value) { return Math.round(value * 100.0) / 100.0; }
    private static Optional<LocalDate> parseDate(Object value) {
        try { return value == null ? Optional.empty() : Optional.of(LocalDate.parse(String.valueOf(value))); }
        catch (Exception ignored) { return Optional.empty(); }
    }
}

record CropQuoteDefinition(String cropCode, String cropName, String marketVarietyName, String varietyId, String emoji) { }
record MarketQuote(String marketName, double price) { }
record MarketQuoteBatch(LocalDate sourceDate, List<MarketQuote> quotes, Instant fetchedAt) { }

interface MarketPriceProvider {
    Optional<MarketQuoteBatch> fetch(CropQuoteDefinition definition, String provinceCode) throws Exception;
}

@Component
class MoaPfscMarketPriceProvider implements MarketPriceProvider {
    private final ObjectMapper mapper;
    private final AgriProperties properties;
    private final HttpClient client;

    MoaPfscMarketPriceProvider(ObjectMapper mapper, AgriProperties properties) {
        this.mapper = mapper;
        this.properties = properties;
        this.client = HttpClient.newBuilder().followRedirects(HttpClient.Redirect.NORMAL).build();
    }

    @Override
    public Optional<MarketQuoteBatch> fetch(CropQuoteDefinition definition, String provinceCode) throws Exception {
        if (!properties.isMarketPriceEnabled()) return Optional.empty();
        String base = String.valueOf(properties.getMarketPriceBaseUrl()).replaceAll("/+$", "");
        String query = "marketIDs=&provinceCodes=" + encode(provinceCode) + "&varietyID=" + encode(definition.varietyId());
        URI uri = URI.create(base + "/price_portal/index/getMarketReportPriceChart?" + query);
        HttpRequest request = HttpRequest.newBuilder(uri)
                .timeout(Duration.ofMillis(Math.max(1000, properties.getMarketPriceTimeoutMs())))
                .header("Accept", "application/json")
                .header("User-Agent", "AgriLoop/5.9.3 market-price-reader")
                .POST(HttpRequest.BodyPublishers.noBody()).build();
        HttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
        if (response.statusCode() < 200 || response.statusCode() >= 300) return Optional.empty();
        JsonNode envelope = mapper.readTree(response.body());
        int code = envelope.path("code").asInt(-1);
        String encrypted = envelope.path("data").isTextual() ? envelope.path("data").asText() : "";
        if ((code != 0 && code != 200) || encrypted.isBlank()) return Optional.empty();
        String clear = decryptPayload(encrypted, properties.getMarketPriceAesKey());
        JsonNode payload = mapper.readTree(clear);
        JsonNode names = payload.path("x");
        JsonNode prices = payload.path("y");
        if (!names.isArray() || !prices.isArray()) return Optional.empty();
        List<MarketQuote> quotes = new ArrayList<>();
        for (int index = 0; index < Math.min(names.size(), prices.size()); index++) {
            String market = names.get(index).asText("").trim();
            double price = prices.get(index).asDouble(Double.NaN);
            if (!market.isBlank() && Double.isFinite(price) && price > 0) quotes.add(new MarketQuote(market, price));
        }
        if (quotes.isEmpty()) return Optional.empty();
        LocalDate sourceDate;
        try { sourceDate = LocalDate.parse(payload.path("date").asText()); }
        catch (Exception ignored) { sourceDate = LocalDate.now(MarketPriceService.BUSINESS_ZONE); }
        return Optional.of(new MarketQuoteBatch(sourceDate, List.copyOf(quotes), Instant.now()));
    }

    static String decryptPayload(String encrypted, String keyText) throws Exception {
        if (encrypted == null || encrypted.length() <= 16) throw new IllegalArgumentException("市场行情响应缺少加密载荷");
        byte[] key = String.valueOf(keyText == null ? "" : keyText).getBytes(StandardCharsets.UTF_8);
        if (key.length != 32) throw new IllegalArgumentException("市场行情协议密钥必须为32字节");
        byte[] iv = encrypted.substring(0, 16).getBytes(StandardCharsets.UTF_8);
        byte[] cipherText = Base64.getDecoder().decode(encrypted.substring(16));
        Cipher cipher = Cipher.getInstance("AES/CBC/PKCS5Padding");
        cipher.init(Cipher.DECRYPT_MODE, new SecretKeySpec(key, "AES"), new IvParameterSpec(iv));
        return new String(cipher.doFinal(cipherText), StandardCharsets.UTF_8);
    }

    private static String encode(String value) {
        return URLEncoder.encode(String.valueOf(value == null ? "" : value), StandardCharsets.UTF_8);
    }
}
