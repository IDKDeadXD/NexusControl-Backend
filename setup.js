#!/usr/bin/env node

import { execSync, spawn } from 'child_process';
import { createInterface } from 'readline';
import { existsSync, writeFileSync, readFileSync, mkdirSync } from 'fs';
import { randomBytes } from 'crypto';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const rl = createInterface({
  input: process.stdin,
  output: process.stdout,
});

function question(prompt) {
  return new Promise((resolve) => {
    rl.question(prompt, resolve);
  });
}

function questionHidden(prompt) {
  return new Promise((resolve) => {
    process.stdout.write(prompt);
    const stdin = process.stdin;
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');

    let password = '';
    const onData = (ch) => {
      if (ch === '\r' || ch === '\n') {
        stdin.setRawMode(false);
        stdin.removeListener('data', onData);
        process.stdout.write('\n');
        resolve(password);
      } else if (ch === '\u0003') {
        process.exit();
      } else if (ch === '\u007F') {
        if (password.length > 0) {
          password = password.slice(0, -1);
          process.stdout.write('\b \b');
        }
      } else {
        password += ch;
        process.stdout.write('*');
      }
    };
    stdin.on('data', onData);
  });
}

function exec(command, options = {}) {
  try {
    execSync(command, { stdio: 'inherit', ...options });
    return true;
  } catch (error) {
    return false;
  }
}

function generateSecret(length = 64) {
  return randomBytes(length).toString('hex');
}

console.log(`
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║         Discord Bot Manager - Setup Wizard                ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
`);

