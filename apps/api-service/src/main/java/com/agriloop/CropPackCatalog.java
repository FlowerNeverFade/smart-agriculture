package com.agriloop;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.core.io.Resource;
import org.springframework.core.io.support.PathMatchingResourcePatternResolver;
import org.springframework.stereotype.Service;
import org.yaml.snakeyaml.Yaml;

import jakarta.annotation.PostConstruct;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Reads the versioned Crop Pack documents that are the planning and diagnosis
 * source of truth.  No fields are synthesized here: an absent backend field is
 * intentionally exposed as absent so the UI can render “—”.
 */
@Service
class CropPackCatalog {
    private final ObjectMapper mapper;
    private volatile List<Map<String, Object>> packs = List.of();

    CropPackCatalog(ObjectMapper mapper) {
        this.mapper = mapper;
    }

    @PostConstruct
    void load() {
        List<Map<String, Object>> loaded = new ArrayList<>();
        try {
            Resource[] resources = new PathMatchingResourcePatternResolver()
                    .getResources("classpath*:/crop-packs/*/pack.yaml");
            Yaml yaml = new Yaml();
            for (Resource resource : resources) {
                try (InputStream stream = resource.getInputStream()) {
                    Object value = yaml.load(stream);
                    if (!(value instanceof Map<?, ?> raw)) continue;
                    Map<String, Object> pack = mapper.convertValue(raw, Map.class);
                    pack.putIfAbsent("status", "ACTIVE");
                    loaded.add(pack);
                }
            }
        } catch (Exception error) {
            throw new IllegalStateException("Crop Pack 加载失败", error);
        }
        loaded.sort(Comparator.comparing(pack -> Jsons.text(pack, "cropCode", "")));
        packs = List.copyOf(loaded);
    }

    List<Map<String, Object>> all() {
        return packs.stream().map(pack -> Jsons.copy(mapper, pack)).toList();
    }

    Map<String, Object> require(String cropCode, String version) {
        return packs.stream()
                .filter(pack -> cropCode.equalsIgnoreCase(Jsons.text(pack, "cropCode", "")))
                .filter(pack -> version == null || version.isBlank() || version.equals(Jsons.text(pack, "version", "")))
                .findFirst()
                .map(pack -> Jsons.copy(mapper, pack))
                .orElseThrow(() -> new ApiException(org.springframework.http.HttpStatus.UNPROCESSABLE_ENTITY,
                        "CROP_PACK_NOT_FOUND", "没有找到该作物对应的 Crop Pack"));
    }
}
