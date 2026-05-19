'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard, Package, TrendingUp, AlertTriangle, 
  Layers, BarChart3, Users, Settings, Bell, ChevronLeft, ChevronRight,
  LogOut, ShieldCheck, ClipboardList, Printer
} from 'lucide-react';

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [alertsCount, setAlertsCount] = useState(3); // Mock low-stock/anomaly alerts counter

  // Premium Side-Navigation Definition with Extra Enterprise Perks
  const navigationItems = [
    { name: 'Core Overview', href: '/dashboard', icon: LayoutDashboard },
    { name: 'Demand Forecasting', href: '/dashboard/forecasting', icon: TrendingUp, badge: 'AI' },
    { name: 'Inventory & Mugs', href: '/dashboard/inventory', icon: Package },
    { name: 'Scrap & Damages', href: '/dashboard/scrap', icon: AlertTriangle },
    { name: 'P&L Reports', href: '/dashboard/finance', icon: BarChart3 },
    { name: 'Barcode Batch Print', href: '/dashboard/barcodes', icon: Printer },
    { name: 'Staff Audit Logs', href: '/dashboard/audit', icon: ClipboardList },
    { name: 'System Settings', href: '/dashboard/settings', icon: Settings },
  ];

  return (
    <div className="h-screen w-screen bg-slate-50 flex overflow-hidden font-sans text-slate-800 antialiased select-none">
      
      {/* ─── SIDEBAR NAVIGATION ELEMENT ─── */}
      <aside 
        className={`h-full bg-white border-r border-slate-200 flex flex-col justify-between transition-all duration-300 shadow-sm z-20 ${
          sidebarOpen ? 'w-64' : 'w-20'
        }`}
      >
        {/* Upper Segment: Brand & Links */}
        <div className="flex flex-col min-h-0 flex-1">
          {/* Logo Header Header */}
          <div className="h-16 border-b border-slate-200 px-5 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-3 overflow-hidden">
              <div className="w-8 h-8 rounded-xl bg-emerald-600 flex items-center justify-center shrink-0 shadow-sm shadow-emerald-500/20">
                <ShieldCheck size={16} className="text-white" />
              </div>
              {sidebarOpen && (
                <span className="font-black text-base tracking-tight text-slate-900 whitespace-nowrap">
                  NestHaven <span className="text-emerald-600 font-normal">Hub</span>
                </span>
              )}
            </div>
            
            {/* Toggle Arrow Key */}
            <button 
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="p-1.5 rounded-lg bg-slate-50 border border-slate-200 hover:bg-slate-100 text-slate-500 transition-colors hidden md:block"
            >
              {sidebarOpen ? <ChevronLeft size={14} /> : <ChevronRight size={14} />}
            </button>
          </div>

          {/* Navigation Route Map Iteration */}
          <nav className="flex-1 overflow-y-auto p-4 space-y-1.5 scrollbar-none">
            {navigationItems.map((item) => {
              const isActive = pathname === item.href;
              const Icon = item.icon;
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className={`w-full flex items-center justify-between p-3 rounded-xl text-xs font-bold tracking-wide transition-all group ${
                    isActive 
                      ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/10' 
                      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 border border-transparent hover:border-slate-100'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Icon size={16} className={`shrink-0 ${isActive ? 'text-white' : 'text-slate-400 group-hover:text-slate-700'}`} />
                    {sidebarOpen && <span className="truncate">{item.name}</span>}
                  </div>
                  {sidebarOpen && item.badge && (
                    <span className="text-[9px] font-black tracking-widest bg-amber-500 text-slate-950 px-1.5 py-0.5 rounded-md shadow-sm">
                      {item.badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Lower Segment: Active Session Profile */}
        <div className="p-4 border-t border-slate-200 bg-slate-50/50 shrink-0">
          <div className="flex items-center justify-between overflow-hidden">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-full bg-slate-200 border border-slate-300 flex items-center justify-center text-slate-600 shrink-0 font-bold text-sm shadow-sm">
                SK
              </div>
              {sidebarOpen && (
                <div className="min-w-0">
                  <p className="text-xs font-bold text-slate-900 truncate">Satyam Kumar</p>
                  <p className="text-[10px] text-slate-400 font-medium font-mono truncate">Sr. Administrator</p>
                </div>
              )}
            </div>
            {sidebarOpen && (
              <Link href="/api/auth/logout" className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all">
                <LogOut size={15} />
              </Link>
            )}
          </div>
        </div>
      </aside>

      {/* ─── CORE VIEWPORT LAYER CONTROLLER ─── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        
        {/* Top Control Bar Navbar */}
        <header className="h-16 bg-white border-b border-slate-200 px-8 flex items-center justify-between shrink-0 shadow-sm z-10">
          <div>
            <h1 className="text-sm font-bold text-slate-900 tracking-wide uppercase">
              Management Infrastructure Terminal
            </h1>
          </div>

          <div className="flex items-center gap-4">
            {/* Real-time System Notifications Bell Container */}
            <button className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 hover:bg-slate-100 text-slate-500 hover:text-slate-800 transition-all relative shadow-sm">
              <Bell size={15} />
              {alertsCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-rose-600 text-white rounded-full text-[9px] font-black flex items-center justify-center animate-pulse shadow-sm">
                  {alertsCount}
                </span>
              )}
            </button>
            
            <Link
              href="/pos"
              className="text-xs bg-slate-900 hover:bg-slate-800 text-white font-bold px-4 py-2 rounded-xl shadow-md transition-all flex items-center gap-1.5 border border-slate-800"
            >
              Open Active POS
            </Link>
          </div>
        </header>

        {/* Live Child Sub-Screen Dashboard Pages Window Render Area */}
        <main className="flex-1 overflow-y-auto p-8 bg-slate-50/50 min-h-0">
          {children}
        </main>
      </div>
    </div>
  );
}