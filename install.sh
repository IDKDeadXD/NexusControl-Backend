#!/bin/bash

# NexusControl Backend - Quick Install Script
#
# USAGE:
#   bash <(curl -fsSL https://raw.githubusercontent.com/IDKDeadXD/NexusControl-Backend/main/install.sh)
#
# Or with custom options:
#   INSTALL_DIR=/opt/nexuscontrol bash <(curl -fsSL https://raw.githubusercontent.com/IDKDeadXD/NexusControl-Backend/main/install.sh)
#
# Environment Variables:
#   REPO_URL    - Git repository URL (default: your repo)
#   INSTALL_DIR - Installation directory (default: ~/nexuscontrol-backend)
#   BRANCH      - Git branch to use (default: main)

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# ============================================
# CONFIGURATION
# ============================================
DEFAULT_REPO_URL="https://github.com/IDKDeadXD/NexusControl-Backend.git"
DB_NAME="nexuscontrol"
DB_USER="nexuscontrol"
DB_PASS=$(openssl rand -base64 32 | tr -dc 'a-zA-Z0-9' | head -c 24)
# ============================================

REPO_URL="${REPO_URL:-$DEFAULT_REPO_URL}"
INSTALL_DIR="${INSTALL_DIR:-$HOME/nexuscontrol-backend}"
BRANCH="${BRANCH:-main}"

# Function to read input (works even when piped)
read_input() {
    read "$@" </dev/tty
}

# Check if running as root or with sudo
check_sudo() {
    if [ "$EUID" -eq 0 ]; then
        return 0
    elif command -v sudo >/dev/null 2>&1; then
        return 0
    else
        return 1
    fi
}

# Run command with sudo if needed
run_sudo() {
    if [ "$EUID" -eq 0 ]; then
        "$@"
    else
        sudo "$@"
    fi
}

clear
echo -e "${CYAN}"
cat << "EOF"
  _   _                       ____            _             _
 | \ | | _____  ___   _ ___  / ___|___  _ __ | |_ _ __ ___ | |
 |  \| |/ _ \ \/ / | | / __|| |   / _ \| '_ \| __| '__/ _ \| |
 | |\  |  __/>  <| |_| \__ \| |__| (_) | | | | |_| | | (_) | |
 |_| \_|\___/_/\_\\__,_|___/ \____\___/|_| |_|\__|_|  \___/|_|

EOF
echo -e "${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}              One-Line Installation Script                 ${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo ""

# Helpers
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

print_step() {
    echo -e "\n${BLUE}[$1/7]${NC} $2"
}

print_ok() {
    echo -e "  ${GREEN}✓${NC} $1"
}

print_err() {
    echo -e "  ${RED}✗${NC} $1"
}

print_warn() {
    echo -e "  ${YELLOW}!${NC} $1"
}

# ==========================================
# STEP 1: Check Prerequisites & Install Missing
# ==========================================
print_step 1 "Checking and installing prerequisites..."

# Update package list
echo -e "  Updating package list..."
run_sudo apt-get update -qq

# Git
if command_exists git; then
    print_ok "Git installed"
else
    echo -e "  Installing Git..."
    run_sudo apt-get install -y git -qq
    print_ok "Git installed"
fi

# Node.js
if command_exists node; then
    NODE_VER=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
    if [ "$NODE_VER" -ge 18 ]; then
        print_ok "Node.js $(node -v) installed"
    else
        echo -e "  Upgrading Node.js..."
        curl -fsSL https://deb.nodesource.com/setup_20.x | run_sudo bash -
        run_sudo apt-get install -y nodejs -qq
        print_ok "Node.js $(node -v) installed"
    fi
else
    echo -e "  Installing Node.js 20..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | run_sudo bash -
    run_sudo apt-get install -y nodejs -qq
    print_ok "Node.js $(node -v) installed"
fi

# npm
if command_exists npm; then
    print_ok "npm $(npm -v) installed"
else
    print_err "npm not found (should come with Node.js)"
    exit 1
fi

# ==========================================
# STEP 2: Install & Configure PostgreSQL
# ==========================================
print_step 2 "Setting up PostgreSQL..."

if command_exists psql; then
    print_ok "PostgreSQL already installed"
else
    echo -e "  Installing PostgreSQL..."
    run_sudo apt-get install -y postgresql postgresql-contrib -qq
    print_ok "PostgreSQL installed"
