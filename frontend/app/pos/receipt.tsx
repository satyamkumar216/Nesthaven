'use client';

import React from 'react';

interface ReceiptProps {
  order: {
    orderNumber: string;
    total: string;
    gst: string;
    paymentMethod: string;
  };
  cart: Array<{
    name: string;
    sku: string;
    quantity: number;
    price: number;
  }>;
  cashierName?: string;
  warehouseName?: string;
}

export default function Receipt({
  order, cart, cashierName = 'Store Manager', warehouseName = 'NestHaven Main Store',
}: ReceiptProps) {
  const subtotal = cart.reduce((s, i) => s + i.price * i.quantity, 0);
  const gst      = Number(order.gst);
  const total    = Number(order.total);
  const now      = new Date();

  return (
    <div id="receipt" className="receipt-root">
      {/* Store header */}
      <div className="receipt-center">
        <p className="receipt-title">NESTHAVEN</p>
        <p>{warehouseName}</p>
        <p>GSTIN: 07AAAAA0000A1Z5</p>
        <p>─────────────────────</p>
      </div>

      {/* Meta */}
      <div className="receipt-meta">
        <p>Order  : #{order.orderNumber}</p>
        <p>Date   : {now.toLocaleDateString('en-IN')}</p>
        <p>Time   : {now.toLocaleTimeString('en-IN')}</p>
        <p>Staff  : {cashierName}</p>
        <p>─────────────────────</p>
      </div>

      {/* Line items */}
      <table className="receipt-table">
        <thead>
          <tr>
            <th className="receipt-th-left">Item</th>
            <th className="receipt-th-right">Qty</th>
            <th className="receipt-th-right">Amt</th>
          </tr>
        </thead>
        <tbody>
          {cart.map((item) => (
            <tr key={item.sku}>
              <td className="receipt-td-left">
                <span>{item.name}</span>
                <span className="receipt-sku">{item.sku}</span>
              </td>
              <td className="receipt-td-right">{item.quantity}</td>
              <td className="receipt-td-right">
                ₹{(item.price * item.quantity).toFixed(2)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Totals */}
      <div className="receipt-totals">
        <p>─────────────────────</p>
        <div className="receipt-row">
          <span>Subtotal</span>
          <span>₹{subtotal.toFixed(2)}</span>
        </div>
        <div className="receipt-row">
          <span>GST (18%)</span>
          <span>₹{gst.toFixed(2)}</span>
        </div>
        <p>─────────────────────</p>
        <div className="receipt-row receipt-total-row">
          <span>TOTAL</span>
          <span>₹{total.toFixed(2)}</span>
        </div>
        <div className="receipt-row">
          <span>Payment</span>
          <span>{order.paymentMethod}</span>
        </div>
      </div>

      {/* Footer */}
      <div className="receipt-center receipt-footer">
        <p>─────────────────────</p>
        <p>Thank you for shopping!</p>
        <p>Returns within 7 days with receipt</p>
        <p>support@nesthaven.in</p>
      </div>
    </div>
  );
}