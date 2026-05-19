import { Process, Processor } from '@nestjs/bull';
import { Injectable, Logger } from '@nestjs/common';
import { Job } from 'bull';
import { PrismaService } from './prisma.service';

interface WhatsAppMessage {
  to: string;
  templateName: string;
  parameters: string[];
  invoiceUrl?: string;
}

@Processor('whatsapp')
@Injectable()
export class WhatsAppWorker {
  private readonly logger = new Logger(WhatsAppWorker.name);
  private readonly baseUrl = 'https://graph.facebook.com/v19.0';
  private readonly phoneNumberId = process.env.META_PHONE_NUMBER_ID;
  private readonly token = process.env.META_WHATSAPP_TOKEN;

  constructor(private readonly prisma: PrismaService) {}

  // ─── ORDER CONFIRMATION ──────────────────────────────────────

  @Process('order-confirmation')
  async sendOrderConfirmation(job: Job<{ orderId: string }>) {
    const { orderId } = job.data;

    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        items: {
          include: {
            variant: {
              include: { product: { select: { name: true } } },
            },
          },
        },
      },
    });

    if (!order || !order.customerPhone) return;

    const itemSummary = order.items
      .slice(0, 3)
      .map((i) => `${i.variant.product.name} x${i.quantityOrdered}`)
      .join(', ');

    await this.sendTemplate({
      to: order.customerPhone,
      templateName: 'order_confirmation',
      parameters: [
        'Customer', 
        order.id.slice(0, 8).toUpperCase(), // Using short ID since there is no orderNumber in schema
        itemSummary,
        `₹${Number(order.total).toFixed(2)}`,
      ],
      invoiceUrl: `${process.env.APP_URL}/orders/${order.id}/invoice`,
    });

    this.logger.log(`WhatsApp confirmation sent for order ${order.id}`);
  }

  // ─── SHIPPING UPDATE ─────────────────────────────────────────

  @Process('shipping-update')
  async sendShippingUpdate(
    job: Job<{ orderId: string; trackingNumber: string; carrier: string }>,
  ) {
    const { orderId, trackingNumber, carrier } = job.data;

    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
    });

    if (!order?.customerPhone) return;

    await this.sendTemplate({
      to: order.customerPhone,
      templateName: 'order_shipped',
      parameters: [
        'Customer',
        order.id.slice(0, 8).toUpperCase(),
        carrier,
        trackingNumber,
      ],
    });
  }

  // ─── ABANDONED CART ──────────────────────────────────────────

  @Process('abandoned-cart')
  async sendAbandonedCart(
    job: Job<{ customerPhone: string; cartTotal: number; recoverUrl: string }>,
  ) {
    const { customerPhone, cartTotal, recoverUrl } = job.data;

    if (!customerPhone) return;

    await this.sendTemplate({
      to: customerPhone,
      templateName: 'abandoned_cart',
      parameters: [
        'Customer',
        `₹${cartTotal.toFixed(2)}`,
        recoverUrl,
      ],
    });
  }

  // ─── CORE SEND FUNCTION ──────────────────────────────────────

  private async sendTemplate(msg: WhatsAppMessage): Promise<void> {
    if (!this.phoneNumberId || !this.token) {
      this.logger.warn('WhatsApp credentials not configured — skipping send');
      return;
    }

    const phone = this.formatPhone(msg.to);

    const body: any = {
      messaging_product: 'whatsapp',
      to: phone,
      type: 'template',
      template: {
        name: msg.templateName,
        language: { code: 'en_IN' },
        components: [
          {
            type: 'body',
            parameters: msg.parameters.map((p) => ({ type: 'text', text: p })),
          },
        ],
      },
    };

    // Attach invoice URL button if provided
    if (msg.invoiceUrl) {
      body.template.components.push({
        type: 'button',
        sub_type: 'url',
        index: '0',
        parameters: [{ type: 'text', text: msg.invoiceUrl }],
      });
    }

    const response = await fetch(
      `${this.baseUrl}/${this.phoneNumberId}/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      },
    );

    if (!response.ok) {
      const err = await response.text();
      this.logger.error(`WhatsApp API error: ${err}`);
      throw new Error(`WhatsApp send failed: ${response.status}`);
    }

    this.logger.log(`WhatsApp message sent to ${phone} (template: ${msg.templateName})`);
  }

  private formatPhone(phone: string): string {
    // Remove all non-digits
    const digits = phone.replace(/\D/g, '');
    // Add India code if not present
    if (digits.startsWith('91') && digits.length === 12) return digits;
    if (digits.length === 10) return `91${digits}`;
    return digits;
  }
}