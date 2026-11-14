FROM docker.io/library/nginx:alpine

# Install openssl for automatic certificate generation and bash for utilities
RUN apk add --no-cache openssl bash curl

# Copy custom Nginx configuration
COPY nginx.conf /etc/nginx/nginx.conf
COPY entrypoint.sh /entrypoint.sh

RUN chmod +x /entrypoint.sh

EXPOSE 80 443

ENTRYPOINT ["/entrypoint.sh"]
