package com.agriloop;

import org.junit.jupiter.api.Test;

import javax.crypto.Cipher;
import javax.crypto.spec.IvParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.LocalDate;
import java.util.Base64;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class MarketPriceServiceTest {
    private static final String PROTOCOL_KEY = "7s9K$pG2xQ8zR5mB7vA3sD9fH2jW40cV";

    @Test
    void decryptsThePublishedProviderEnvelope() throws Exception {
        String clear = "{\"date\":\"2026-09-01\",\"x\":[\"重庆双福国际农贸城\"],\"y\":[2.5]}";
        String ivText = "1234567890abcdef";
        Cipher cipher = Cipher.getInstance("AES/CBC/PKCS5Padding");
        cipher.init(Cipher.ENCRYPT_MODE,
                new SecretKeySpec(PROTOCOL_KEY.getBytes(StandardCharsets.UTF_8), "AES"),
                new IvParameterSpec(ivText.getBytes(StandardCharsets.UTF_8)));
        String encrypted = ivText + Base64.getEncoder().encodeToString(cipher.doFinal(clear.getBytes(StandardCharsets.UTF_8)));

        assertThat(MoaPfscMarketPriceProvider.decryptPayload(encrypted, PROTOCOL_KEY)).isEqualTo(clear);
    }

    @Test
    void farmScopeUsesOnlyActiveCropsAndRejectsOtherRolesOrFarms() throws Exception {
        AgriStore store = mock(AgriStore.class);
        when(store.list("plot")).thenReturn(List.of(
                Map.of("plotId", "plot-a", "farmId", "farm-demo", "cropCode", "tomato", "status", "ACTIVE"),
                Map.of("plotId", "plot-b", "farmId", "farm-other", "cropCode", "cucumber", "status", "ACTIVE")));
        when(store.list(MarketPriceService.SNAPSHOT_TYPE)).thenReturn(List.of(
                snapshot("tomato", "500000", LocalDate.now().minusDays(1), 3.2),
                snapshot("tomato", "510000", LocalDate.now(), 99.0)));
        when(store.persistenceKind()).thenReturn("H2_STANDALONE");
        MarketPriceProvider provider = mock(MarketPriceProvider.class);
        when(provider.fetch(org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.anyString())).thenReturn(Optional.empty());
        MarketPriceService service = new MarketPriceService(store, provider, properties());
        UserPrincipal admin = new UserPrincipal("admin", "admin", "FARM_ADMIN", List.of("farm-demo"), List.of("*"));

        Map<String, Object> result = service.overview("farm-demo", 30, false, admin);
        assertThat(crops(result)).extracting(item -> item.get("cropCode")).containsExactly("tomato");
        assertThat(crops(result).get(0)).containsEntry("latestPrice", 3.2).containsEntry("historyDays", 1);
        assertThat(crops(result).get(0)).containsKey("internationalReference");
        assertThat(result).containsEntry("internationalReferenceCropCount", 1L);
        verify(provider).fetch(MarketPriceService.CATALOG.get(0), "500000");
        verify(provider).fetch(MarketPriceService.CATALOG.get(0), "");

        UserPrincipal farmer = new UserPrincipal("farmer", "farmer", "FARMER", List.of("farm-demo"), List.of("plot-a"));
        UserPrincipal systemAdmin = new UserPrincipal("sys", "sys", "SYSTEM_ADMIN", List.of("*"), List.of("*"));
        assertThatThrownBy(() -> service.overview("farm-demo", 30, false, farmer))
                .isInstanceOfSatisfying(ApiException.class, error -> assertThat(error.code).isEqualTo("MARKET_PRICE_FORBIDDEN"));
        assertThatThrownBy(() -> service.overview("farm-demo", 30, false, systemAdmin))
                .isInstanceOfSatisfying(ApiException.class, error -> assertThat(error.code).isEqualTo("MARKET_PRICE_FORBIDDEN"));
        assertThatThrownBy(() -> service.overview("farm-other", 30, false, admin))
                .isInstanceOfSatisfying(ApiException.class, error -> assertThat(error.code).isEqualTo("FARM_FORBIDDEN"));
    }

    @Test
    void preferredMarketBecomesReferenceWithoutFabricatingOtherDates() throws Exception {
        AgriStore store = mock(AgriStore.class);
        when(store.list("plot")).thenReturn(List.of(
                Map.of("plotId", "plot-a", "farmId", "farm-demo", "cropCode", "tomato", "status", "ACTIVE")));
        when(store.list(MarketPriceService.SNAPSHOT_TYPE)).thenReturn(List.of());
        when(store.persistenceKind()).thenReturn("IN_MEMORY_FALLBACK");
        MarketPriceProvider provider = (definition, provinceCode) -> Optional.of(new MarketQuoteBatch(
                LocalDate.now(MarketPriceService.BUSINESS_ZONE),
                List.of(new MarketQuote("重庆双福国际农贸城", 4.6), new MarketQuote("另一市场", 5.4)),
                Instant.now()));
        MarketPriceService service = new MarketPriceService(store, provider, properties());
        UserPrincipal admin = new UserPrincipal("admin", "admin", "FARM_ADMIN", List.of("farm-demo"), List.of("*"));

        Map<String, Object> crop = crops(service.overview("farm-demo", 7, false, admin)).get(0);
        assertThat(crop).containsEntry("latestPrice", 4.6)
                .containsEntry("priceBasis", "PREFERRED_MARKET")
                .containsEntry("historyDays", 1)
                .containsEntry("status", "LIVE");
        assertThat((List<?>) crop.get("history")).hasSize(1);
    }

    @Test
    void fallsBackToObservedNationalQuotesWhenChongqingHasNoReport() throws Exception {
        AgriStore store = mock(AgriStore.class);
        when(store.list("plot")).thenReturn(List.of(
                Map.of("plotId", "plot-a", "farmId", "farm-demo", "cropCode", "corn", "status", "ACTIVE")));
        when(store.list(MarketPriceService.SNAPSHOT_TYPE)).thenReturn(List.of());
        when(store.persistenceKind()).thenReturn("H2_STANDALONE");
        MarketPriceProvider provider = (definition, provinceCode) -> provinceCode.isBlank()
                ? Optional.of(new MarketQuoteBatch(
                        LocalDate.now(MarketPriceService.BUSINESS_ZONE),
                        List.of(new MarketQuote("全国市场甲", 3.2), new MarketQuote("全国市场乙", 4.0)),
                        Instant.now()))
                : Optional.empty();
        MarketPriceService service = new MarketPriceService(store, provider, properties());
        UserPrincipal admin = new UserPrincipal("admin", "admin", "FARM_ADMIN", List.of("farm-demo"), List.of("*"));

        Map<String, Object> overview = service.overview("farm-demo", 30, false, admin);
        Map<String, Object> crop = crops(overview).get(0);

        assertThat(crop).containsEntry("latestPrice", 3.6)
                .containsEntry("priceBasis", "NATIONAL_SIMPLE_AVERAGE")
                .containsEntry("quoteScope", "NATIONAL")
                .containsEntry("quoteRegionName", "全国")
                .containsEntry("nationalFallback", true)
                .containsEntry("historyDays", 1)
                .containsEntry("status", "LIVE");
        assertThat(overview).containsEntry("nationalFallbackCropCount", 1L)
                .containsEntry("availableCropCount", 1L);
    }

    @Test
    void salesObservationRequiresEvidenceAndUsesDeterministicBands() {
        assertThat(MarketPriceService.salesObservation(5.0, 3.0, 4.5, 7))
                .containsEntry("tone", "STRONG").containsEntry("actionable", true);
        assertThat(MarketPriceService.salesObservation(4.0, -3.0, 4.5, 7))
                .containsEntry("tone", "WEAK").containsEntry("actionable", true);
        assertThat(MarketPriceService.salesObservation(5.0, 0.1, 5.0, 7))
                .containsEntry("tone", "RANGE").containsEntry("actionable", true);
        assertThat(MarketPriceService.salesObservation(5.0, 3.0, 4.5, 1))
                .containsEntry("tone", "NEUTRAL").containsEntry("actionable", false);
    }

    @Test
    void internationalReferenceKeepsOriginalUnitAndObservedPublicationGaps() {
        Map<String, Object> reference = MarketReferenceCatalog.load().forCrop("tomato");

        assertThat(reference).containsEntry("provider", "UK_DEFRA")
                .containsEntry("unit", "GBP/kg")
                .containsEntry("unitLabel", "英镑/公斤")
                .containsEntry("comparableToLocalPrice", false)
                .containsEntry("provenance", "OBSERVED_EXTERNAL_REFERENCE")
                .containsEntry("observationCount", 17);
        assertThat(referencePoints(reference)).extracting(point -> point.get("date"))
                .contains("2026-08-03", "2026-08-17")
                .doesNotContain("2026-08-10");
        assertThat(MarketReferenceCatalog.load().forCrop("rice")).isEmpty();
    }

    private static AgriProperties properties() {
        AgriProperties properties = new AgriProperties();
        properties.setMarketPriceProvinceCode("500000");
        properties.setMarketPriceProvinceName("重庆市");
        properties.setMarketPricePreferredMarket("重庆双福国际农贸城");
        properties.setMarketPriceAesKey(PROTOCOL_KEY);
        properties.setMarketPriceEnabled(true);
        return properties;
    }

    private static Map<String, Object> snapshot(String cropCode, String provinceCode, LocalDate date, double price) {
        return Map.ofEntries(
                Map.entry("cropCode", cropCode), Map.entry("provinceCode", provinceCode), Map.entry("quoteDate", date.toString()),
                Map.entry("price", price), Map.entry("minPrice", price), Map.entry("maxPrice", price),
                Map.entry("marketCount", 1), Map.entry("priceBasis", "PREFERRED_MARKET"), Map.entry("marketQuotes", List.of()));
    }

    @SuppressWarnings("unchecked")
    private static List<Map<String, Object>> crops(Map<String, Object> overview) {
        return (List<Map<String, Object>>) overview.get("crops");
    }

    @SuppressWarnings("unchecked")
    private static List<Map<String, Object>> referencePoints(Map<String, Object> reference) {
        return (List<Map<String, Object>>) reference.get("points");
    }
}
