// backend/src/app.module.ts

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { BullModule } from '@nestjs/bull';
import { PrismaModule } from './prisma.module';
import { AnalyticsService } from './analytics.service';
import { InventoryService } from './inventory.service';
import { PosService } from './pos.service';
import { OrderRoutingService } from './order-routing.service';
import { BarcodeService } from './barcode.service';
import { CustomerService } from './customer.service';
import { AuthModule } from './auth/auth.module'; // ← ADDED AUTH MODULE IMPORT
import { WebhooksController, ShopifyOrderProcessor } from './webhooks.controller';
import { WhatsAppWorker } from './whatsapp.worker';

// New controllers
import {
  PosController,
  BarcodeController,
  InventoryController,
  AnalyticsController,
  CustomerController,
} from './pos.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env'] }),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }]),
    BullModule.forRoot({
      redis: { host: 'redis', port: 6379 },
    }),
    BullModule.registerQueue(
      { name: 'whatsapp' },
      { name: 'shopify-sync' },
    ),
    PrismaModule,
    AuthModule, // ← ADDED AUTH MODULE TO IMPORTS
  ],
  controllers: [
    WebhooksController,
    PosController,        
    BarcodeController,    
    InventoryController,  
    AnalyticsController,  
    CustomerController,   
  ],
  providers: [
    AnalyticsService,
    InventoryService,
    PosService,
    OrderRoutingService,
    BarcodeService,
    CustomerService,      
    WhatsAppWorker,
    ShopifyOrderProcessor,
  ],
})
export class AppModule {}