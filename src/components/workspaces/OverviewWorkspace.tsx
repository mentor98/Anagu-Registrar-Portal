import {
  ArrowRight,
  CheckCircle2,
  Coins,
  Compass,
  FileWarning,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';
import { formatDateTime, formatNumber, truncateAddress } from '../../lib/api';
import { CONTRACT_ADDRESSES, POLYGON_AMOY_EXPLORER } from '../../lib/contracts';
import { StatusText } from '../StatusText';
import type {
  AuditLog,
  BlockchainStatus,
  ParcelRecord,
  RegistrarTab,
  WalletOnChainInfo,
} from '../../types/registrar';

interface OverviewWorkspaceProps {
  stats: {
    pendingApplications: number;
    gisChecksToday: number;
    verifiedParcels: number;
    disputedParcels: number;
    governorConsentPending: number;
    openDisputeTickets: number;
    anaguFeesCollectedDb: number;
    governorConsentThresholdUsd: number;
  };
  pendingQueue: ParcelRecord[];
  recentActivity: AuditLog[];
  blockchainStatus: BlockchainStatus | null;
  walletAddress: string | null;
  walletInfo: WalletOnChainInfo | null;
  loading: boolean;
  onRefresh: () => void;
  onOpenParcel: (parcelId: string, targetTab: RegistrarTab) => void;
}

export function OverviewWorkspace({
  stats,
  pendingQueue,
  recentActivity,
  blockchainStatus,
  walletAddress,
  walletInfo,
  loading,
  onRefresh,
  onOpenParcel,
}: OverviewWorkspaceProps) {
  const protocolCollected = blockchainStatus
    ? `${formatNumber(blockchainStatus.totalFeesCollectedFormatted, 2)} ANAGU`
    : `${formatNumber(stats.anaguFeesCollectedDb, 2)} ANAGU`;

  return (
    <div className="space-y-6">
      {/* KPI Strip */}
      <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="rounded-2xl bg-white border border-slate-200 shadow-sm p-5">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
            <span>Pending Applications</span>
            <FileWarning className="w-4 h-4 text-amber-600" />
          </div>
          <div className="mt-2 font-display text-2xl font-bold text-slate-900 font-mono-tabular">
            {loading ? '—' : formatNumber(stats.pendingApplications, 0)}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            {stats.governorConsentPending} awaiting Governor Consent
          </div>
        </div>

        <div className="rounded-2xl bg-white border border-slate-200 shadow-sm p-5">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
            <span>GIS Checks Run Today</span>
            <Compass className="w-4 h-4 text-emerald-700" />
          </div>
          <div className="mt-2 font-display text-2xl font-bold text-slate-900 font-mono-tabular">
            {loading ? '—' : formatNumber(stats.gisChecksToday, 0)}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            PostGIS 0.5m overlap buffer
          </div>
        </div>

        <div className="rounded-2xl bg-white border border-slate-200 shadow-sm p-5">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
            <span>Verified Parcels</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-700" />
          </div>
          <div className="mt-2 font-display text-2xl font-bold text-slate-900 font-mono-tabular">
            {loading ? '—' : formatNumber(stats.verifiedParcels, 0)}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            {blockchainStatus ? `${blockchainStatus.titlesIssued} titles minted on-chain` : `${stats.disputedParcels} disputed locks`}
          </div>
        </div>

        <div className="rounded-2xl bg-white border border-slate-200 shadow-sm p-5">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
            <span>Protocol Fees Collected</span>
            <Coins className="w-4 h-4 text-emerald-700" />
          </div>
          <div className="mt-2 font-display text-2xl font-bold text-emerald-700 font-mono-tabular">
            {protocolCollected}
          </div>
          <div className="mt-1 text-xs text-slate-500 font-mono-tabular">
            {blockchainStatus
              ? `Reg: ${blockchainStatus.registrationFeeFormatted} · Xfer: ${blockchainStatus.transferFeeFormatted} ANAGU`
              : 'Polygon Amoy LandRegistry'}
          </div>
        </div>
      </section>

      {/* Connected Wallet & On-Chain Contract Summary */}
      <section className="rounded-2xl bg-[#FAFDF8] border border-slate-200 shadow-sm p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="text-xs font-semibold text-slate-900 flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-700" />
            <span>Registrar Wallet &amp; Polygon Amoy Registry Status</span>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600">
            <span className="font-mono-tabular">
              Wallet: {walletAddress ? truncateAddress(walletAddress, 8, 6) : 'Not connected'}
            </span>
            <span className="text-slate-300" aria-hidden="true">·</span>
            <span className="font-mono-tabular text-emerald-700 font-semibold">
              {walletInfo ? `${walletInfo.anaguBalanceFormatted} ANAGU` : '0.00 ANAGU'}
            </span>
            <span className="text-slate-300" aria-hidden="true">·</span>
            <span className="font-mono-tabular">
              {walletInfo ? `${walletInfo.polBalanceFormatted} POL` : '0.0000 POL'}
            </span>
            <span className="text-slate-300" aria-hidden="true">·</span>
            <span className="font-mono-tabular">
              {walletInfo?.hasRegistrarRole ? 'REGISTRAR_ROLE Granted' : 'REGISTRAR_ROLE Unverified'}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-xs">
          <a
            href={`${POLYGON_AMOY_EXPLORER}/address/${CONTRACT_ADDRESSES.LandRegistry}`}
            target="_blank"
            rel="noreferrer"
            className="px-3 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-mono-tabular whitespace-nowrap"
          >
            LandRegistry: {truncateAddress(CONTRACT_ADDRESSES.LandRegistry)}
          </a>
          <button
            type="button"
            onClick={onRefresh}
            className="px-3.5 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-semibold inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh Telemetry
          </button>
        </div>
      </section>

      {/* Main Content Split: Pending Queue & Latest Audit Activity */}
      <section className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-4">
            <div>
              <h2 className="font-display text-base font-bold text-slate-900">
                Pending Applications Queue
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Incoming parcels awaiting cadastral intake, PostGIS overlap check, or title execution
              </p>
            </div>
            <span className="text-xs font-mono-tabular text-slate-500 whitespace-nowrap">
              {pendingQueue.length} shown
            </span>
          </div>

          {pendingQueue.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500">
              No pending audit applications in the queue.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-[#FAFDF8] text-[11px] font-semibold text-slate-500">
                    <th className="py-3 px-4">Parcel ID</th>
                    <th className="py-3 px-4">Applicant / Location</th>
                    <th className="py-3 px-4 text-right">Area (sqm)</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {pendingQueue.map((parcel) => {
                    const code = parcel.parcel_code || parcel.parcel_id || parcel.id.slice(0, 8);
                    return (
                      <tr key={parcel.id} className="hover:bg-[#FAFDF8] transition-colors">
                        <td className="py-3 px-4 font-mono-tabular font-semibold text-slate-900 whitespace-nowrap">
                          {code}
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-medium text-slate-900 truncate max-w-[220px]">
                            {parcel.owner_name || parcel.title || 'Applicant'}
                          </div>
                          <div className="text-[11px] text-slate-500 truncate max-w-[220px]">
                            {[parcel.lga_name, parcel.state_name].filter(Boolean).join(', ') || 'Unassigned LGA'}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-right font-mono-tabular text-slate-700 whitespace-nowrap">
                          {parcel.area_sqm ? formatNumber(parcel.area_sqm) : '—'}
                        </td>
                        <td className="py-3 px-4">
                          <StatusText status={parcel.governor_consent_status === 'GOVERNOR_CONSENT_PENDING' ? 'governor_consent_pending' : parcel.status} />
                        </td>
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => onOpenParcel(parcel.id, 'gis')}
                              className="px-2.5 py-1 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 font-medium cursor-pointer"
                            >
                              GIS
                            </button>
                            <button
                              type="button"
                              onClick={() => onOpenParcel(parcel.id, 'intake')}
                              className="px-2.5 py-1 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white font-medium inline-flex items-center gap-1 cursor-pointer"
                            >
                              Inspect <ArrowRight className="w-3 h-3" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Latest Registry Activity */}
        <div className="rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200">
            <h2 className="font-display text-base font-bold text-slate-900">
              Latest Registry Activity
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Immutable registrar &amp; on-chain audit log
            </p>
          </div>

          {recentActivity.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500">
              No recent audit events recorded.
            </div>
          ) : (
            <ul className="divide-y divide-slate-100 max-h-[460px] overflow-y-auto">
              {recentActivity.map((log) => (
                <li key={log.id} className="px-5 py-3.5 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-slate-900">
                      {log.action.replace(/_/g, ' ')}
                    </span>
                    <span className="font-mono-tabular text-[11px] text-slate-400 shrink-0">
                      {formatDateTime(log.created_at)}
                    </span>
                  </div>
                  <div className="mt-1 text-slate-500 flex flex-wrap items-center gap-2">
                    <span className="font-mono-tabular">{log.actor_staff_id || 'System'}</span>
                    {log.parcel_id && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono-tabular">Parcel {log.parcel_id.slice(0, 8)}</span>
                      </>
                    )}
                    {log.tx_hash && (
                      <>
                        <span aria-hidden="true">·</span>
                        <a
                          href={`${POLYGON_AMOY_EXPLORER}/tx/${log.tx_hash}`}
                          target="_blank"
                          rel="noreferrer"
                          className="font-mono-tabular text-emerald-700 hover:underline"
                        >
                          {truncateAddress(log.tx_hash)}
                        </a>
                      </>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
