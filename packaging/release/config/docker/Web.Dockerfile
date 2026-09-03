FROM nginx:1.27-alpine

COPY web/ /usr/share/nginx/html/
COPY config/docker/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
