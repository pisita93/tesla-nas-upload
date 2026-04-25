FROM nginx:alpine

# Replace default nginx config with our reverse-proxy config
COPY default.conf /etc/nginx/conf.d/default.conf

# Copy frontend HTML
COPY index.html /usr/share/nginx/html/index.html

EXPOSE 80