async function main() {
  try {
    // Step 1: Check Node.js version
    console.log('▶ Checking Node.js version...');
    const nodeVersion = process.version;
    const majorVersion = parseInt(nodeVersion.slice(1).split('.')[0]);
    if (majorVersion < 18) {
      console.error(`✖ Node.js 18 or higher required. Current version: ${nodeVersion}`);
      process.exit(1);
    }
    console.log(`✔ Node.js ${nodeVersion} detected\n`);

    // Step 2: Check Docker
    console.log('▶ Checking Docker...');
    try {
      execSync('docker info', { stdio: 'pipe' });
      console.log('✔ Docker is running\n');
    } catch {
      console.error('✖ Docker is not running or not installed.');
      console.error('  Please install Docker and start the Docker daemon.\n');
      const continueAnyway = await question('Continue anyway? (y/N): ');
      if (continueAnyway.toLowerCase() !== 'y') {
        process.exit(1);
      }
    }

    // Step 3: Install dependencies
    console.log('▶ Installing dependencies...');
    if (!exec('npm install')) {
      console.error('✖ Failed to install dependencies');
      process.exit(1);
    }
    console.log('✔ Dependencies installed\n');

    // Step 4: Setup environment variables
    console.log('▶ Setting up environment...\n');
    const envPath = join(__dirname, '.env');
    let envContent = '';

    if (existsSync(envPath)) {
      const overwrite = await question('.env file already exists. Overwrite? (y/N): ');
      if (overwrite.toLowerCase() !== 'y') {
        console.log('Keeping existing .env file.\n');
        envContent = readFileSync(envPath, 'utf8');
      }
    }

    if (!envContent) {
      // Database URL
      console.log('\n── Database Configuration ──');
      const dbType = await question('Database type (sqlite/postgresql) [sqlite]: ');
      let databaseUrl;

      if (dbType.toLowerCase() === 'postgresql' || dbType.toLowerCase() === 'postgres') {
        const dbHost = await question('PostgreSQL host [localhost]: ') || 'localhost';
        const dbPort = await question('PostgreSQL port [5432]: ') || '5432';
        const dbName = await question('Database name [botmanager]: ') || 'botmanager';
        const dbUser = await question('Database user [postgres]: ') || 'postgres';
        const dbPass = await questionHidden('Database password: ');
        databaseUrl = `postgresql://${dbUser}:${dbPass}@${dbHost}:${dbPort}/${dbName}`;
      } else {
        databaseUrl = 'file:./data/botmanager.db';
        // Create data directory for SQLite
        const dataDir = join(__dirname, 'data');
        if (!existsSync(dataDir)) {
          mkdirSync(dataDir, { recursive: true });
        }
      }

      // Server configuration
      console.log('\n── Server Configuration ──');
      const port = await question('Backend port [3001]: ') || '3001';
      const frontendUrl = await question('Frontend URL [http://localhost:3000]: ') || 'http://localhost:3000';

      // JWT secrets
      console.log('\n── Security Configuration ──');
      console.log('Generating secure JWT secrets...');
      const jwtSecret = generateSecret();
      const jwtRefreshSecret = generateSecret();

      // Docker configuration
      console.log('\n── Docker Configuration ──');
      const dockerSocket = await question('Docker socket path [/var/run/docker.sock]: ') || '/var/run/docker.sock';
      const botsDir = await question('Bots storage directory [./bots]: ') || './bots';

      // Create bots directory
      const botsPath = join(__dirname, botsDir);
      if (!existsSync(botsPath)) {
        mkdirSync(botsPath, { recursive: true });
        console.log(`✔ Created bots directory: ${botsPath}`);
      }

      // Build .env content
      envContent = `# Discord Bot Manager - Environment Configuration
# Generated by setup wizard

# Environment
NODE_ENV=production

# Server
PORT=${port}
FRONTEND_URL=${frontendUrl}

# Database
DATABASE_URL="${databaseUrl}"

# JWT Authentication
JWT_SECRET=${jwtSecret}
JWT_REFRESH_SECRET=${jwtRefreshSecret}
JWT_EXPIRY=15m
JWT_REFRESH_EXPIRY=7d

# Docker
DOCKER_SOCKET=${dockerSocket}

# Bots Storage
BOTS_DIRECTORY=${botsDir}
`;

      writeFileSync(envPath, envContent);
      console.log('\n✔ Environment configuration saved\n');
    }

    // Step 5: Generate Prisma client
    console.log('▶ Generating Prisma client...');
    if (!exec('npx prisma generate')) {
      console.error('✖ Failed to generate Prisma client');
      process.exit(1);
    }
    console.log('✔ Prisma client generated\n');

    // Step 6: Run database migrations
    console.log('▶ Running database migrations...');
    if (!exec('npx prisma migrate deploy')) {
      console.log('⚠ Migration failed - attempting to push schema...');
      if (!exec('npx prisma db push')) {
        console.error('✖ Failed to setup database');
        process.exit(1);
      }
    }
    console.log('✔ Database setup complete\n');

    // Step 7: Create admin user
    console.log('▶ Setting up admin account...\n');
    console.log('── Admin Account ──');
    const username = await question('Admin username [admin]: ') || 'admin';
    let password = await questionHidden('Admin password (min 8 chars): ');

    while (password.length < 8) {
      console.log('Password must be at least 8 characters.');
      password = await questionHidden('Admin password (min 8 chars): ');
    }

    const confirmPassword = await questionHidden('Confirm password: ');

    if (password !== confirmPassword) {
      console.error('✖ Passwords do not match');
      process.exit(1);
    }

    // Create admin user via Prisma
    console.log('\nCreating admin account...');

    // We need to hash the password and create the user
    const createAdminScript = `
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function createAdmin() {
  const hashedPassword = await bcrypt.hash('${password}', 12);

  const existing = await prisma.admin.findUnique({
    where: { username: '${username}' }
  });

  if (existing) {
    await prisma.admin.update({
      where: { username: '${username}' },
      data: {
        password: hashedPassword,
        mustChangePassword: false
      }
    });
    console.log('Admin account updated.');
  } else {
    await prisma.admin.create({
      data: {
        username: '${username}',
        password: hashedPassword,
        mustChangePassword: false
      }
    });
    console.log('Admin account created.');
  }

  await prisma.$disconnect();
}

createAdmin().catch(console.error);
`;

    const tempScriptPath = join(__dirname, '.create-admin-temp.mjs');
    writeFileSync(tempScriptPath, createAdminScript);

    try {
      exec(`node ${tempScriptPath}`, { stdio: 'pipe' });
      console.log(`✔ Admin account '${username}' created\n`);
    } catch (error) {
      console.error('✖ Failed to create admin account');
    } finally {
      // Clean up temp script
      try {
        execSync(`rm -f ${tempScriptPath}`, { stdio: 'pipe' });
      } catch {
        try {
          execSync(`del /f "${tempScriptPath}"`, { stdio: 'pipe' });
        } catch {}
      }
    }

    // Step 8: Build the application
    console.log('▶ Building application...');
    if (!exec('npm run build')) {
      console.error('✖ Failed to build application');
      process.exit(1);
    }
    console.log('✔ Application built\n');

    // Done!
    console.log(`
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║              Setup Complete!                              ║
║                                                           ║
╠═══════════════════════════════════════════════════════════╣
║                                                           ║
║  To start the server:                                     ║
║    npm start                                              ║
║                                                           ║
║  Or for development:                                      ║
║    npm run dev                                            ║
║                                                           ║
║  Admin credentials:                                       ║
║    Username: ${username.padEnd(42)}║
║    Password: ********                                     ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
`);
  } catch (error) {
    console.error('\n✖ Setup failed:', error.message);
    process.exit(1);
  } finally {
    rl.close();
  }
}

main();
