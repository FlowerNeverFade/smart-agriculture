package com.agriloop;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.springframework.stereotype.Service;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Collection;
import java.util.Date;
import java.util.List;

@Service
class JwtService {
    private final AgriProperties properties;
    private final SecretKey key;

    JwtService(AgriProperties properties) {
        this.properties = properties;
        String secret = properties.getJwtSecret();
        if (secret.length() < 32) secret = (secret + "change-me-change-me-change-me-change-me");
        this.key = Keys.hmacShaKeyFor(secret.getBytes(StandardCharsets.UTF_8));
    }

    String issue(UserPrincipal principal) {
        Instant now = Instant.now();
        return Jwts.builder().subject(principal.userId).claim("username", principal.username).claim("role", principal.role)
                .claim("farmIds", principal.farmIds).claim("plotIds", principal.plotIds)
                .claim("credentialVersion", principal.credentialVersion)
                .issuedAt(Date.from(now)).expiration(Date.from(now.plus(properties.getJwtTtlMinutes(), ChronoUnit.MINUTES)))
                .signWith(key).compact();
    }

    UserPrincipal parse(String token) {
        Claims claims = Jwts.parser().verifyWith(key).build().parseSignedClaims(token).getPayload();
        Object rawVersion = claims.get("credentialVersion");
        int credentialVersion = rawVersion instanceof Number n ? n.intValue() : 1;
        return new UserPrincipal(claims.getSubject(), String.valueOf(claims.get("username", String.class)),
                String.valueOf(claims.get("role", String.class)), claimList(claims.get("farmIds")), claimList(claims.get("plotIds")), credentialVersion);
    }

    private Collection<String> claimList(Object value) {
        if (value instanceof Collection<?> c) return c.stream().map(String::valueOf).toList();
        return Jsons.strings(value);
    }
}
