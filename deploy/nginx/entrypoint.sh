#!/bin/sh
set -e

CERT_DIR="/etc/nginx/certs"
CERT_FILE="$CERT_DIR/gamecube.crt"
KEY_FILE="$CERT_DIR/gamecube.key"
CONF_FILE="$CERT_DIR/cert.conf"

mkdir -p "$CERT_DIR"

if [ ! -f "$CERT_FILE" ] || [ ! -f "$KEY_FILE" ]; then
    echo "=========================================================="
    echo "  [GameCube-Proxy] Generating self-signed SSL certificate"
    echo "  Subject Alternative Names (SAN): localhost, 127.0.0.1, LAN"
    echo "=========================================================="

    cat <<EOF > "$CONF_FILE"
[req]
default_bits = 2048
prompt = no
default_md = sha256
distinguished_name = dn
x509_extensions = v3_req

[dn]
C = RU
ST = DIY
L = Local
O = GameCube Manager
OU = DIY Steam Machine
CN = localhost

[v3_req]
subjectAltName = @alt_names
basicConstraints = CA:FALSE
keyUsage = nonRepudiation, digitalSignature, keyEncipherment

[alt_names]
DNS.1 = localhost
DNS.2 = steam-machine.local
DNS.3 = gamecube.local
DNS.4 = bazzite.local
IP.1 = 127.0.0.1
IP.2 = ::1
EOF

    openssl req -x509 -nodes -days 3650 \
        -newkey rsa:2048 \
        -keyout "$KEY_FILE" \
        -out "$CERT_FILE" \
        -config "$CONF_FILE"

    chmod 600 "$KEY_FILE"
    chmod 644 "$CERT_FILE"
    echo "  [GameCube-Proxy] SSL certificate successfully generated."
else
    echo "  [GameCube-Proxy] Found existing SSL certificate at $CERT_FILE"
fi

echo "  [GameCube-Proxy] Starting Nginx reverse proxy on ports 80 (HTTP) and 443 (HTTPS)..."
exec nginx -g "daemon off;"
