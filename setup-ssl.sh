#!/bin/bash

echo "=========================================="
echo "🔒 Setup HTTPS untuk rifandev.web.id"
echo "=========================================="
echo ""

DOMAIN="rifandev.web.id"
WWW_DOMAIN="www.rifandev.web.id"
APP_PORT="3001"

# Warna untuk output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 1. Cek apakah nginx config sudah ada
echo "1️⃣  Cek konfigurasi Nginx..."
NGINX_CONF="/www/server/panel/vhost/nginx/${DOMAIN}.conf"

if [ ! -f "$NGINX_CONF" ]; then
    echo -e "${YELLOW}⚠️  Config Nginx belum ada, membuat...${NC}"
    
    sudo mkdir -p /www/server/panel/vhost/nginx
    sudo mkdir -p /www/wwwlogs
    
    sudo tee "$NGINX_CONF" > /dev/null << EOF
server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN} ${WWW_DOMAIN};

    location / {
        proxy_pass http://127.0.0.1:${APP_PORT};
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    location ~ /.well-known/acme-challenge {
        allow all;
    }

    access_log /www/wwwlogs/${DOMAIN}.log;
    error_log /www/wwwlogs/${DOMAIN}.error.log;
}
EOF
    
    echo -e "${GREEN}✅ Config Nginx dibuat${NC}"
else
    echo -e "${GREEN}✅ Config Nginx sudah ada${NC}"
fi

# 2. Test nginx config
echo ""
echo "2️⃣  Test konfigurasi Nginx..."
if sudo /www/server/nginx/sbin/nginx -t 2>&1 | grep -q "successful"; then
    echo -e "${GREEN}✅ Nginx config valid${NC}"
else
    echo -e "${RED}❌ Nginx config error, cek manual!${NC}"
    sudo /www/server/nginx/sbin/nginx -t
    exit 1
fi

# 3. Reload nginx
echo ""
echo "3️⃣  Reload Nginx..."
sudo /www/server/nginx/sbin/nginx -s reload
echo -e "${GREEN}✅ Nginx reloaded${NC}"

# 4. Test domain bisa diakses
echo ""
echo "4️⃣  Test domain bisa diakses..."
if curl -s -o /dev/null -w "%{http_code}" http://localhost:${APP_PORT} | grep -q "200\|302\|301"; then
    echo -e "${GREEN}✅ App jalan di port ${APP_PORT}${NC}"
else
    echo -e "${RED}❌ App tidak jalan di port ${APP_PORT}!${NC}"
    echo "Cek dengan: pm2 list"
    exit 1
fi

# 5. Install certbot jika belum ada
echo ""
echo "5️⃣  Cek Certbot..."
if ! command -v certbot &> /dev/null; then
    echo -e "${YELLOW}⚠️  Certbot belum terinstall, menginstall...${NC}"
    sudo apt update
    sudo apt install -y certbot python3-certbot-nginx
    echo -e "${GREEN}✅ Certbot terinstall${NC}"
else
    echo -e "${GREEN}✅ Certbot sudah terinstall${NC}"
fi

# 6. Cek apakah SSL sudah ada
echo ""
echo "6️⃣  Cek SSL certificate..."
if sudo certbot certificates 2>&1 | grep -q "$DOMAIN"; then
    echo -e "${YELLOW}⚠️  SSL certificate sudah ada!${NC}"
    echo ""
    echo "Pilihan:"
    echo "1) Renew certificate (jika hampir expired)"
    echo "2) Revoke & buat baru"
    echo "3) Skip (pakai yang ada)"
    read -p "Pilih (1/2/3): " choice
    
    case $choice in
        1)
            echo "Renewing certificate..."
            sudo certbot renew
            ;;
        2)
            echo "Revoking certificate..."
            sudo certbot revoke --cert-name $DOMAIN
            sudo certbot delete --cert-name $DOMAIN
            ;;
        3)
            echo "Skip, pakai certificate yang ada"
            ;;
    esac
fi

# 7. Generate SSL certificate
if ! sudo certbot certificates 2>&1 | grep -q "$DOMAIN" || [ "$choice" = "2" ]; then
    echo ""
    echo "7️⃣  Generate SSL Certificate..."
    echo -e "${YELLOW}⚠️  Anda akan diminta email untuk notifikasi SSL${NC}"
    echo ""
    
    # Opsi 1: Interactive (user input email)
    sudo certbot --nginx -d $DOMAIN -d $WWW_DOMAIN
    
    # Opsi 2: Non-interactive (uncomment jika mau auto, ganti EMAIL)
    # EMAIL="your-email@example.com"
    # sudo certbot --nginx -d $DOMAIN -d $WWW_DOMAIN --non-interactive --agree-tos --email $EMAIL --redirect
fi

# 8. Verifikasi SSL
echo ""
echo "8️⃣  Verifikasi SSL..."
if sudo certbot certificates 2>&1 | grep -q "$DOMAIN"; then
    echo -e "${GREEN}✅ SSL Certificate berhasil dibuat!${NC}"
    echo ""
    sudo certbot certificates | grep -A 10 "$DOMAIN"
else
    echo -e "${RED}❌ SSL Certificate gagal dibuat${NC}"
    exit 1
fi

# 9. Setup auto-renewal
echo ""
echo "9️⃣  Setup auto-renewal..."
if sudo systemctl list-timers | grep -q certbot; then
    echo -e "${GREEN}✅ Auto-renewal sudah aktif${NC}"
else
    echo -e "${YELLOW}⚠️  Mengaktifkan auto-renewal...${NC}"
    sudo systemctl enable certbot.timer
    sudo systemctl start certbot.timer
    echo -e "${GREEN}✅ Auto-renewal aktif${NC}"
fi

# 10. Test auto-renewal
echo ""
echo "🔟  Test auto-renewal..."
sudo certbot renew --dry-run

# Done
echo ""
echo "=========================================="
echo -e "${GREEN}🎉 HTTPS Setup Complete!${NC}"
echo "=========================================="
echo ""
echo "✅ Domain: https://${DOMAIN}"
echo "✅ WWW: https://${WWW_DOMAIN}"
echo ""
echo "📝 Test di browser:"
echo "   https://${DOMAIN}"
echo ""
echo "🔒 SSL Certificate Info:"
sudo certbot certificates | grep -A 5 "$DOMAIN" || true
echo ""
echo "📋 Next steps:"
echo "   1. Buka https://${DOMAIN} di browser"
echo "   2. Cek apakah ada gembok 🔒 hijau"
echo "   3. Test HTTP redirect: http://${DOMAIN} → https://${DOMAIN}"
echo ""
echo "🔄 Auto-renewal: Aktif (setiap 12 jam dicek)"
echo ""
