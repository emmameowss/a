#!/bin/bash

# Chatroom VPS Deployment Script with SSL
# Usage: bash deploy.sh your_domain.com your_email@example.com [admin_password]

set -e

DOMAIN=$1
EMAIL=$2
ADMIN_PASSWORD=${3:-admin123}
APP_PORT=3000
APP_DIR="/home/chatroom"
APP_USER="chatroom"

if [ -z "$DOMAIN" ]; then
    echo "Usage: bash deploy.sh your_domain.com your_email@example.com [admin_password]"
    echo "Example: bash deploy.sh chat.example.com admin@example.com mySecurePassword123"
    exit 1
fi

echo "=========================================="
echo "Chatroom VPS Deployment Script"
echo "=========================================="
echo "Domain: $DOMAIN"
echo "Email: $EMAIL"
echo "Admin Password: $ADMIN_PASSWORD"
echo "App Directory: $APP_DIR"
echo ""
echo "Starting deployment..."
echo ""

# Update system
echo "[1/10] Updating system packages..."
sudo apt-get update
sudo apt-get upgrade -y

# Install Node.js and npm
echo "[2/10] Installing Node.js and npm..."
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install npm globally
echo "[3/10] Installing npm utilities..."
sudo npm install -g pm2

# Install Nginx
echo "[4/10] Installing Nginx..."
sudo apt-get install -y nginx

# Install Certbot for SSL
echo "[5/10] Installing Certbot for SSL..."
sudo apt-get install -y certbot python3-certbot-nginx

# Create app user if it doesn't exist
echo "[6/10] Setting up app user..."
if ! id "$APP_USER" &>/dev/null; then
    sudo useradd -m -s /bin/bash $APP_USER
fi

# Create app directory
echo "[7/10] Setting up app directory..."
sudo mkdir -p $APP_DIR
sudo chown -R $APP_USER:$APP_USER $APP_DIR

# Copy app files
echo "[8/10] Copying application files..."
if [ -f "package.json" ]; then
    sudo cp -r . $APP_DIR/
    sudo chown -R $APP_USER:$APP_USER $APP_DIR
else
    echo "Error: package.json not found in current directory"
    exit 1
fi

# Install dependencies
echo "[9/10] Installing app dependencies..."
cd $APP_DIR
sudo -u $APP_USER npm install

# Create .env file
echo "[10/10] Configuring application..."
sudo tee $APP_DIR/.env > /dev/null <<EOF
NODE_ENV=production
PORT=$APP_PORT
ADMIN_PASSWORD=$ADMIN_PASSWORD
EOF
sudo chown $APP_USER:$APP_USER $APP_DIR/.env

# Configure Nginx
echo ""
echo "Configuring Nginx..."
sudo tee /etc/nginx/sites-available/$DOMAIN > /dev/null <<'EOF'
server {
    listen 80;
    server_name DOMAIN_PLACEHOLDER;
    
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
EOF

# Replace placeholder with actual domain
sudo sed -i "s/DOMAIN_PLACEHOLDER/$DOMAIN/g" /etc/nginx/sites-available/$DOMAIN

# Enable site
sudo ln -sf /etc/nginx/sites-available/$DOMAIN /etc/nginx/sites-enabled/$DOMAIN

# Test Nginx config
sudo nginx -t

# Reload Nginx
sudo systemctl reload nginx

# Setup SSL with Certbot
echo ""
echo "Setting up SSL certificate..."
sudo certbot --nginx -d $DOMAIN --non-interactive --agree-tos -m $EMAIL --redirect

# Setup PM2 to start app on boot
echo ""
echo "Setting up PM2 process manager..."
cd $APP_DIR
sudo -u $APP_USER pm2 start server.js --name "chatroom" --env NODE_ENV=production --update-env
sudo -u $APP_USER pm2 save
sudo env PATH=$PATH:/usr/bin /usr/lib/node_modules/pm2/bin/pm2 startup systemd -u $APP_USER --hp /home/$APP_USER

# Setup SSL renewal cron job
echo ""
echo "Setting up automatic SSL renewal..."
sudo tee /etc/cron.d/certbot > /dev/null <<'EOF'
0 12 * * * /opt/certbot/bin/python -c 'import random; import time; time.sleep(random.random() * 3600)' && certbot renew -q
EOF

# Configure firewall (if UFW is available)
if command -v ufw &> /dev/null; then
    echo ""
    echo "Configuring firewall..."
    sudo ufw allow 22/tcp
    sudo ufw allow 80/tcp
    sudo ufw allow 443/tcp
    sudo ufw --force enable
fi

echo ""
echo "=========================================="
echo "Deployment Complete!"
echo "=========================================="
echo ""
echo "Your chatroom is now live at:"
echo "  🌐 https://$DOMAIN"
echo ""
echo "Admin Panel:"
echo "  🔐 https://$DOMAIN/admin.html"
echo "  Password: $ADMIN_PASSWORD"
echo ""
echo "Useful Commands:"
echo "  View logs:     sudo journalctl -u chatroom -f"
echo "  Restart app:   sudo systemctl restart chatroom"
echo "  Stop app:      sudo systemctl stop chatroom"
echo "  SSL status:    sudo certbot certificates"
echo ""
echo "Application data is stored in: $APP_DIR/data/"
echo "=========================================="
