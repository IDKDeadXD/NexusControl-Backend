import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  const username = process.env.DEFAULT_ADMIN_USERNAME || 'admin';
  const password = process.env.DEFAULT_ADMIN_PASSWORD || 'temp123';

  const existingAdmin = await prisma.admin.findUnique({
    where: { username },
  });

  if (existingAdmin) {
    console.log(`Admin user '${username}' already exists. Skipping seed.`);
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const admin = await prisma.admin.create({
    data: {
      username,
      passwordHash,
      mustChangePassword: true,
    },
  });

  console.log(`Created admin user: ${admin.username}`);
  console.log(`Default password: ${password}`);
  console.log('You will be required to change this password on first login.');
}

main()
  .catch((e) => {
    console.error('Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
