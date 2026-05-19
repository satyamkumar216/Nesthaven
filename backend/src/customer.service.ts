import { Injectable, NotFoundException, ConflictException, Logger } from '@nestjs/common';
import { PrismaService } from './prisma.service';

@Injectable()
export class CustomerService {
  private readonly logger = new Logger(CustomerService.name);

  constructor(private readonly prisma: PrismaService) {}

  async findByPhone(phone: string) {
    const customer = await this.prisma.customer.findUnique({
      where: { phone },
      include: {
        orders: {
          orderBy: { createdAt: 'desc' },
          take: 5,
          select: {
            id: true,
            total: true,
            status: true,
            createdAt: true,
            source: true,
          },
        },
      },
    });
    if (!customer) throw new NotFoundException(`No customer with phone ${phone}`);
    return customer;
  }

  async findById(id: string) {
    const customer = await this.prisma.customer.findUnique({ where: { id } });
    if (!customer) throw new NotFoundException(`Customer ${id} not found`);
    return customer;
  }

  async create(data: { name: string; phone: string; email?: string }) {
    const existing = await this.prisma.customer.findUnique({
      where: { phone: data.phone },
    });
    if (existing) throw new ConflictException(`Phone ${data.phone} already registered`);

    return this.prisma.customer.create({ data });
  }

  async update(id: string, data: { name?: string; email?: string }) {
    await this.findById(id); // throws 404 if missing
    return this.prisma.customer.update({ where: { id }, data });
  }

  async getLoyaltySummary(id: string) {
    const customer = await this.findById(id);
    const totalSpend = await this.prisma.order.aggregate({
      where: { customerId: id, status: { not: 'CANCELLED' } },
      _sum: { total: true },
      _count: { id: true },
    });

    return {
      customerId: id,
      name: customer.name,
      phone: customer.phone,
      loyaltyPoints: customer.loyaltyPoints,
      cashValue: (customer.loyaltyPoints * 0.1).toFixed(2),
      totalOrders: totalSpend._count.id,
      lifetimeSpend: Number(totalSpend._sum.total ?? 0).toFixed(2),
    };
  }
}