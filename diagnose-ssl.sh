#!/bin/bash

echo "=========================================="
echo "🔍 Diagnose SSL Issue"
echo "=========================================="
echo ""

DOMAIN="rifandev.web.id"
SERVER_IP="43.128.71.185"

# Warna
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# 1. Cek DNS
echo "1️⃣  Cek DNS Pointing..."
DNS_IP=$(dig +short $DOMAIN @8.8.8.8 | tail -n1)
echo "Domain: $DOMAIN"
echo "Pointing ke: $DNS_IP"
echo "Server IP: $SERVER_IP"

if [ "$DNS_IP" = "$SERVER_IP" ]; then
    echo -e "${GREEN}✅ DNS sudah benar${NC}"
else
    echo -e "${RED}❌ DNS salah! Domain tidak pointing ke server${NC}"
    echo -e "${YELLOW}Fix: Update DNS A Record ke $SERVER_IP${NC}"
fi

# 2. Cek port 80 dari dalam
echo ""
echo "2️⃣  Cek port 80 (internal)..."
if sudo lsof -i :80 | grep -q LISTEN; then
    echo -e "${GREEN}✅ Port 80 ada service yang listen${NC}"
    sudo lsof -i :80 | grep LISTEN
else
    echo -e "${RED}❌ Port 80 tidak ada service yang listen${NC}"
fi

# 3. Cek port 80 dari luar
echo ""
echo "3️⃣  Cek port 80 (external)..."
if curl -s -o /dev/null -w "%{http_code}" http://$DOMAIN --max-time 5 | grep -q "200\|301\|302"; then
    echo -e "${GREEN}✅ Port 80 bisa diakses dari luar${NC}"
else
    echo -e "${RED}❌ Port 80 tidak bisa diakses dari luar${NC}"
    echo -e "${YELLOW}Kemungkinan: Firewall/Security Group blok port 80${NC}"
fi

# 4. Cek firewall
echo ""
echo "4️⃣  Cek Firewall (UFW)..."
if sudo ufw status | grep -q "Status: active"; then
    echo "UFW Status: ACTIVE"
    sudo ufw status numbered | grep -E "(80|443)"
    
    if ! sudo ufw status | grep -q "80.*ALLOW"; then
        echo -e "${YELLOW}⚠️  Port 80 mungkin diblok UFW${NC}"
        echo -e "${YELLOW}Fix: sudo ufw allow 80/tcp${NC}"
    fi
else
    echo "UFW: Inactive"
fi

# 5. Cek iptables
echo ""
echo "5️⃣  Cek iptables..."
if sudo iptables -L -n | grep -q "DROP.*80\|REJECT.*80"; then
    echo -e "${RED}❌ Port 80 diblok oleh iptables${NC}"
    sudo iptables -L -n | grep -E "(80|443)"
else
    echo -e "${GREEN}✅ iptables OK${NC}"
fi

# 6. Cek nginx config
echo ""
echo "6️⃣  Cek Nginx Config..."
NGINX_CONF="/www/server/panel/vhost/nginx/${DOMAIN}.conf"
if [ -f "$NGINX_CONF" ]; then
    echo -e "${GREEN}✅ Config file ada: $NGINX_CONF${NC}"
    
    if grep -q "listen 80" "$NGINX_CONF"; then
        echo -e "${GREEN}✅ Listen port 80: OK${NC}"
    else
        echo -e "${RED}❌ Tidak ada 'listen 80' di config${NC}"
    fi
    
    if grep -q "server_name.*$DOMAIN" "$NGINX_CONF"; then
        echo -e "${GREEN}✅ Server name: OK${NC}"
    else
        echo -e "${RED}❌ Server name tidak ada di config${NC}"
    fi
else
    echo -e "${RED}❌ Config file tidak ada!${NC}"
fi

