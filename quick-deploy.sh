#!/bin/bash

# Quick VPS setup - One-liner deployment
# Usage: curl -sSL https://raw.githubusercontent.com/yourusername/chatroom/main/quick-deploy.sh | bash -s your_domain.com your_email@example.com

DOMAIN=$1
EMAIL=$2
ADMIN_PASSWORD=${3:-$(openssl rand -base64 12)}

if [ -z "$DOMAIN" ]; then
    echo "Usage: bash quick-deploy.sh your_domain.com your_email@example.com [password]"
    exit 1
fi

# Get the script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Make deploy.sh executable
chmod +x "$SCRIPT_DIR/deploy.sh"

# Run the main deployment script
bash "$SCRIPT_DIR/deploy.sh" "$DOMAIN" "$EMAIL" "$ADMIN_PASSWORD"
