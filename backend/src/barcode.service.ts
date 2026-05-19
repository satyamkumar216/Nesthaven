import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import * as bwipjs from 'bwip-js';
import PDFDocument from 'pdfkit'; // Notice the clean import here!

@Injectable()
export class BarcodeService {
  private readonly logger = new Logger(BarcodeService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ─── GENERATE BARCODE IMAGE (PNG buffer) ────────────────────────
  async generateBarcode(text: string): Promise<Buffer> {
    try {
      return await bwipjs.toBuffer({
        bcid: 'code128',
        text: text,
        scale: 3,
        height: 10,
        includetext: true,
        textxalign: 'center',
      });
    } catch (error: any) {
      this.logger.error(`Failed to generate barcode: ${error.message}`);
      throw new Error('Barcode generation failed');
    }
  }

  // ─── GENERATE LABEL PDF ─────────────────────────────────────────
  async generateBarcodePDF(): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument();
        const buffers: Buffer[] = [];
        
        doc.on('data', buffers.push.bind(buffers));
        doc.on('end', () => {
          resolve(Buffer.concat(buffers));
        });

        doc.text('Nesthaven Barcode Batch', { align: 'center' });
        doc.end();
      } catch (error: any) {
        reject(error);
      }
    });
  }

  // ─── BARCODE SCAN ROUTER ────────────────────────────────────────
 
  //////


  // barcode.service.ts — replace processScan

async processScan(barcodeValue: string) {
  this.logger.log(`Processing scan for: ${barcodeValue}`);

  const barcode = await this.prisma.barcode.findUnique({
    where: { barcodeValue, isActive: true },
    include: {
      variant: {
        include: {
          product: { select: { name: true } },
          stocks: {
            select: { quantityAvailable: true },
          },
        },
      },
    },
  });

  if (!barcode) {
    throw new NotFoundException(`No product found for barcode: ${barcodeValue}`);
  }

  const { variant } = barcode;
  const totalStock = variant.stocks.reduce(
    (sum, s) => sum + s.quantityAvailable, 0
  );

  return {
    variantId: variant.id,
    name: `${variant.product.name}`,
    sku: variant.sku,
    barcode: barcodeValue,
    price: Number(variant.retailPrice),
    taxRate: 18, // You'll want a tax field on Product/Variant eventually
    stock: totalStock,
    attributes: variant.attributes,
  };
}
}