fi

# Start PostgreSQL
echo -e "  Starting PostgreSQL service..."
run_sudo systemctl start postgresql
run_sudo systemctl enable postgresql
print_ok "PostgreSQL running"

# Create database and user
echo -e "  Configuring database..."
run_sudo -u postgres psql -c "DROP DATABASE IF EXISTS $DB_NAME;" 2>/dev/null || true
run_sudo -u postgres psql -c "DROP USER IF EXISTS $DB_USER;" 2>/dev/null || true
run_sudo -u postgres psql -c "CREATE USER $DB_USER WITH PASSWORD '$DB_PASS';"
run_sudo -u postgres psql -c "CREATE DATABASE $DB_NAME OWNER $DB_USER;"
run_sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER;"
print_ok "Database '$DB_NAME' created with user '$DB_USER'"

# ==========================================
# STEP 3: Install & Configure Docker
# ==========================================
print_step 3 "Setting up Docker..."

if command_exists docker; then
    print_ok "Docker already installed"
else
    echo -e "  Installing Docker..."
    curl -fsSL https://get.docker.com | run_sudo sh
    print_ok "Docker installed"
fi

# Start Docker
echo -e "  Starting Docker service..."
run_sudo systemctl start docker
run_sudo systemctl enable docker

# Add current user to docker group
if [ "$EUID" -ne 0 ]; then
    run_sudo usermod -aG docker "$USER"
    print_warn "Added $USER to docker group (may need to re-login)"
fi

print_ok "Docker running"

# ==========================================
# STEP 4: Clone Repository
# ==========================================
print_step 4 "Setting up installation directory..."

if [ -d "$INSTALL_DIR" ]; then
    print_warn "Directory exists: $INSTALL_DIR"
    echo -ne "    Remove and reinstall? (Y/n): "
    read_input remove
    if [[ ! "$remove" =~ ^[Nn]$ ]]; then
        rm -rf "$INSTALL_DIR"
        print_ok "Removed old installation"
    else
        echo -e "    Updating existing installation..."
        cd "$INSTALL_DIR"
        git fetch origin
        git reset --hard "origin/$BRANCH"
        print_ok "Updated to latest version"
    fi
fi

if [ ! -d "$INSTALL_DIR" ]; then
    echo -e "  Cloning from ${CYAN}$REPO_URL${NC}..."
    git clone -b "$BRANCH" --depth 1 "$REPO_URL" "$INSTALL_DIR"
    print_ok "Cloned to $INSTALL_DIR"
fi

cd "$INSTALL_DIR"

# ==========================================
# STEP 5: Install Dependencies & Configure
# ==========================================
print_step 5 "Installing dependencies and configuring..."

echo -e "  Installing Node.js dependencies..."
npm install 2>/dev/null || npm install
print_ok "Dependencies installed"

# Get admin credentials
echo ""
echo -e "  ${CYAN}── Admin Account Setup ──${NC}"
echo -ne "  Admin username [admin]: "
read_input ADMIN_USER
ADMIN_USER=${ADMIN_USER:-admin}

