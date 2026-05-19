'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import {
  ShoppingCart, Trash2, CreditCard, Banknote, Smartphone,
  Plus, Minus, Printer, Wifi, WifiOff, User, Package,
  X, ChevronRight, RefreshCw, Scan, AlertCircle, CheckCircle2,
  TrendingUp, Search,
} from 'lucide-react';
import Receipt from './receipt';

// ─── TYPES ────────────────────────────────────────────────────
interface CartItem {
  variantId: string;
  name: string;
  sku: string;
  barcode?: string;
  price: number;
  taxRate: number;
  quantity: number;
}

interface Customer {
  id: string;
  name: string;
  phone: string;
  email: string;
  loyaltyPoints: number;
}

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api';

export default function POSTerminal() {
  // ─── CORE RETAIL STATES ─────────────────────────────────────
  const [cart, setCart] = useState<CartItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [customerSearch, setCustomerSearch] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'CARD' | 'UPI'>('CASH');
  const [loyaltyRedeem, setLoyaltyRedeem] = useState<number>(0);
  const [isOnline, setIsOnline] = useState(true);

  // ─── TRANSACTION MODALS ──────────────────────────────────────
  const [isProcessing, setIsProcessing] = useState(false);
  const [showOrderComplete, setShowOrderComplete] = useState<any>(null);
  const [errorMessage, setErrorMessage] = useState('');

  // ─── SNAPSHOT PERSISTENCE REFS ──────────────────────────────
  const receiptCartRef = useRef<CartItem[]>([]);

  // ─── NETWORK AVAILABILITY CHECKS ────────────────────────────
  useEffect(() => {
    setIsOnline(navigator.onLine);
    const goOnline = () => setIsOnline(true);
    const goOffline = () => setIsOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  // ─── CATALOG AND BARCODE SEARCH PIPELINE ────────────────────
  const handleProductSearch = async (val: string) => {
    setSearchQuery(val);
    if (val.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    try {
      const res = await fetch(`${API}/v1/catalog/search?q=${encodeURIComponent(val)}`);
      if (res.ok) setSearchResults(await res.json());
    } catch {
      setSearchResults([]);
    }
  };

  const addToCart = (variant: any) => {
    setCart((prev) => {
      const existing = prev.find((i) => i.variantId === variant.id);
      if (existing) {
        return prev.map((i) =>
          i.variantId === variant.id ? { ...i, quantity: i.quantity + 1 } : i
        );
      }
      return [
        ...prev,
        {
          variantId: variant.id,
          name: variant.product?.name ?? 'Unknown Item',
          sku: variant.sku,
          price: Number(variant.retailPrice),
          taxRate: 0.18,
          quantity: 1,
        },
      ];
    });
    setSearchQuery('');
    setSearchResults([]);
  };

  const updateQuantity = (variantId: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((item) => {
          if (item.variantId === variantId) {
            const newQty = item.quantity + delta;
            return newQty > 0 ? { ...item, quantity: newQty } : null;
          }
          return item;
        })
        .filter(Boolean) as CartItem[]
    );
  };

  // ─── CRM LOYALTY PROFILE SEARCH ──────────────────────────────
  const handleCustomerSearch = async () => {
    if (!customerSearch.trim()) return;
    try {
      const res = await fetch(`${API}/v1/customers/lookup?phone=${customerSearch.trim()}`);
      if (res.ok) {
        setCustomer(await res.json());
        setErrorMessage('');
      } else {
        setErrorMessage('Customer profile not located.');
      }
    } catch {
      setErrorMessage('Offline mode - CRM lookup unavailable.');
    }
  };

  // ─── STATISTICAL CALCULATION AGGREGATIONS ───────────────────
  const subtotal = cart.reduce((acc, item) => acc + item.price * item.quantity, 0);
  const gst = subtotal * 0.18;
  const discount = loyaltyRedeem * 1; // 1 point = ₹1
  const total = Math.max(0, subtotal + gst - discount);

  // ─── CLEAR ENGINE SNAPSHOTS ──────────────────────────────────
  const clearCart = () => {
    receiptCartRef.current = [...cart];
    setCart([]);
    setCustomer(null);
    setCustomerSearch('');
    setLoyaltyRedeem(0);
    setErrorMessage('');
  };

  // ─── TRANSACTION SUBMISSION PIPELINE ───────────────────────
  const processCheckout = async () => {
    if (cart.length === 0) return;
    setIsProcessing(true);
    setErrorMessage('');

    const payload = {
      warehouseId: '00000000-0000-0000-0000-000000000001',
      customerId: customer?.id ?? null,
      paymentMethod,
      loyaltyPointsRedemed: loyaltyRedeem,
      items: cart.map((i) => ({
        variantId: i.variantId,
        quantity: i.quantity,
        priceSnapshot: i.price,
      })),
    };

    try {
      const res = await fetch(`${API}/v1/orders/pos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error('Transaction submission rejected.');
      const finalizedOrder = await res.json();

      receiptCartRef.current = [...cart];
      setShowOrderComplete({
        orderNumber: finalizedOrder.orderNumber ?? finalizedOrder.id.substring(0, 8).toUpperCase(),
        total: total.toFixed(2),
        gst: gst.toFixed(2),
        paymentMethod,
      });
      setCart([]);
      setCustomer(null);
      setLoyaltyRedeem(0);
    } catch (err: any) {
      setErrorMessage(err.message ?? 'Fatal checkout error occurred.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="h-screen w-screen bg-slate-50 text-slate-800 flex flex-col overflow-hidden font-sans select-none">
      
      {/* HEADER BANNER SECTION */}
      <header className="h-16 bg-white border-b border-slate-200 px-6 flex items-center justify-between shrink-0 shadow-sm z-10">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-emerald-600 flex items-center justify-center shadow-sm">
            <Package size={16} className="text-white" />
          </div>
          <span className="font-bold text-lg tracking-tight text-slate-900">NestHaven POS</span>
          <Link
            href="/dashboard"
            className="text-xs text-slate-600 hover:text-emerald-600 font-medium ml-4 border border-slate-200 bg-slate-50 px-3 py-1.5 rounded-xl transition-all hover:bg-slate-100 flex items-center gap-1.5 shadow-sm"
          >
            <TrendingUp size={13} /> Dashboard
          </Link>
        </div>

        <div className="flex items-center gap-4 text-sm">
          <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold shadow-sm ${
            isOnline ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'
          }`}>
            {isOnline ? <Wifi size={13} /> : <WifiOff size={13} />}
            {isOnline ? 'ONLINE REGISTER' : 'OFFLINE MODE'}
          </div>
        </div>
      </header>

      {/* MAIN RETAIL WORKSPACE */}
      <div className="flex-1 flex overflow-hidden min-h-0">
        
        {/* LEFT COLUMN: INTERACTIVE PRODUCT STOREFRONT */}
        <div className="flex-1 flex flex-col p-6 overflow-y-auto bg-white">
          
          {/* SEARCH FIELD BAR */}
          <div className="relative mb-6 shrink-0 z-20">
            <Search className="absolute left-4 top-3.5 text-slate-400" size={18} />
            <input
              type="text"
              placeholder="Scan item barcode values or type keywords..."
              value={searchQuery}
              onChange={(e) => handleProductSearch(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-12 pr-4 py-3 text-sm focus:outline-none focus:border-emerald-600 text-slate-900 transition-all placeholder-slate-400 shadow-inner focus:bg-white focus:ring-2 focus:ring-emerald-500/10"
            />

            {/* LIVE DATA OVERLAY SEARCH RESULTS */}
            {searchResults.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xl z-30 divide-y divide-slate-100">
                {searchResults.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => addToCart(item)}
                    className="w-full px-4 py-3.5 text-left hover:bg-slate-50 flex items-center justify-between group transition-colors"
                  >
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{item.product?.name}</p>
                      <p className="text-xs text-slate-500 font-mono mt-0.5">{item.sku}</p>
                    </div>
                    <span className="text-sm font-bold text-emerald-600 group-hover:translate-x-1 transition-transform flex items-center gap-1">
                      ₹{Number(item.retailPrice).toFixed(2)} <ChevronRight size={14} />
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* DYNAMIC VIEW CONTAINER */}
          <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
            {cart.length > 0 ? (
              
              /* LIST VIEW: WHEN CART CONTAINS ACTIVE LINE ITEMS */
              <div className="flex-1 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50/50 divide-y divide-slate-200 shadow-inner">
                {cart.map((item) => (
                  <div key={item.variantId} className="p-4 flex items-center justify-between bg-white hover:bg-slate-50 transition-colors">
                    <div className="flex-1 pr-4">
                      <h4 className="text-sm font-bold text-slate-900 tracking-wide">{item.name}</h4>
                      <p className="text-xs font-mono text-slate-500 mt-0.5">{item.sku}</p>
                      <p className="text-xs text-emerald-600 font-bold mt-1">₹{item.price.toFixed(2)} each</p>
                    </div>

                    <div className="flex items-center gap-4">
                      <div className="flex items-center border border-slate-200 rounded-xl bg-slate-50 overflow-hidden shadow-sm">
                        <button onClick={() => updateQuantity(item.variantId, -1)} className="p-2 text-slate-500 hover:bg-slate-200 hover:text-slate-900 transition-colors"><Minus size={13} /></button>
                        <span className="w-8 text-center text-xs font-bold text-slate-900 font-mono">{item.quantity}</span>
                        <button onClick={() => updateQuantity(item.variantId, 1)} className="p-2 text-slate-500 hover:bg-slate-200 hover:text-slate-900 transition-colors"><Plus size={13} /></button>
                      </div>
                      <button onClick={() => updateQuantity(item.variantId, -item.quantity)} className="p-2.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all"><Trash2 size={15} /></button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              
              /* CARD GRID VIEW: WHEN CART IS COMPLETELY EMPTY */
              <div className="flex-1 flex flex-col min-h-0 overflow-y-auto space-y-6">
                
                {/* HORIZONTAL DEPARTMENT HOTKEYS */}
                <div>
                  <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-3">Department Hot-Keys</p>
                  <div className="flex items-center gap-2.5 overflow-x-auto pb-1">
                    {['All Products', 'Kitchen & Ceramics', 'Living Room', 'Textiles & Rugs', 'Decor Accents'].map((cat, idx) => (
                      <button
                        key={cat}
                        className={`px-4 py-2 rounded-xl text-xs font-bold tracking-wide transition-all border shrink-0 ${
                          idx === 0 
                            ? 'bg-emerald-600 border-emerald-600 text-white shadow-sm' 
                            : 'bg-slate-50 border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-100'
                        }`}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                </div>

                {/* VISUAL QUICK ADD PRODUCT GRID */}
                <div className="flex-1">
                  <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-3">Popular Fast-Check Items</p>
                  <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    
                    {/* VISUAL SEEDED CARD: OBSIDIAN CERAMIC MUG */}
                    <div 
                      onClick={() => addToCart({ id: '00000000-0000-0000-0000-000000000050', sku: 'MUG-SET-6-BLK', retailPrice: 799.00, product: { name: 'Ceramic Mug Set' } })}
                      className="bg-slate-50 border border-slate-200 hover:border-emerald-300 rounded-2xl p-4 cursor-pointer transition-all hover:scale-[1.01] hover:bg-white hover:shadow-md group flex flex-col justify-between h-48 relative overflow-hidden"
                    >
                      <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-emerald-500 to-teal-500" />
                      <div className="mt-1">
                        <span className="text-[9px] font-bold uppercase tracking-widest bg-emerald-50 text-emerald-700 border border-emerald-100 px-2 py-0.5 rounded-md">Ceramics</span>
                        <h4 className="text-sm font-bold text-slate-900 mt-2.5 leading-tight group-hover:text-emerald-600 transition-colors">Ceramic Mug Set</h4>
                        <p className="text-[11px] font-mono text-slate-400 mt-0.5">MUG-SET-6-BLK</p>
                      </div>
                      <div className="flex justify-between items-center mt-4 pt-3 border-t border-slate-200">
                        <span className="text-sm font-bold text-slate-900 font-mono">₹799.00</span>
                        <span className="w-7 h-7 rounded-lg bg-white border border-slate-200 text-slate-400 group-hover:bg-emerald-600 group-hover:border-emerald-600 group-hover:text-white flex items-center justify-center transition-all shadow-sm"><Plus size={14} /></span>
                      </div>
                    </div>

                    {/* MOCK VISUAL CONTAINER 2 */}
                    <div className="bg-slate-50 border border-slate-200 opacity-60 rounded-2xl p-4 flex flex-col justify-between h-48 relative overflow-hidden">
                      <div className="mt-1">
                        <span className="text-[9px] font-bold uppercase tracking-widest bg-slate-200 text-slate-600 px-2 py-0.5 rounded-md">Furnishings</span>
                        <h4 className="text-sm font-medium text-slate-600 mt-2.5 leading-tight">Velvet Cushion Cover</h4>
                        <p className="text-[11px] font-mono text-slate-400 mt-0.5">CUSH-VLV-GRN</p>
                      </div>
                      <div className="flex justify-between items-center mt-4 pt-3 border-t border-slate-200">
                        <span className="text-sm font-semibold text-slate-600 font-mono">₹449.00</span>
                        <span className="w-7 h-7 rounded-lg bg-white border border-slate-200 text-slate-300 flex items-center justify-center shadow-sm"><Plus size={14} /></span>
                      </div>
                    </div>

                    {/* MOCK VISUAL CONTAINER 3 */}
                    <div className="bg-slate-50 border border-slate-200 opacity-60 rounded-2xl p-4 flex flex-col justify-between h-48 relative overflow-hidden">
                      <div className="mt-1">
                        <span className="text-[9px] font-bold uppercase tracking-widest bg-slate-200 text-slate-600 px-2 py-0.5 rounded-md">Textiles</span>
                        <h4 className="text-sm font-medium text-slate-600 mt-2.5 leading-tight">Woven Cotton Rug</h4>
                        <p className="text-[11px] font-mono text-slate-400 mt-0.5">RUG-CTN-WHT</p>
                      </div>
                      <div className="flex justify-between items-center mt-4 pt-3 border-t border-slate-200">
                        <span className="text-sm font-semibold text-slate-600 font-mono">₹2,499.00</span>
                        <span className="w-7 h-7 rounded-lg bg-white border border-slate-200 text-slate-300 flex items-center justify-center shadow-sm"><Plus size={14} /></span>
                      </div>
                    </div>

                    {/* MOCK VISUAL CONTAINER 4 */}
                    <div className="bg-slate-50 border border-slate-200 opacity-60 rounded-2xl p-4 flex flex-col justify-between h-48 relative overflow-hidden">
                      <div className="mt-1">
                        <span className="text-[9px] font-bold uppercase tracking-widest bg-slate-200 text-slate-600 px-2 py-0.5 rounded-md">Lighting</span>
                        <h4 className="text-sm font-medium text-slate-600 mt-2.5 leading-tight">Minimalist Desk Lamp</h4>
                        <p className="text-[11px] font-mono text-slate-400 mt-0.5">LMP-DSK-MIN</p>
                      </div>
                      <div className="flex justify-between items-center mt-4 pt-3 border-t border-slate-200">
                        <span className="text-sm font-semibold text-slate-600 font-mono">₹1,899.00</span>
                        <span className="w-7 h-7 rounded-lg bg-white border border-slate-200 text-slate-300 flex items-center justify-center shadow-sm"><Plus size={14} /></span>
                      </div>
                    </div>

                  </div>
                </div>

              </div>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: REVENUE ENGINE LEDGER PANEL */}
        <div className="w-96 bg-slate-50 border-l border-slate-200 flex flex-col overflow-hidden shrink-0 shadow-xl">
          
          {/* CUSTOMER SEARCH SECTION */}
          <div className="p-5 border-b border-slate-200 bg-white">
            <label className="block text-xs text-slate-400 font-bold uppercase tracking-wider mb-2">Customer Association</label>
            {!customer ? (
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Enter 10-digit mobile number..."
                  value={customerSearch}
                  onChange={(e) => setCustomerSearch(e.target.value)}
                  className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-3 text-xs font-mono text-slate-900 focus:outline-none focus:border-emerald-600 focus:bg-white transition-all shadow-inner"
                />
                <button onClick={handleCustomerSearch} className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-bold tracking-wide shadow-sm transition-colors">Find</button>
              </div>
            ) : (
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 relative overflow-hidden shadow-inner">
                <button onClick={() => setCustomer(null)} className="absolute top-2.5 right-2.5 text-slate-400 hover:text-slate-900 p-1 rounded-lg hover:bg-slate-200 transition-colors"><X size={13} /></button>
                <p className="text-xs font-bold text-slate-900 tracking-wide">{customer.name}</p>
                <p className="text-xs text-slate-500 font-mono mt-0.5">{customer.phone}</p>
                <div className="mt-2.5 pt-2.5 border-t border-slate-200 flex justify-between items-center text-xs">
                  <span className="text-slate-400">Loyalty Balance:</span>
                  <span className="font-bold text-amber-600 font-mono">{customer.loyaltyPoints} pts</span>
                </div>
                {customer.loyaltyPoints > 0 && loyaltyRedeem === 0 && (
                  <button
                    onClick={() => setLoyaltyRedeem(Math.min(customer.loyaltyPoints, Math.floor(total)))}
                    className="mt-2.5 w-full bg-amber-50 hover:bg-amber-100 text-amber-800 font-bold text-[11px] py-2 rounded-xl transition-all border border-amber-200 tracking-wide shadow-sm"
                  >
                    Redeem Balance Points
                  </button>
                )}
              </div>
            )}
            {errorMessage && <p className="text-xs text-rose-600 font-medium mt-2 flex items-center gap-1"><AlertCircle size={12} /> {errorMessage}</p>}
          </div>

          {/* SETTLEMENT OPERATIONS SELECTOR */}
          <div className="p-5 border-b border-slate-200 bg-white/60">
            <label className="block text-xs text-slate-400 font-bold uppercase tracking-wider mb-2.5">Settlement Mode</label>
            <div className="grid grid-cols-3 gap-2">
              {(['CASH', 'CARD', 'UPI'] as const).map((method) => (
                <button
                  key={method}
                  onClick={() => setPaymentMethod(method)}
                  className={`py-3.5 rounded-xl flex flex-col items-center justify-center gap-1.5 font-bold transition-all border ${
                    paymentMethod === method
                      ? 'bg-emerald-600 border-emerald-600 text-white shadow-md scale-[1.02]'
                      : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300 hover:bg-slate-50 shadow-sm'
                  }`}
                >
                  {method === 'CASH' && <Banknote size={16} />}
                  {method === 'CARD' && <CreditCard size={16} />}
                  {method === 'UPI' && <Smartphone size={16} />}
                  <span className="text-[10px] tracking-widest font-black">{method}</span>
                </button>
              ))}
            </div>
          </div>

          {/* FINAL TRANSACTION RECEIPT OUTLINE SUMMARY */}
          <div className="flex-1 p-5 flex flex-col justify-end bg-white">
            <div className="space-y-2.5 text-xs text-slate-500 mb-5 border-b border-slate-100 pb-5">
              <div className="flex justify-between"><span>Subtotal Gross</span><span className="font-mono text-slate-800 font-semibold">₹{subtotal.toFixed(2)}</span></div>
              <div className="flex justify-between"><span>Central GST (18%)</span><span className="font-mono text-slate-800 font-semibold">₹{gst.toFixed(2)}</span></div>
              {loyaltyRedeem > 0 && (
                <div className="flex justify-between text-amber-700 font-bold bg-amber-50 px-2 py-1 rounded-lg border border-amber-100">
                  <span>Points Rebate</span>
                  <span className="font-mono">-₹{discount.toFixed(2)}</span>
                </div>
              )}
            </div>

            <div className="flex justify-between items-baseline mb-6">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">NET AMOUNT</span>
              <span className="text-3xl font-black text-slate-900 font-mono tracking-tight">₹{total.toFixed(2)}</span>
            </div>

            <div className="flex gap-2">
              <button
                onClick={clearCart}
                disabled={cart.length === 0}
                className="p-3.5 bg-slate-50 hover:bg-slate-100 text-slate-400 hover:text-slate-800 rounded-xl transition-all border border-slate-200 disabled:opacity-40 disabled:cursor-not-allowed shadow-sm"
              >
                <Trash2 size={16} />
              </button>
              <button
                onClick={processCheckout}
                disabled={cart.length === 0 || isProcessing}
                className="flex-1 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-100 text-white disabled:text-slate-400 font-bold text-sm py-3.5 px-4 rounded-xl shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 disabled:cursor-not-allowed"
              >
                {isProcessing ? <RefreshCw size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}
                {isProcessing ? 'AUTHORIZING...' : 'COLLECT PAYMENT'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* MODAL VIEW: INVOICE PRINT OUT DIALOG OVERLAY */}
      {showOrderComplete && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fadeIn">
          <div className="bg-white border border-slate-200 w-full max-w-md rounded-2xl p-6 shadow-2xl relative animate-scaleIn">
            <div className="w-12 h-12 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto mb-4 border border-emerald-100">
              <CheckCircle2 size={24} />
            </div>
            <h3 className="text-lg font-bold text-center text-slate-900 tracking-wide">Checkout Authorized Successfully</h3>
            <p className="text-center text-xs text-slate-500 mt-1">Transaction written to ledger pipeline.</p>

            <div className="my-5 p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2 text-xs font-mono shadow-inner">
              <div className="flex justify-between"><span className="text-slate-400">Invoice Registry</span><span className="text-slate-800 font-bold">#{showOrderComplete.orderNumber}</span></div>
              <div className="flex justify-between"><span className="text-slate-400">Method Code</span><span className="text-slate-800 font-semibold">{showOrderComplete.paymentMethod}</span></div>
              <div className="flex justify-between border-t border-slate-200 pt-2 font-sans text-sm"><span className="text-slate-500 font-bold">Total Gross Paid</span><span className="text-emerald-600 font-black">₹{showOrderComplete.total}</span></div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => window.print()}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-slate-100 text-sm font-bold hover:bg-slate-200 text-slate-700 border border-slate-200 shadow-sm transition-all"
              >
                <Printer size={15} /> Print Receipt
              </button>
              <button
                onClick={() => setShowOrderComplete(null)}
                className="flex-1 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-bold hover:bg-emerald-700 shadow-md transition-all"
              >
                Next Customer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* HIDDEN RAW-MEDIA PRINT DISPATCH CONTAINERS */}
      {showOrderComplete && (
        <Receipt
          order={showOrderComplete}
          cart={receiptCartRef.current}
        />
      )}
    </div>
  );
}