# 7. Test nginx config
echo ""
echo "7️⃣  Test Nginx Syntax..."
if sudo /www/server/nginx/sbin/nginx -t 2>&1 | grep -q "successful"; then
    echo -e "${GREEN}✅ Nginx syntax OK${NC}"
else
    echo -e "${RED}❌ Nginx syntax error${NC}"
    sudo /www/server/nginx/sbin/nginx -t
fi

# 8. Cek .well-known accessible
echo ""
echo "8️⃣  Cek .well-known path (Let's Encrypt verification)..."
TEST_FILE="/tmp/test-acme.txt"
WEBROOT="/www/wwwroot/spp-sekolah/.well-known/acme-challenge"

# Buat test file
sudo mkdir -p "$WEBROOT"
echo "test" | sudo tee "${WEBROOT}/test.txt" > /dev/null

# Test akses
if curl -s "http://${DOMAIN}/.well-known/acme-challenge/test.txt" | grep -q "test"; then
    echo -e "${GREEN}✅ .well-known bisa diakses${NC}"
else
    echo -e "${RED}❌ .well-known tidak bisa diakses${NC}"
    echo -e "${YELLOW}Ini masalah utama kenapa SSL gagal!${NC}"
fi

# Cleanup
sudo rm -f "${WEBROOT}/test.txt"

# 9. Cek existing certificates
echo ""
echo "9️⃣  Cek existing SSL certificates..."
if command -v certbot &> /dev/null; then
    if sudo certbot certificates 2>&1 | grep -q "$DOMAIN"; then
        echo -e "${YELLOW}⚠️  Certificate sudah ada:${NC}"
        sudo certbot certificates | grep -A 10 "$DOMAIN"
    else
        echo "Tidak ada certificate untuk $DOMAIN"
    fi
else
    echo "Certbot belum terinstall"
fi

# 10. Test langsung ke app
echo ""
echo "🔟  Test app di port 3001..."
if curl -s -o /dev/null -w "%{http_code}" http://localhost:3001 | grep -q "200\|301\|302"; then
    echo -e "${GREEN}✅ App jalan di port 3001${NC}"
else
    echo -e "${RED}❌ App tidak jalan di port 3001${NC}"
fi

# Summary
echo ""
echo "=========================================="
echo "📋 RINGKASAN"
echo "=========================================="
echo ""
echo "Checklist:"
echo ""
echo -n "DNS Pointing: "
if [ "$DNS_IP" = "$SERVER_IP" ]; then echo -e "${GREEN}✅${NC}"; else echo -e "${RED}❌${NC}"; fi

echo -n "Port 80 Open: "
if curl -s -o /dev/null -w "%{http_code}" http://$DOMAIN --max-time 5 | grep -q "200\|301\|302"; then echo -e "${GREEN}✅${NC}"; else echo -e "${RED}❌${NC}"; fi

echo -n "Nginx Config: "
if sudo /www/server/nginx/sbin/nginx -t 2>&1 | grep -q "successful"; then echo -e "${GREEN}✅${NC}"; else echo -e "${RED}❌${NC}"; fi

echo -n "App Running: "
if curl -s -o /dev/null -w "%{http_code}" http://localhost:3001 | grep -q "200\|301\|302"; then echo -e "${GREEN}✅${NC}"; else echo -e "${RED}❌${NC}"; fi

echo ""
echo "=========================================="
echo ""
echo "💡 Kemungkinan solusi:"
echo ""
echo "1. Kalau DNS salah:"
echo "   - Update DNS A Record di domain provider"
echo "   - Tunggu 5-10 menit untuk propagasi"
echo ""
echo "2. Kalau port 80 diblok:"
echo "   - sudo ufw allow 80/tcp"
echo "   - sudo ufw allow 443/tcp"
echo "   - Cek Security Group di Cloud Provider"
echo ""
echo "3. Kalau .well-known tidak bisa diakses:"
echo "   - Nginx config perlu diperbaiki"
echo "   - Jalankan: ./fix-nginx-ssl.sh"
echo ""
