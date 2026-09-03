FROM node:20-bookworm-slim AS build

WORKDIR /workspace/apps/web-ui
COPY apps/web-ui/package.json apps/web-ui/package-lock.json ./
RUN npm ci
COPY apps/web-ui/ ./
RUN npm run build

FROM nginx:1.27-alpine
COPY --from=build /workspace/apps/web-ui/dist/ /usr/share/nginx/html/
COPY infra/nginx-compose.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