while true; do
    echo -ne "  Admin password (min 8 chars): "
    read_input -s ADMIN_PASS
    echo ""
    if [ ${#ADMIN_PASS} -ge 8 ]; then
        break
    fi
    echo -e "  ${RED}Password must be at least 8 characters${NC}"
done

echo -ne "  Confirm password: "
read_input -s ADMIN_PASS_CONFIRM
echo ""

if [ "$ADMIN_PASS" != "$ADMIN_PASS_CONFIRM" ]; then
    print_err "Passwords do not match"
    exit 1
fi

# Get frontend URL
echo ""
echo -e "  ${CYAN}── Server Configuration ──${NC}"
echo -ne "  Frontend URL [http://localhost:3000]: "
read_input FRONTEND_URL
FRONTEND_URL=${FRONTEND_URL:-http://localhost:3000}

echo -ne "  Backend port [3001]: "
read_input BACKEND_PORT
BACKEND_PORT=${BACKEND_PORT:-3001}

# Generate JWT secrets
JWT_SECRET=$(openssl rand -hex 64)
JWT_REFRESH_SECRET=$(openssl rand -hex 64)

# Create .env file
cat > .env << EOF
# NexusControl - Environment Configuration
# Generated by install script

# Environment
NODE_ENV=production

# Server
PORT=$BACKEND_PORT
FRONTEND_URL=$FRONTEND_URL

# Database
DATABASE_URL="postgresql://$DB_USER:$DB_PASS@localhost:5432/$DB_NAME"

# JWT Authentication
JWT_SECRET=$JWT_SECRET
JWT_REFRESH_SECRET=$JWT_REFRESH_SECRET
JWT_EXPIRY=15m
JWT_REFRESH_EXPIRY=7d

# Docker
DOCKER_SOCKET=/var/run/docker.sock

# Bots Storage
BOTS_DIRECTORY=./bots
EOF

print_ok "Environment configured"

# Create bots directory
mkdir -p bots
print_ok "Bots directory created"

# Generate Prisma client
echo -e "  Generating Prisma client..."
npx prisma generate
print_ok "Prisma client generated"

# Run migrations
echo -e "  Running database migrations..."
npx prisma migrate deploy || npx prisma db push
print_ok "Database migrated"

# Create admin user
echo -e "  Creating admin account..."
ESCAPED_PASS=$(echo "$ADMIN_PASS" | sed "s/'/\\\\'/g")
cat > .create-admin-temp.mjs << EOF
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function createAdmin() {
  const hashedPassword = await bcrypt.hash('$ESCAPED_PASS', 12);

  const existing = await prisma.admin.findUnique({
    where: { username: '$ADMIN_USER' }
  });

  if (existing) {
    await prisma.admin.update({
      where: { username: '$ADMIN_USER' },
      data: { passwordHash: hashedPassword, mustChangePassword: false }
    });
  } else {
    await prisma.admin.create({
      data: { username: '$ADMIN_USER', passwordHash: hashedPassword, mustChangePassword: false }
    });
  }

  await prisma.\$disconnect();
}

createAdmin().catch(console.error);
EOF

node .create-admin-temp.mjs
rm -f .create-admin-temp.mjs
print_ok "Admin account '$ADMIN_USER' created"

# Build application
echo -e "  Building application..."
npm run build
print_ok "Application built"

# ==========================================
# STEP 6: Create systemd service
# ==========================================
print_step 6 "Setting up systemd service..."

SERVICE_FILE="/etc/systemd/system/nexuscontrol.service"
run_sudo tee "$SERVICE_FILE" > /dev/null << EOF
[Unit]
Description=NexusControl Backend
After=network.target docker.service postgresql.service
Wants=docker.service

[Service]
Type=simple
User=$USER
WorkingDirectory=$INSTALL_DIR
ExecStart=$(which node) dist/index.js
Restart=on-failure
RestartSec=10
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF

run_sudo systemctl daemon-reload
run_sudo systemctl enable nexuscontrol
print_ok "Systemd service created and enabled"

# Open firewall port
if command_exists ufw; then
    echo -e "  Opening firewall port $BACKEND_PORT..."
    run_sudo ufw allow "$BACKEND_PORT/tcp" >/dev/null 2>&1 || true
    print_ok "Firewall port $BACKEND_PORT opened"
fi

# ==========================================
# STEP 7: Complete
# ==========================================
print_step 7 "Installation complete!"

echo ""
echo -e "${GREEN}═══════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}                 Installation Successful!                  ${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "  ${CYAN}Installation directory:${NC} $INSTALL_DIR"
echo -e "  ${CYAN}Database:${NC} postgresql://localhost:5432/$DB_NAME"
echo -e "  ${CYAN}Admin user:${NC} $ADMIN_USER"
echo ""
echo -e "  ${YELLOW}Start the server:${NC}"
echo -e "    sudo systemctl start nexuscontrol"
echo ""
echo -e "  ${YELLOW}View logs:${NC}"
echo -e "    sudo journalctl -u nexuscontrol -f"
echo ""
echo -e "  ${YELLOW}Access the panel:${NC}"
echo -e "    Backend API: http://YOUR_IP:$BACKEND_PORT"
echo ""
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"

# Ask to start now
echo ""
echo -ne "  Start NexusControl now? (Y/n): "
read_input start_now
if [[ ! "$start_now" =~ ^[Nn]$ ]]; then
    run_sudo systemctl start nexuscontrol
    echo ""
    print_ok "NexusControl is now running!"
    echo -e "    View logs: ${CYAN}sudo journalctl -u nexuscontrol -f${NC}"
fi
