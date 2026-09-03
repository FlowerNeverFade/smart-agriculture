package com.agriloop;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.scheduling.annotation.EnableScheduling;

/**
 * AgriLoop backend.  The project intentionally keeps the first delivery as a
 * modular monolith: domain modules communicate through this application
 * boundary and durable records are stored behind AgriStore.
 */
@SpringBootApplication
@EnableScheduling
@EnableConfigurationProperties(AgriProperties.class)
public class AgriApplication {
    public static void main(String[] args) {
        SpringApplication.run(AgriApplication.class, args);
    }
}
