package com.agriloop;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import java.util.Map;

@RestControllerAdvice
class ApiErrorHandler {
    @ExceptionHandler(ApiException.class)
    ResponseEntity<Map<String, Object>> api(ApiException e) { return ResponseEntity.status(e.status).body(ApiResponses.error(e.code, e.getMessage(), e.details)); }
    @ExceptionHandler(Exception.class)
    ResponseEntity<Map<String, Object>> other(Exception e) {
        boolean badRequest = e instanceof IllegalArgumentException
                || e instanceof org.springframework.http.converter.HttpMessageNotReadableException
                || e instanceof org.springframework.web.bind.MissingServletRequestParameterException;
        HttpStatus status = badRequest ? HttpStatus.BAD_REQUEST : HttpStatus.INTERNAL_SERVER_ERROR;
        String code = badRequest ? "PARAM_INVALID" : "INTERNAL_ERROR";
        return ResponseEntity.status(status).body(ApiResponses.error(code, e.getMessage() == null ? (badRequest ? "请求参数无效" : "服务器内部错误") : e.getMessage(), Map.of()));
    }
}
