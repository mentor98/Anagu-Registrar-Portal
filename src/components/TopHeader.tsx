import { useState } from 'react';
import {
  Bell,
  LogOut,
  Menu,
  RefreshCw,
  Search,
  ShieldCheck,
  Wallet,
} from 'lucide-react';
import { POLYGON_AMOY_CHAIN_ID } from '../lib/contracts';
import { truncateAddress } from '../lib/api';
import type {
  RegistrarNotification,
  StaffProfile,
  WalletOnChainInfo,
} from '../types/registrar';

interface TopHeaderProps {
  sectionTitle: string;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  staff: StaffProfile;
  walletAddress: string | null;
  walletChainId: number | null;
  walletInfo: WalletOnChainInfo | null;
  walletBusy: boolean;
  onConnectWallet: () => void;
  onSwitchWallet: () => void;
  onSwitchToAmoy: () => void;
  notifications: RegistrarNotification[];
  onNotificationSelect: (parcelId?: string) => void;
  onOpenMobileMenu: () => void;
  onSignOut: () => void;
}

export function TopHeader({
  sectionTitle,
  searchQuery,
  onSearchChange,
  staff,
  walletAddress,
  walletChainId,
  walletInfo,
  walletBusy,
  onConnectWallet,
  onSwitchWallet,
  onSwitchToAmoy,
  notifications,
  onNotificationSelect,
  onOpenMobileMenu,
  onSignOut,
}: TopHeaderProps) {
  const [notifOpen, setNotifOpen] = useState(false);

  const wrongNetwork = walletAddress && walletChainId !== POLYGON_AMOY_CHAIN_ID;
  const staffWalletMatches =
    walletAddress &&
    staff.wallet_address &&
    walletAddress.toLowerCase() === staff.wallet_address.toLowerCase();

  return (
    <header className="sticky top-0 z-20 bg-white border-b border-slate-200">
      {/* Primary Header Row */}
      <div className="h-16 px-4 sm:px-6 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={onOpenMobileMenu}
            className="lg:hidden p-2 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 cursor-pointer"
            aria-label="Open navigation menu"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="min-w-0">
            <h1 className="font-display text-base sm:text-lg font-bold text-slate-900 truncate">
              {sectionTitle}
            </h1>
          </div>
        </div>

        {/* Search Input (Desktop/Tablet) */}
        <div className="hidden md:flex flex-1 max-w-sm mx-2">
          <div className="relative w-full">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Search parcel ID, owner, LGA, or tx hash…"
              className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 bg-[#FAFDF8] text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-700/20 focus:border-emerald-700"
            />
          </div>
        </div>

        {/* Right Action Cluster */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Desktop Wallet & Live Balances */}
          <div className="hidden xl:flex items-center gap-2 px-3 py-1.5 rounded-xl border border-slate-200 bg-[#FAFDF8]">
            {walletAddress ? (
              <>
                <div className="flex items-center gap-2 text-xs">
                  <span className="font-mono-tabular font-medium text-slate-900">
                    {truncateAddress(walletAddress)}
                  </span>
                  <span className="text-slate-300">|</span>
                  <span className="font-mono-tabular text-emerald-700 font-semibold">
                    {walletInfo ? `${walletInfo.anaguBalanceFormatted} ANAGU` : '… ANAGU'}
                  </span>
                  <span className="text-slate-300">·</span>
                  <span className="font-mono-tabular text-slate-600">
                    {walletInfo ? `${walletInfo.polBalanceFormatted} POL` : '… POL'}
                  </span>
                </div>
                {wrongNetwork ? (
                  <button
                    type="button"
                    onClick={onSwitchToAmoy}
                    disabled={walletBusy}
                    className="ml-1 px-2.5 py-1 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-[11px] font-semibold whitespace-nowrap cursor-pointer"
                  >
                    Switch to Amoy (80002)
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={onSwitchWallet}
                    disabled={walletBusy}
                    className="ml-1 px-2 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-[11px] font-medium whitespace-nowrap cursor-pointer inline-flex items-center gap-1"
                  >
                    <RefreshCw className="w-3 h-3" />
                    Switch Wallet
                  </button>
                )}
              </>
            ) : (
              <button
                type="button"
                onClick={onConnectWallet}
                disabled={walletBusy}
                className="px-2.5 py-1 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold whitespace-nowrap cursor-pointer inline-flex items-center gap-1.5"
              >
                <Wallet className="w-3.5 h-3.5" />
                Connect Wallet
              </button>
            )}
          </div>

          {/* Role & Optional Wallet Match Text */}
          <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border border-emerald-200 bg-[#F3FDE9] text-emerald-800 text-xs font-semibold whitespace-nowrap">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-700" />
            <span>REGISTRAR</span>
            {walletInfo?.hasRegistrarRole && (
              <span className="text-[10px] font-mono-tabular text-emerald-700">
                · On-Chain
              </span>
            )}
            {staffWalletMatches && (
              <span className="text-[10px] font-mono-tabular text-emerald-700">
                · Matched
              </span>
            )}
          </div>

          {/* Notifications Bell */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setNotifOpen((prev) => !prev)}
              aria-label="Registrar notifications"
              className="relative p-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 cursor-pointer"
            >
              <Bell className="w-4 h-4" />
              {notifications.length > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-emerald-700 text-white text-[10px] font-mono-tabular font-semibold flex items-center justify-center">
                  {notifications.length}
                </span>
              )}
            </button>

            {notifOpen && (
              <div className="absolute right-0 mt-2 w-80 sm:w-96 rounded-2xl bg-white border border-slate-200 shadow-lg p-3 z-50">
                <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-100">
                  <span className="text-xs font-semibold text-slate-900">
                    Registrar Queue Alerts ({notifications.length})
                  </span>
                  <button
                    type="button"
                    onClick={() => setNotifOpen(false)}
                    className="text-xs text-slate-500 hover:text-slate-800"
                  >
                    Close
                  </button>
                </div>
                {notifications.length === 0 ? (
                  <p className="text-xs text-slate-500 py-4 text-center">
                    No pending queue alerts at this moment.
                  </p>
                ) : (
                  <ul className="max-h-72 overflow-y-auto divide-y divide-slate-100">
                    {notifications.map((n) => (
                      <li key={n.id}>
                        <button
                          type="button"
                          onClick={() => {
                            setNotifOpen(false);
                            onNotificationSelect(n.parcelId);
                          }}
                          className="w-full text-left py-2.5 px-2 rounded-lg hover:bg-[#FAFDF8] transition-colors cursor-pointer"
                        >
                          <div className="text-xs font-semibold text-slate-900 truncate">
                            {n.title}
                          </div>
                          <div className="text-[11px] text-slate-500 truncate mt-0.5">
                            {n.description}
                          </div>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>

          {/* Sign Out */}
          <button
            type="button"
            onClick={onSignOut}
            className="px-3 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-medium inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Sign Out</span>
          </button>
        </div>
      </div>

      {/* Responsive Mobile/Tablet Wallet & Balance Bar (visible below xl so balances + switch controls work on all viewports) */}
      <div className="xl:hidden px-4 sm:px-6 py-2 border-t border-slate-100 bg-[#FAFDF8] flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex flex-wrap items-center gap-2 min-w-0">
          {walletAddress ? (
            <>
              <span className="font-mono-tabular font-semibold text-slate-900">
                {truncateAddress(walletAddress)}
              </span>
              <span className="text-slate-300">·</span>
              <span className="font-mono-tabular font-semibold text-emerald-700">
                {walletInfo ? `${walletInfo.anaguBalanceFormatted} ANAGU` : '… ANAGU'}
              </span>
              <span className="text-slate-300">·</span>
              <span className="font-mono-tabular text-slate-600">
                {walletInfo ? `${walletInfo.polBalanceFormatted} POL` : '… POL'}
              </span>
            </>
          ) : (
            <span className="text-slate-500">No Registrar wallet connected</span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {!walletAddress ? (
            <button
              type="button"
              onClick={onConnectWallet}
              disabled={walletBusy}
              className="px-2.5 py-1 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-[11px] font-semibold whitespace-nowrap cursor-pointer"
            >
              Connect Wallet
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={onSwitchWallet}
                disabled={walletBusy}
                className="px-2.5 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-[11px] font-medium whitespace-nowrap cursor-pointer"
              >
                Switch Wallet
              </button>
              <button
                type="button"
                onClick={onSwitchToAmoy}
                disabled={walletBusy}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold whitespace-nowrap cursor-pointer ${
                  wrongNetwork
                    ? 'bg-amber-600 hover:bg-amber-700 text-white'
                    : 'border border-emerald-200 bg-[#F3FDE9] text-emerald-800'
                }`}
              >
                {wrongNetwork ? 'Switch to Amoy (80002)' : 'Amoy (80002)'}
              </button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
