#!/bin/bash

# Discord Bot Manager - Production Deployment Script
# Run with: chmod +x deploy.sh && ./deploy.sh

set -e

echo "=========================================="
echo "  Discord Bot Manager - Production Deploy"
echo "=========================================="
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if running as root
if [ "$EUID" -eq 0 ]; then
    echo -e "${YELLOW}Warning: Running as root. Consider using a non-root user.${NC}"
fi

# Check Node.js
echo "Checking Node.js..."
if ! command -v node &> /dev/null; then
    echo -e "${RED}Node.js is not installed. Please install Node.js 18+${NC}"
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo -e "${RED}Node.js 18+ required. Current: $(node -v)${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Node.js $(node -v)${NC}"

# Check Docker
echo "Checking Docker..."
if ! command -v docker &> /dev/null; then
    echo -e "${RED}Docker is not installed.${NC}"
    exit 1
fi

if ! docker info &> /dev/null; then
    echo -e "${RED}Docker daemon is not running.${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Docker $(docker --version)${NC}"

# Check .env file
if [ ! -f .env ]; then
    echo -e "${YELLOW}No .env file found.${NC}"
    echo "Creating from .env.production.example..."
    if [ -f .env.production.example ]; then
        cp .env.production.example .env
        echo -e "${YELLOW}Please edit .env with your production values before continuing.${NC}"
        exit 1
    else
        echo -e "${RED}.env.production.example not found. Please create .env manually.${NC}"
        exit 1
    fi
fi

# Validate critical environment variables
source .env
if [ -z "$DATABASE_URL" ]; then
    echo -e "${RED}DATABASE_URL is not set in .env${NC}"
    exit 1
fi
if [ -z "$JWT_SECRET" ] || [ ${#JWT_SECRET} -lt 32 ]; then
    echo -e "${RED}JWT_SECRET must be at least 32 characters${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Environment configuration${NC}"

# Install dependencies
echo ""
echo "Installing dependencies..."
npm ci --production=false
echo -e "${GREEN}✓ Dependencies installed${NC}"

# Generate Prisma client
echo ""
echo "Generating Prisma client..."
npx prisma generate
echo -e "${GREEN}✓ Prisma client generated${NC}"

# Run database migrations
echo ""
echo "Running database migrations..."
npx prisma migrate deploy
echo -e "${GREEN}✓ Database migrations applied${NC}"

# Build TypeScript
echo ""
echo "Building application..."
npm run build
echo -e "${GREEN}✓ Application built${NC}"

# Create required directories
echo ""
echo "Setting up directories..."
mkdir -p bots logs
chmod 755 bots logs

# Create systemd service file (optional)
if [ -d /etc/systemd/system ]; then
    echo ""
    read -p "Create systemd service file? (y/N): " create_service
    if [ "$create_service" = "y" ] || [ "$create_service" = "Y" ]; then
        SERVICE_FILE="/etc/systemd/system/botmanager.service"
        sudo tee $SERVICE_FILE > /dev/null <<EOF
[Unit]
Description=Discord Bot Manager Backend
After=network.target docker.service
Requires=docker.service

[Service]
Type=simple
User=$(whoami)
WorkingDirectory=$(pwd)
ExecStart=$(which node) dist/index.js
Restart=on-failure
RestartSec=10
StandardOutput=syslog
StandardError=syslog
SyslogIdentifier=botmanager
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF
        sudo systemctl daemon-reload
        echo -e "${GREEN}✓ Systemd service created${NC}"
        echo "  Start with: sudo systemctl start botmanager"
        echo "  Enable on boot: sudo systemctl enable botmanager"
    fi
fi

echo ""
echo "=========================================="
echo -e "${GREEN}  Deployment Complete!${NC}"
echo "=========================================="
echo ""
echo "Next steps:"
echo "  1. Start the server: npm start"
echo "  2. Or with systemd: sudo systemctl start botmanager"
echo "  3. Configure your reverse proxy (nginx/caddy)"
echo "  4. Set up SSL certificates"
echo ""
echo "Server will run on port ${PORT:-3001}"
echo ""
