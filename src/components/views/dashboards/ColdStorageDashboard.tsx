'use client';

import React from 'react';
import { useMarketplace } from '../../../lib/marketplace/MarketplaceContext';

export function ColdStorageDashboard() {
  const {
    currentPersona,
    storageUnits,
    setActiveTab,
    activeRole,
    logisticsShipments,
    isLoadingLogistics,
    refreshLogistics,
    isDatabaseStorageSchemaInstalled,
    databaseStorageError,
  } = useMarketplace();

  // Find facility operated by current cold storage persona
  const myFacility = storageUnits.find(
    (u) => u.operatorName.includes('Venkatesh') || u.district === currentPersona.district
  ) || storageUnits[0];

  const totalCapacityMt = myFacility.totalCapacityMt;
  const availableCapacityMt = myFacility.availableCapacityMt;
  const occupiedCapacityMt = totalCapacityMt - availableCapacityMt;
  const occupancyPercent = Math.round((occupiedCapacityMt / totalCapacityMt) * 100);

  // Chamber Telemetry Simulation (Hardware Simulator Model)
  const chamberTelemetry = [
    {
      chamberId: 'Chamber 1',
      temp: '3.2°C',
      humidity: '92%',
      commodity: 'Tomato (Hybrid Roma)',
      storedMt: 65,
      capacityMt: 80,
      status: 'Optimal Chilled',
    },
    {
      chamberId: 'Chamber 2',
      temp: '8.5°C',
      humidity: '85%',
      commodity: 'Potato (Kufri Chipsona)',
      storedMt: 95,
      capacityMt: 100,
      status: 'Curing Ventilation',
    },
    {
      chamberId: 'Chamber 3',
      temp: '4.0°C',
      humidity: '90%',
      commodity: 'Capsicum & Greens',
      storedMt: 45,
      capacityMt: 70,
      status: 'Optimal Chilled',
    },
    {
      chamberId: 'Chamber 4',
      temp: '11.0°C',
      humidity: '70%',
      commodity: 'Dry Cured Onion',
      storedMt: 85,
      capacityMt: 100,
      status: 'Dry Storage',
    },
    {
      chamberId: 'Chamber 5',
      temp: '2.0°C',
      humidity: '95%',
      commodity: 'Table Grapes (Export)',
      storedMt: 70,
      capacityMt: 75,
      status: 'Controlled Atmos',
    },
    {
      chamberId: 'Chamber 6',
      temp: '4.5°C',
      humidity: '88%',
      commodity: 'Available for Booking',
      storedMt: 0,
      capacityMt: 75,
      status: 'Empty / Sanitized',
    },
  ];

  // Inbound & Outbound Batches (Demo Sandbox Fallback)
  const demoBatches = [
    {
      id: 'BATCH-IN-401',
      type: 'inbound',
      crop: 'Tomato — 5,000 kg',
      depositor: 'Ramesh Kumar (Kolar FPO)',
      scheduledTime: 'Today 14:00 IST',
      bay: 'Bay-2 (Chilled Intake)',
      status: 'Weighbridge Scheduled',
    },
    {
      id: 'BATCH-OUT-402',
      type: 'outbound',
      crop: 'Potato — 6,000 kg',
      consignee: 'Britannia & AgroPure Foods',
      scheduledTime: 'Today 16:30 IST',
      bay: 'Bay-1 (Reefer Loading)',
      status: 'Dispatched to VRL Logistics',
    },
    {
      id: 'BATCH-IN-403',
      type: 'inbound',
      crop: 'Grapes — 8,000 kg',
      depositor: 'Chikkaballapur Vineyard Union',
      scheduledTime: 'Tomorrow 09:00 IST',
      bay: 'Bay-3 (Pre-Cooling)',
      status: 'Booking Confirmed',
    },
  ];

  return (
    <div className="space-y-6" data-testid="dashboard-cold-storage">
      {/* Schema Notice or Database Error Banner */}
      {databaseStorageError && (
        <div className="p-4 rounded-2xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-xs text-red-700 dark:text-red-300 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <span className="text-base">⚠️</span>
            <span><strong>Storage Database Error:</strong> {databaseStorageError}</span>
          </div>
          <button
            type="button"
            onClick={() => refreshLogistics()}
            className="px-2.5 py-1 rounded bg-red-600 text-white font-semibold hover:bg-red-700 cursor-pointer"
          >
            Retry
          </button>
        </div>
      )}

      {!isDatabaseStorageSchemaInstalled && (
        <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-xs text-amber-800 dark:text-amber-300 space-y-1">
          <div className="flex items-center space-x-2 font-bold">
            <span className="text-base">ℹ️</span>
            <span>Database Cold Storage Tables Pending Admin Review</span>
          </div>
          <p className="leading-relaxed">
            The live database does not currently have the <code className="font-mono bg-amber-100 dark:bg-amber-900/60 px-1 py-0.5 rounded">cold_storage_facilities</code> table installed. All live logistics consignments are safely queried from the active <code className="font-mono bg-amber-100 dark:bg-amber-900/60 px-1 py-0.5 rounded">reservations_orders</code> table. Review <code className="font-mono font-semibold">docs/hotfix-phase3-cold-storage-logistics.sql</code> to deploy cold storage schema objects.
          </p>
        </div>
      )}

      {/* Role Banner Card */}
      <div className="bg-gradient-to-r from-cyan-700 via-sky-800 to-slate-900 rounded-3xl p-6 sm:p-8 text-white shadow-xl relative overflow-hidden">
        <div className="absolute right-0 top-0 bottom-0 w-1/3 opacity-10 pointer-events-none flex items-center justify-center text-9xl">
          ❄️
        </div>
        <div className="relative z-10 max-w-2xl">
          <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-white/20 backdrop-blur-md text-xs font-semibold mb-3">
            <span>{currentPersona.avatarEmoji}</span>
            <span>Cold Chain Logistics &amp; Storage Hub</span>
            <span>•</span>
            <span className="text-cyan-200">{myFacility.facilityName}</span>
          </div>

          <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
            Cold Storage Capacity &amp; Fleet Logistics Hub
          </h2>
          <p className="text-sm text-cyan-100 mt-2 leading-relaxed">
            Monitor real-time multi-chamber telemetry (temperature, relative humidity, ethylene absorption), issue WDRA-compliant electronic warehouse receipts (e-NWR), and coordinate temperature-controlled dispatch for factory and retail contracts.
          </p>

          <div className="flex flex-wrap items-center gap-3 mt-6">
            <button
              type="button"
              onClick={() => setActiveTab('storage')}
              className="px-4 py-2.5 rounded-xl text-xs font-bold bg-white text-cyan-900 hover:bg-cyan-50 shadow-md transition-all flex items-center space-x-1.5 cursor-pointer"
            >
              <span>❄️</span>
              <span>Manage Storage Facility Capacity</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('orders')}
              className="px-4 py-2.5 rounded-xl text-xs font-bold bg-cyan-900/90 hover:bg-cyan-900 text-white border border-cyan-400/30 transition-all flex items-center space-x-1.5 cursor-pointer"
            >
              <span>🚚</span>
              <span>Inbound / Outbound Batches</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('marketplace')}
              className="px-4 py-2.5 rounded-xl text-xs font-bold bg-slate-900/80 hover:bg-slate-900 text-cyan-200 border border-slate-700 transition-all cursor-pointer"
            >
              🛒 View Produce Available for Cold Buffering
            </button>
          </div>
        </div>
      </div>

      {/* KPI Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Facility Occupancy */}
        <div className="bg-white dark:bg-zinc-900 p-5 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-xs">
          <div className="flex items-center justify-between text-zinc-500 dark:text-zinc-400 text-xs">
            <span className="font-semibold uppercase tracking-wider">Storage Capacity Occupancy</span>
            <span className="text-lg">📊</span>
          </div>
          <div className="text-2xl font-black text-zinc-900 dark:text-zinc-50 mt-2 font-mono">
            {occupancyPercent}%{' '}
            <span className="text-sm font-normal text-zinc-500 font-sans">
              ({occupiedCapacityMt} / {totalCapacityMt} MT)
            </span>
          </div>
          <div className="w-full bg-zinc-100 dark:bg-zinc-800 h-2 rounded-full mt-2.5 overflow-hidden">
            <div
              className="bg-cyan-600 h-full rounded-full transition-all"
              style={{ width: `${occupancyPercent}%` }}
            />
          </div>
          <div className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-1.5 flex items-center justify-between">
            <span>Capacity in Kolar Hub</span>
            <span className="text-cyan-600 font-bold">{availableCapacityMt} MT Available</span>
          </div>
        </div>

        {/* Card 2: Available Capacity */}
        <div className="bg-white dark:bg-zinc-900 p-5 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-xs">
          <div className="flex items-center justify-between text-zinc-500 dark:text-zinc-400 text-xs">
            <span className="font-semibold uppercase tracking-wider">Available for Booking</span>
            <span className="text-lg">❄️</span>
          </div>
          <div className="text-2xl font-black text-cyan-700 dark:text-cyan-400 mt-2 font-mono">
            {availableCapacityMt} MT
          </div>
          <div className="text-[11px] text-zinc-500 mt-1">
            Chamber 6 ready for fresh tomato/perishables intake
          </div>
        </div>

        {/* Card 3: Active Cold Chambers */}
        <div className="bg-white dark:bg-zinc-900 p-5 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-xs">
          <div className="flex items-center justify-between text-zinc-500 dark:text-zinc-400 text-xs">
            <span className="font-semibold uppercase tracking-wider">Multi-Chambers Active</span>
            <span className="text-lg">🌡️</span>
          </div>
          <div className="text-2xl font-black text-zinc-900 dark:text-zinc-50 mt-2 font-mono">
            6 / 6 <span className="text-sm font-normal text-zinc-500 font-sans">chambers</span>
          </div>
          <div className="text-[11px] text-emerald-600 dark:text-emerald-400 mt-1">
            100% telemetry sensors online &amp; calibrated
          </div>
        </div>

        {/* Card 4: Daily Warehouse Revenue */}
        <div className="bg-white dark:bg-zinc-900 p-5 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-xs">
          <div className="flex items-center justify-between text-zinc-500 dark:text-zinc-400 text-xs">
            <span className="font-semibold uppercase tracking-wider">Monthly Storage Revenue (Sim.)</span>
            <span className="text-lg">💳</span>
          </div>
          <div className="text-2xl font-black text-cyan-700 dark:text-cyan-400 mt-2 font-mono">
            ₹1,82,400
          </div>
          <div className="text-[11px] text-zinc-500 mt-1 flex items-center justify-between">
            <span>Rate: ₹{myFacility.dailyRatePerQuintal}/quintal/day</span>
            <button
              type="button"
              onClick={() => setActiveTab('payments')}
              className="text-cyan-600 dark:text-cyan-400 font-semibold hover:underline cursor-pointer"
            >
              View Payments →
            </button>
          </div>
        </div>
      </div>

      {/* Multi-Chamber Real-Time Telemetry Matrix */}
      <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-5 shadow-xs space-y-4">
        <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-3">
          <div>
            <h3 className="font-bold text-sm text-zinc-900 dark:text-zinc-100 flex items-center space-x-2">
              <span>🌡️</span>
              <span>Chamber Atmosphere &amp; Sensor Telemetry (Unit A — Kolar Hub)</span>
            </h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
              Automated cooling loops, humidity controls, and WDRA compliance logging
            </p>
          </div>
          <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-cyan-100 dark:bg-cyan-950 text-cyan-800 dark:text-cyan-300 font-semibold">
            Telemetry: Hardware Simulator Model
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {chamberTelemetry.map((ch) => (
            <div
              key={ch.chamberId}
              className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-800/40 space-y-2.5"
            >
              <div className="flex items-center justify-between">
                <span className="font-bold text-sm text-zinc-900 dark:text-zinc-100">{ch.chamberId}</span>
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                  ch.status === 'Optimal Chilled'
                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                    : ch.status === 'Empty / Sanitized'
                    ? 'bg-cyan-100 text-cyan-800 dark:bg-cyan-950 dark:text-cyan-300'
                    : 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300'
                }`}>
                  {ch.status}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs py-1 bg-white dark:bg-zinc-900 p-2.5 rounded-lg border border-zinc-200/50 dark:border-zinc-700/50">
                <div>
                  <span className="text-[10px] text-zinc-400 block">Temperature</span>
                  <span className="font-bold font-mono text-cyan-700 dark:text-cyan-400 text-sm">{ch.temp}</span>
                </div>
                <div>
                  <span className="text-[10px] text-zinc-400 block">Humidity</span>
                  <span className="font-bold font-mono text-zinc-800 dark:text-zinc-200 text-sm">{ch.humidity}</span>
                </div>
              </div>

              <div className="text-xs">
                <span className="text-[10px] text-zinc-400 block">Commodity Stored:</span>
                <span className="font-bold text-zinc-800 dark:text-zinc-200">{ch.commodity}</span>
              </div>

              <div className="pt-1 border-t border-zinc-200/50 dark:border-zinc-700/50 flex justify-between text-[11px] text-zinc-500">
                <span>Occupied: {ch.storedMt} MT</span>
                <span>Max: {ch.capacityMt} MT</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 2-Column Section: Inbound/Outbound Logistics Batches & Warehouse Compliance */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Scheduled Batches & Loading Bays */}
        <div className="lg:col-span-7 bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-3">
            <div>
              <h3 className="font-bold text-sm text-zinc-900 dark:text-zinc-100 flex items-center space-x-2">
                <span>🚚</span>
                <span>Loading Bay Schedule &amp; Inbound/Outbound Batches</span>
              </h3>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                {activeRole === 'authenticated'
                  ? 'Real-time database consignment tracking from live produce reservations'
                  : 'Refrigerated vehicle gate appointments and cross-docking intake (Demo Simulation)'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setActiveTab('orders')}
              className="text-xs font-semibold text-cyan-600 dark:text-cyan-400 hover:underline cursor-pointer"
            >
              View Orders Pipeline →
            </button>
          </div>

          {activeRole === 'authenticated' ? (
            isLoadingLogistics ? (
              <div className="p-8 text-center text-xs text-zinc-400 space-y-2">
                <div className="animate-spin text-2xl mx-auto">↻</div>
                <div>Loading live consignments from PostgreSQL...</div>
              </div>
            ) : logisticsShipments.length === 0 ? (
              <div className="p-6 rounded-xl border border-dashed border-zinc-300 dark:border-zinc-700 text-center text-xs text-zinc-500 space-y-2">
                <div className="text-2xl">📦</div>
                <div className="font-semibold text-zinc-700 dark:text-zinc-300">No Active Live Consignments</div>
                <p className="max-w-xs mx-auto text-zinc-400">
                  When produce orders are accepted and scheduled for dispatch, live consignment milestones will populate this loading bay automatically.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {logisticsShipments.map((s) => (
                  <div
                    key={s.orderId}
                    className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-800/40 space-y-2"
                  >
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center space-x-2">
                        <span className="font-mono font-bold text-zinc-900 dark:text-zinc-100">{s.orderNumber}</span>
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700">
                          🟢 Live Consignment
                        </span>
                      </div>
                      <span className="text-[10px] font-bold text-zinc-500 capitalize">
                        {s.escrowStatus.replace(/_/g, ' ')}
                      </span>
                    </div>

                    <div className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                      {s.commodity} ({s.variety}) — {s.lockedQuantityKg.toLocaleString('en-IN')} kg
                    </div>

                    <div className="text-xs text-zinc-500 flex flex-wrap items-center justify-between pt-1 border-t border-zinc-200/50 dark:border-zinc-700/50 gap-2">
                      <span>Counterparties: {s.sellerName} → {s.buyerName}</span>
                      <span className="font-semibold text-cyan-700 dark:text-cyan-400">
                        {s.transporterName || 'Pending Transporter'}
                      </span>
                    </div>

                    <div className="text-[11px] text-zinc-500 flex items-center justify-between pt-1">
                      <span>Transit Telemetry:</span>
                      <span className="font-mono font-bold text-cyan-700 dark:text-cyan-400">
                        {s.transitTemperature}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )
          ) : (
            <div className="space-y-3">
              {demoBatches.map((b) => (
                <div
                  key={b.id}
                  className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-800/40 space-y-2"
                >
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center space-x-2">
                      <span className="font-mono font-bold text-zinc-900 dark:text-zinc-100">{b.id}</span>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                        b.type === 'inbound'
                          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                          : 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300'
                      }`}>
                        {b.type === 'inbound' ? '↓ Inbound Receiving' : '↑ Outbound Dispatch'}
                      </span>
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border border-amber-300">
                        🎭 Demo Batch
                      </span>
                    </div>
                    <span className="text-[10px] font-bold text-zinc-500">{b.status}</span>
                  </div>

                  <div className="text-sm font-bold text-zinc-900 dark:text-zinc-100">{b.crop}</div>
                  <div className="text-xs text-zinc-500 flex items-center justify-between pt-1 border-t border-zinc-200/50 dark:border-zinc-700/50">
                    <span>Party: {b.depositor || b.consignee}</span>
                    <span className="font-semibold text-cyan-700 dark:text-cyan-400">{b.bay}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right Column: WDRA Standards & Logistics Dispatch */}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-5 shadow-xs space-y-3">
            <h3 className="font-bold text-sm text-zinc-900 dark:text-zinc-100 flex items-center space-x-2">
              <span>📜</span>
              <span>WDRA Electronic Warehouse Receipts</span>
            </h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Negotiable warehouse receipts issued on AgriPrice enable farmers to pledge stored produce for bank working capital loans without distress-selling during market dips.
            </p>
            <div className="space-y-2 pt-2">
              <div className="p-3 rounded-xl bg-cyan-50/70 dark:bg-cyan-950/40 border border-cyan-200 dark:border-cyan-800 text-xs flex justify-between items-center">
                <div>
                  <div className="font-bold text-cyan-950 dark:text-cyan-200">WDRA Reg: KA-WDRA-2024-889</div>
                  <div className="text-[10px] text-cyan-800 dark:text-cyan-300 mt-0.5">Insurance Coverage: ₹2.50 Cr (National Insurance)</div>
                </div>
                <span className="px-2 py-1 rounded bg-cyan-600 text-white font-bold text-[10px]">Verified</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
