package com.agriloop;

import java.time.Instant;

final class TimestampParser {
    private TimestampParser() {}
    static java.sql.Timestamp sql(Instant value) { return java.sql.Timestamp.from(value == null ? Instant.now() : value); }
}
