package com.agriloop;

import org.springframework.http.HttpStatus;
import java.util.Map;

class ApiException extends RuntimeException {
    final HttpStatus status; final String code; Map<String, Object> details = Map.of();
    ApiException(HttpStatus status, String code, String message) { super(message); this.status = status; this.code = code; }
    ApiException withDetails(Map<String, Object> details) { this.details = details == null ? Map.of() : details; return this; }
}
