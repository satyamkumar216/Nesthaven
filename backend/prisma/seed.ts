import { PrismaClient, WarehouseType, LedgerReasonCode, StaffRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting seed...\n');

  // ── 1. WAREHOUSE ─────────────────────────────────────────────
  const warehouse = await prisma.warehouse.upsert({
    where: { id: '00000000-0000-0000-0000-000000000001' },
    update: {},
    create: {
      id:        '00000000-0000-0000-0000-000000000001',
      name:      'Main Store',
      type:      WarehouseType.RETAIL_STORE,
      pincode:   '110001',
      latitude:  28.6139,
      longitude: 77.2090,
      isActive:  true,
    },
  });
  console.log(`✅ Warehouse:  ${warehouse.name} (${warehouse.id})`);

  // ── 2. ZONE → RACK → SHELF ───────────────────────────────────
  const zone = await prisma.warehouseZone.upsert({
    where: { id: '00000000-0000-0000-0000-000000000010' },
    update: {},
    create: {
      id:          '00000000-0000-0000-0000-000000000010',
      warehouseId: warehouse.id,
      zoneCode:    'A',
    },
  });

  const rack = await prisma.warehouseRack.upsert({
    where: { id: '00000000-0000-0000-0000-000000000020' },
    update: {},
    create: {
      id:             '00000000-0000-0000-0000-000000000020',
      zoneId:         zone.id,
      rackIdentifier: 'R1',
    },
  });

  const shelf = await prisma.warehouseShelf.upsert({
    where: { id: '00000000-0000-0000-0000-000000000030' },
    update: {},
    create: {
      id:                     '00000000-0000-0000-0000-000000000030',
      rackId:                 rack.id,
      shelfNumber:            'S1',
      maxWeightCapacityGrams: 50000,
    },
  });
  console.log(`✅ Location:   Zone A → Rack R1 → Shelf S1`);

  // ── 3. PRODUCT ───────────────────────────────────────────────
  const product = await prisma.product.upsert({
    where: { id: '00000000-0000-0000-0000-000000000040' },
    update: {},
    create: {
      id:          '00000000-0000-0000-0000-000000000040',
      name:        'Ceramic Mug Set',
      description: 'Set of 6 premium ceramic mugs',
    },
  });
  console.log(`✅ Product:    ${product.name} (${product.id})`);

  // ── 4. PRODUCT VARIANT ───────────────────────────────────────
  const variant = await prisma.productVariant.upsert({
    where: { sku: 'MUG-SET-6-BLK' },
    update: {},
    create: {
      id:          '00000000-0000-0000-0000-000000000050',
      productId:   product.id,
      sku:         'MUG-SET-6-BLK',
      attributes:  { color: 'Obsidian Matte', size: 'Set of 6' },
      weightGrams: 1800,
      baseCost:    350.00,
      retailPrice: 799.00,
    },
  });
  console.log(`✅ Variant:    ${variant.sku} @ ₹${variant.retailPrice}`);

  // ── 5. BARCODE ───────────────────────────────────────────────
  const barcode = await prisma.barcode.upsert({
    where: { barcodeValue: '8901234567890' },
    update: {},
    create: {
      variantId:    variant.id,
      barcodeValue: '8901234567890',
      isActive:     true,
    },
  });
  console.log(`✅ Barcode:    ${barcode.barcodeValue}`);

  // ── 6. INVENTORY STOCK ───────────────────────────────────────
  const stock = await prisma.inventoryStock.upsert({
    where: {
      variantId_shelfId: {
        variantId: variant.id,
        shelfId:   shelf.id,
      },
    },
    update: { quantityAvailable: 50 },
    create: {
      variantId:         variant.id,
      shelfId:           shelf.id,
      quantityAvailable: 50,
      quantityReserved:  0,
      reorderPoint:      10,
    },
  });
  console.log(`✅ Stock:      ${stock.quantityAvailable} units on shelf S1`);

  // ── 7. OPENING LEDGER ENTRY ──────────────────────────────────
  const existingEntry = await prisma.inventoryLedger.findFirst({
    where: {
      variantId:  variant.id,
      shelfId:    shelf.id,
      reasonCode: LedgerReasonCode.PO_RECEIPT,
    },
  });

  if (!existingEntry) {
    await prisma.inventoryLedger.create({
      data: {
        variantId:     variant.id,
        shelfId:       shelf.id,
        quantityDelta: 50,
        reasonCode:    LedgerReasonCode.PO_RECEIPT,
      },
    });
    console.log(`✅ Ledger:     Opening entry of +50 units recorded`);
  } else {
    console.log(`⏭  Ledger:     Opening entry already exists, skipped`);
  }

  // ── 8. DEMO CUSTOMER ─────────────────────────────────────────
  const customer = await prisma.customer.upsert({
    where: { phone: '9999999999' },
    update: {},
    create: {
      name:          'Demo Customer',
      phone:         '9999999999',
      email:         'demo@nesthaven.in',
      loyaltyPoints: 100,
    },
  });
  console.log(`✅ Customer:   ${customer.name} (${customer.phone})`);

  // ── 9. SEED STAFF ────────────────────────────────────────────
  const hashedPin = await bcrypt.hash('1234', 10);
  const staff = await prisma.staff.upsert({
    where: { email: 'manager@nesthaven.in' },
    update: {},
    create: {
      name:        'Store Manager',
      email:       'manager@nesthaven.in',
      pin:         hashedPin,
      role:        StaffRole.MANAGER,
      warehouseId: warehouse.id,
    },
  });
  console.log(`✅ Staff:      ${staff.name} (${staff.email}) PIN: 1234`);

  // ── SUMMARY ──────────────────────────────────────────────────
  console.log('\n─────────────────────────────────────────────');
  console.log('🎉 Seed complete! Use these values for testing:');
  console.log(`   Warehouse ID : ${warehouse.id}`);
  console.log(`   Variant ID   : ${variant.id}`);
  console.log(`   Barcode      : 8901234567890`);
  console.log(`   Customer Tel : 9999999999`);
  console.log(`   Staff Login  : manager@nesthaven.in (PIN: 1234)`);
  console.log('─────────────────────────────────────────────\n');
}

main()
  .catch((err) => {
    console.error('❌ Seed failed:', err);
    throw err;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });