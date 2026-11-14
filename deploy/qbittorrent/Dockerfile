FROM docker.io/library/alpine:3.21

RUN apk add --no-cache \
    qbittorrent-nox \
    bash \
    curl \
    tzdata \
    ca-certificates

RUN mkdir -p /config /downloads /defaults

COPY qBittorrent.conf /defaults/qBittorrent.conf
COPY entrypoint.sh /entrypoint.sh

RUN chmod +x /entrypoint.sh && \
    chmod -R 777 /config /downloads /defaults

ENV QBT_WEBUI_PORT=8085
ENV QBT_TORRENTING_PORT=6882
ENV SAVE_PATH=/downloads

EXPOSE 8085 6882 6882/udp

ENTRYPOINT ["/entrypoint.sh"]
