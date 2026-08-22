FROM gradle:8.10.2-jdk17 AS build
WORKDIR /workspace
COPY gradle.properties settings.gradle build.gradle gradlew ./
COPY apps/api-service/build.gradle apps/api-service/build.gradle
COPY apps/api-service/src apps/api-service/src
RUN chmod +x gradlew && ./gradlew :apps:api-service:bootJar --no-daemon

FROM eclipse-temurin:17-jre
WORKDIR /app
COPY --from=build /workspace/apps/api-service/build/libs/api-service-*.jar /app/app.jar
EXPOSE 8080
ENTRYPOINT ["java", "-XX:+UseG1GC", "-jar", "/app/app.jar"]
