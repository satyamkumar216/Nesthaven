'use client';

import React from 'react';
import { 
  ArrowUpRight, ArrowDownRight, Package, ShoppingBag, 
  Users, AlertCircle, RefreshCw, TrendingUp,
  MapPin
} from 'lucide-react';

export default function DashboardOverview() {
  const stats = [
    { name: 'Total Revenue (Monthly)', value: '₹4,82,900', change: '+12.3%', up: true, icon: ShoppingBag, color: 'text-emerald-600 bg-emerald-50' },
    { name: 'Omni-channel Orders', value: '1,240', change: '+8.1%', up: true, icon: Package, color: 'text-blue-600 bg-blue-50' },
    { name: 'CRM Active Members', value: '3,842', change: '+22.4%', up: true, icon: Users, color: 'text-indigo-600 bg-indigo-50' },
    { name: 'Active Stock Anomaly', value: '3 Items', change: 'Action Required', up: false, icon: AlertCircle, color: 'text-rose-600 bg-rose-50' },
  ];

  const lowStockItems = [
    { id: '1', name: 'Ceramic Mug Set (Black)', sku: 'MUG-SET-6-BLK', current: 3, minRequired: 15, location: 'Zone A → Rack R1' },
    { id: '2', name: 'Minimalist Desk Lamp', sku: 'LMP-DSK-MIN', current: 1, minRequired: 5, location: 'Zone C → Rack L4' },
  ];

  return (
    <div className="space-y-6 animate-fadeIn">
      
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-6 rounded-xl shadow-sm border border-slate-100">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">Executive Control Centre</h2>
          <p className="text-sm text-slate-500 mt-1">Monitoring retail transaction pipelines and synchronized channels live.</p>
        </div>
        <button 
          onClick={() => window.location.reload()}
          className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg text-sm font-semibold text-slate-700 transition-all shadow-sm"
        >
          <RefreshCw size={14} className="text-slate-400" /> Sync Engine
        </button>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((item) => {
          const Icon = item.icon;
          return (
            <div key={item.name} className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 flex flex-col justify-between h-40 hover:shadow-md transition-shadow">
              <div className="flex justify-between items-start">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider max-w-[70%] leading-relaxed">
                  {item.name}
                </span>
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${item.color}`}>
                  <Icon size={18} />
                </div>
              </div>
              <div className="flex justify-between items-end mt-4">
                <span className="text-3xl font-black text-slate-900 tracking-tight">{item.value}</span>
                <span className={`text-xs font-bold px-2 py-1 rounded-md flex items-center gap-1 ${
                  item.up ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
                }`}>
                  {item.up ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                  {item.change}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Main Workspace Bottom Half */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Alerts List */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-6 lg:col-span-2 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 pb-4 mb-4 border-b border-slate-100">
              <div className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
              <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">Critical Inventory Depletion</h3>
            </div>
            <div className="divide-y divide-slate-50">
              {lowStockItems.map((item) => (
                <div key={item.id} className="py-4 flex items-center justify-between first:pt-0 last:pb-0 group">
                  <div>
                    <h4 className="text-sm font-bold text-slate-900">{item.name}</h4>
                    <div className="flex items-center gap-3 mt-1.5">
                      <span className="text-xs text-slate-500 font-mono bg-slate-100 px-2 py-0.5 rounded">{item.sku}</span>
                      <span className="text-xs text-slate-400 flex items-center gap-1">
                        <MapPin size={12} /> {item.location}
                      </span>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-xs font-bold text-rose-700 bg-rose-50 px-3 py-1.5 rounded-lg border border-rose-100">
                      {item.current} left / req. {item.minRequired}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="pt-4 mt-4 text-right">
            <button className="text-sm text-emerald-600 font-semibold hover:text-emerald-700 transition-colors">
              Generate Restock Manifest →
            </button>
          </div>
        </div>

        {/* Charts / Progress */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 pb-4 mb-4 border-b border-slate-100">
              <TrendingUp size={16} className="text-emerald-600" />
              <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">Channel Performance</h3>
            </div>
            <div className="space-y-6 py-2">
              <div>
                <div className="flex justify-between text-sm font-semibold text-slate-700 mb-2">
                  <span>Physical POS Outlets</span>
                  <span className="text-slate-900">68%</span>
                </div>
                <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
                  <div className="bg-emerald-500 h-full rounded-full" style={{ width: '68%' }} />
                </div>
              </div>
              <div>
                <div className="flex justify-between text-sm font-semibold text-slate-700 mb-2">
                  <span>Shopify E-Commerce Cloud</span>
                  <span className="text-slate-900">32%</span>
                </div>
                <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
                  <div className="bg-blue-500 h-full rounded-full" style={{ width: '32%' }} />
                </div>
              </div>
            </div>
          </div>
          <p className="text-xs text-slate-400 leading-relaxed pt-4 border-t border-slate-100 mt-6">
            Shopify percentages sync directly via live reverse-proxy ngrok webhook tunnels.
          </p>
        </div>
      </div>
    </div>
  );
}