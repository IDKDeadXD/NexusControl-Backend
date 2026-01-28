# NexusControl - Backend

A self-hosted Discord bot management panel with Docker container orchestration.

## Quick Install (VPS)

Run this single command on your VPS to install everything:

```bash
curl -fsSL https://raw.githubusercontent.com/IDKDeadXD/NexusControl-Backend/main/install.sh | bash
```

Or with wget:
```bash
wget -qO- https://raw.githubusercontent.com/IDKDeadXD/NexusControl-Backend/main/install.sh | bash
```

### Custom Installation Directory
```bash
curl -fsSL https://raw.githubusercontent.com/IDKDeadXD/NexusControl-Backend/main/install.sh | INSTALL_DIR=/opt/nexuscontrol bash
```

## Manual Installation

### Prerequisites

- Node.js 18+
- Docker (for running bot containers)
- PostgreSQL or SQLite

### Steps

1. Clone the repository:
```bash
git clone https://github.com/IDKDeadXD/NexusControl-Backend.git
cd NexusControl-Backend
```

2. Run the setup wizard:
```bash
node setup.js
```

3. Start the server:
```bash
npm start
```

## Running as a Service

After installation, you can run the backend as a systemd service:

```bash
# Copy the service file
sudo cp nexuscontrol.service /etc/systemd/system/

# Reload systemd
sudo systemctl daemon-reload

# Enable auto-start on boot
sudo systemctl enable nexuscontrol

# Start the service
sudo systemctl start nexuscontrol

# View logs
sudo journalctl -u nexuscontrol -f
```

## Configuration

All configuration is stored in `.env`. The setup wizard will create this for you.

Key settings:
- `DATABASE_URL` - Database connection string
- `PORT` - Server port (default: 3001)
- `FRONTEND_URL` - URL of your frontend for CORS
- `JWT_SECRET` / `JWT_REFRESH_SECRET` - Authentication secrets
- `DOCKER_SOCKET` - Docker socket path

## API Documentation

### Authentication
- `POST /api/auth/login` - Login
- `POST /api/auth/logout` - Logout
- `POST /api/auth/refresh` - Refresh access token
- `POST /api/auth/change-password` - Change password

### Bots
- `GET /api/bots` - List all bots
- `POST /api/bots` - Create a new bot
- `GET /api/bots/:id` - Get bot details
- `PATCH /api/bots/:id` - Update bot
- `DELETE /api/bots/:id` - Delete bot
- `POST /api/bots/:id/start` - Start bot container
- `POST /api/bots/:id/stop` - Stop bot container
- `POST /api/bots/:id/restart` - Restart bot container

### Files
- `GET /api/files/:botId` - List bot files
- `POST /api/files/:botId/upload` - Upload files
- `DELETE /api/files/:botId/:path` - Delete file

### Webhooks
- `GET /api/webhooks` - List webhooks
- `POST /api/webhooks` - Create webhook
- `DELETE /api/webhooks/:id` - Delete webhook

### Security
- `GET /api/security/stats` - Security dashboard stats
- `GET /api/security/audit-logs` - Audit logs
- `GET /api/security/sessions` - Active sessions

## Tech Stack

- **Runtime**: Node.js
- **Framework**: Fastify
- **Database**: PostgreSQL / SQLite with Prisma ORM
- **Containers**: Docker via Dockerode
- **Real-time**: Socket.io
- **Auth**: JWT with refresh tokens

## Security

- All Discord tokens are encrypted at rest (AES-256-GCM)
- JWT authentication with short-lived access tokens
- Rate limiting on all endpoints
- Security headers (HSTS, CSP, X-Frame-Options)
- Audit logging for all actions
- Suspicious activity detection

## License

MIT
