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
# ============================================

REPO_URL="${REPO_URL:-$DEFAULT_REPO_URL}"
INSTALL_DIR="${INSTALL_DIR:-$HOME/nexuscontrol-backend}"
BRANCH="${BRANCH:-main}"

# Function to read input (works even when piped)
read_input() {
    read "$@" </dev/tty
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
    echo -e "\n${BLUE}[$1/6]${NC} $2"
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
# STEP 1: Check Prerequisites
# ==========================================
print_step 1 "Checking prerequisites..."

# Git
if command_exists git; then
    print_ok "Git installed"
else
    print_err "Git not found"
    echo -e "    Install: ${CYAN}sudo apt install git${NC} (Ubuntu/Debian)"
    exit 1
fi

# Node.js
if command_exists node; then
    NODE_VER=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
    if [ "$NODE_VER" -ge 18 ]; then
        print_ok "Node.js $(node -v) installed"
    else
        print_err "Node.js 18+ required (found $(node -v))"
        exit 1
    fi
else
    print_err "Node.js not found"
    echo -e "    Install: ${CYAN}curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt install -y nodejs${NC}"
    exit 1
fi

# npm
if command_exists npm; then
    print_ok "npm $(npm -v) installed"
else
    print_err "npm not found"
    exit 1
fi

# Docker
if command_exists docker; then
    if docker info >/dev/null 2>&1; then
        print_ok "Docker installed and running"
    else
        print_warn "Docker installed but not running"
        echo -e "    Start: ${CYAN}sudo systemctl start docker${NC}"
    fi
else
    print_warn "Docker not installed (required for running bots)"
    echo -e "    Install: ${CYAN}curl -fsSL https://get.docker.com | sh${NC}"
    echo -ne "    Continue without Docker? (y/N): "
    read_input cont
    [[ ! "$cont" =~ ^[Yy]$ ]] && exit 1
fi

# ==========================================
# STEP 2: Clone Repository
# ==========================================
print_step 2 "Setting up installation directory..."

if [ -d "$INSTALL_DIR" ]; then
    print_warn "Directory exists: $INSTALL_DIR"
    echo -ne "    Remove and reinstall? (y/N): "
    read_input remove
    if [[ "$remove" =~ ^[Yy]$ ]]; then
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
# STEP 3: Install Dependencies
# ==========================================
print_step 3 "Installing Node.js dependencies..."

npm install 2>/dev/null || npm install
print_ok "Dependencies installed"

# ==========================================
# STEP 4: Run Setup Wizard
# ==========================================
print_step 4 "Starting interactive setup wizard..."
echo ""

# Run setup.js with stdin connected to terminal
node setup.js </dev/tty

# ==========================================
# STEP 5: Create systemd service
# ==========================================
print_step 5 "Setting up systemd service..."

SERVICE_FILE="/etc/systemd/system/nexuscontrol.service"
if [ -w "/etc/systemd/system" ] || [ "$EUID" -eq 0 ]; then
    cat > "$SERVICE_FILE" << EOF
[Unit]
Description=NexusControl Backend
After=network.target docker.service
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
    systemctl daemon-reload
    print_ok "Systemd service created"
else
    print_warn "Need sudo to create systemd service"
    echo -e "    Run: ${CYAN}sudo cp $INSTALL_DIR/nexuscontrol.service /etc/systemd/system/${NC}"
fi

# ==========================================
# STEP 6: Complete
# ==========================================
print_step 6 "Installation complete!"

echo ""
echo -e "${GREEN}═══════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}                 Installation Successful!                  ${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "  ${CYAN}Installation directory:${NC} $INSTALL_DIR"
echo ""
echo -e "  ${YELLOW}Start the server:${NC}"
echo -e "    cd $INSTALL_DIR && npm start"
echo ""
echo -e "  ${YELLOW}Or run as a service:${NC}"
echo -e "    sudo systemctl enable nexuscontrol"
echo -e "    sudo systemctl start nexuscontrol"
echo ""
echo -e "  ${YELLOW}View logs:${NC}"
echo -e "    sudo journalctl -u nexuscontrol -f"
echo ""
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
