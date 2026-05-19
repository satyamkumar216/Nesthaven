// prisma/seed.ts
// Run: npx ts-node prisma/seed.ts
import { PrismaClient } from '@prisma/client';
import * as bcrypt      from 'bcrypt';

const prisma = new PrismaClient();

const PERMISSIONS = [
  // Products
  { action: 'CREATE_PRODUCT', subject: 'PRODUCT'   },
  { action: 'READ_PRODUCT',   subject: 'PRODUCT'   },
  { action: 'UPDATE_PRODUCT', subject: 'PRODUCT'   },
  { action: 'DELETE_PRODUCT', subject: 'PRODUCT'   },
  // Inventory
  { action: 'MANAGE_INVENTORY', subject: 'INVENTORY' },
  { action: 'READ_INVENTORY',   subject: 'INVENTORY' },
  // Orders / POS
  { action: 'CREATE_ORDER',     subject: 'ORDER'    },
  { action: 'READ_ORDER',       subject: 'ORDER'    },
  { action: 'VOID_SALE',        subject: 'ORDER'    },
  { action: 'PROCESS_REFUND',   subject: 'ORDER'    },
  // Reports
  { action: 'READ_REPORT',      subject: '*'         },
  // Staff
  { action: 'MANAGE_STAFF',     subject: 'USER'     },
];

const ROLES: { name: string; isSystem: boolean; permissions: string[] }[] = [
  {
    name       : 'SUPER_ADMIN',
    isSystem   : true,
    permissions: PERMISSIONS.map((p) => p.action), // all
  },
  {
    name       : 'MANAGER',
    isSystem   : true,
    permissions: [
      'CREATE_PRODUCT','READ_PRODUCT','UPDATE_PRODUCT',
      'MANAGE_INVENTORY','READ_INVENTORY',
      'CREATE_ORDER','READ_ORDER','VOID_SALE','PROCESS_REFUND',
      'READ_REPORT','MANAGE_STAFF',
    ],
  },
  {
    name       : 'CASHIER',
    isSystem   : true,
    permissions: ['CREATE_ORDER','READ_ORDER','READ_PRODUCT','READ_INVENTORY'],
  },
  {
    name       : 'WAREHOUSE_STAFF',
    isSystem   : true,
    permissions: ['MANAGE_INVENTORY','READ_INVENTORY','READ_PRODUCT'],
  },
];

async function main() {
  console.log('🌱 Seeding permissions …');
  for (const p of PERMISSIONS) {
    await prisma.permission.upsert({
      where : { action_subject: { action: p.action, subject: p.subject } },
      update: {},
      create: p,
    });
  }

  console.log('🌱 Seeding roles …');
  for (const roleDef of ROLES) {
    const role = await prisma.role.upsert({
      where : { name: roleDef.name },
      update: { isSystem: roleDef.isSystem },
      create: { name: roleDef.name, isSystem: roleDef.isSystem },
    });

    const perms = await prisma.permission.findMany({
      where: { action: { in: roleDef.permissions } },
    });

    for (const perm of perms) {
      await prisma.rolePermission.upsert({
        where : { roleId_permissionId: { roleId: role.id, permissionId: perm.id } },
        update: {},
        create: { roleId: role.id, permissionId: perm.id },
      });
    }
  }

  console.log('🌱 Seeding super-admin user …');
  const adminRole = await prisma.role.findUniqueOrThrow({ where: { name: 'SUPER_ADMIN' } });
  const hash      = await bcrypt.hash('Admin#2024!', 12);

  const admin = await prisma.user.upsert({
    where : { email: 'admin@pos.io' },
    update: {},
    create: {
      email        : 'admin@pos.io',
      username     : 'superadmin',
      passwordHash : hash,
      firstName    : 'Super',
      lastName     : 'Admin',
      isActive     : true,
      isVerified   : true,
    },
  });

  await prisma.userRole.upsert({
    where : { userId_roleId: { userId: admin.id, roleId: adminRole.id } },
    update: {},
    create: { userId: admin.id, roleId: adminRole.id },
  });

  console.log('✅ Seed complete.');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
