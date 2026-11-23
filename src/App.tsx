import { useCallback, useEffect, useMemo, useState } from 'react';
import { LoginScreen } from './components/LoginScreen';
import { Sidebar } from './components/Sidebar';
import { TopHeader } from './components/TopHeader';
import { DocumentReviewWorkspace } from './components/workspaces/DocumentReviewWorkspace';
import { FeesWorkspace } from './components/workspaces/FeesWorkspace';
import { GisWorkspace } from './components/workspaces/GisWorkspace';
import { IntakeWorkspace } from './components/workspaces/IntakeWorkspace';
import { LedgerDisputesWorkspace } from './components/workspaces/LedgerDisputesWorkspace';
import { MintingWorkspace } from './components/workspaces/MintingWorkspace';
import { OverviewWorkspace } from './components/workspaces/OverviewWorkspace';
import { OwnershipWorkspace } from './components/workspaces/OwnershipWorkspace';
import { apiFetch, getAuthToken, setAuthToken } from './lib/api';
import {
  connectMetaMaskWallet,
  getEthereumProvider,
  switchToPolygonAmoy,
} from './lib/web3';
import type {
  ApplicationAssignment,
  AuditLog,
  BlockchainStatus,
  ParcelRecord,
  RegistrarNotification,
  RegistrarTab,
  StaffProfile,
  WalletOnChainInfo,
} from './types/registrar';

const TAB_TITLES: Record<RegistrarTab, string> = {
  overview: 'Registrar Overview',
  intake: 'Application Intake & Triage',
  gis: 'GIS & PostGIS Boundary Verification',
  documents: 'Statutory & Customary Document Review',
  ownership: 'Dual-Tenure Ownership Verification',
  fees: 'Fee Confirmation & Reconciliation',
  minting: 'On-Chain Title Minting & Conveyance',
  ledger: 'Dispute Flagging & Registry Ledger',
};

export default function App() {
  const [staff, setStaff] = useState<StaffProfile | null>(null);
  const [activeTab, setActiveTab] = useState<RegistrarTab>('overview');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Wallet & Polygon Amoy State
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [walletChainId, setWalletChainId] = useState<number | null>(null);
  const [walletInfo, setWalletInfo] = useState<WalletOnChainInfo | null>(null);
  const [walletBusy, setWalletBusy] = useState(false);
  const [walletError, setWalletError] = useState<string | null>(null);
  const [blockchainStatus, setBlockchainStatus] = useState<BlockchainStatus | null>(null);

  // Registrar Data State
  const [overviewStats, setOverviewStats] = useState({
    pendingApplications: 0,
    gisChecksToday: 0,
    verifiedParcels: 0,
    disputedParcels: 0,
    governorConsentPending: 0,
    openDisputeTickets: 0,
    anaguFeesCollectedDb: 0,
    governorConsentThresholdUsd: 100000,
  });
  const [pendingQueue, setPendingQueue] = useState<ParcelRecord[]>([]);
  const [recentActivity, setRecentActivity] = useState<AuditLog[]>([]);
  const [parcels, setParcels] = useState<ParcelRecord[]>([]);
  const [assignments, setAssignments] = useState<ApplicationAssignment[]>([]);
  const [notifications, setNotifications] = useState<RegistrarNotification[]>([]);
  const [selectedParcelId, setSelectedParcelId] = useState<string | null>(null);
  const [dataLoading, setDataLoading] = useState(false);
  const [dataError, setDataError] = useState<string | null>(null);

  const loadWalletInfo = useCallback(async (address: string) => {
    try {
      const info = await apiFetch<WalletOnChainInfo>(
        `/api/blockchain/wallet/${encodeURIComponent(address)}`
      );
      setWalletInfo(info);
    } catch {
      setWalletInfo(null);
    }
  }, []);

  const loadBlockchainStatus = useCallback(async () => {
    try {
      const status = await apiFetch<BlockchainStatus>('/api/blockchain/status');
      setBlockchainStatus(status);
    } catch {
      // Keep previous status if transient RPC hiccup occurs
    }
  }, []);

  const loadRegistrarWorkspaceData = useCallback(async () => {
    if (!getAuthToken()) return;
    setDataLoading(true);
    setDataError(null);
    try {
      const [overviewRes, parcelsRes, notifRes] = await Promise.all([
        apiFetch<{
          stats: typeof overviewStats;
          pendingQueue: ParcelRecord[];
          recentActivity: AuditLog[];
        }>('/api/registrar/overview'),
        apiFetch<{
          parcels: ParcelRecord[];
          assignments: ApplicationAssignment[];
        }>('/api/registrar/parcels'),
        apiFetch<{ notifications: RegistrarNotification[] }>('/api/registrar/notifications'),
      ]);

      setOverviewStats(overviewRes.stats);
      setPendingQueue(overviewRes.pendingQueue || []);
      setRecentActivity(overviewRes.recentActivity || []);
      setParcels(parcelsRes.parcels || []);
      setAssignments(parcelsRes.assignments || []);
      setNotifications(notifRes.notifications || []);

      if (!selectedParcelId && parcelsRes.parcels?.length) {
        setSelectedParcelId(parcelsRes.parcels[0].id);
      }
    } catch (err) {
      setDataError((err as Error).message);
    } finally {
      setDataLoading(false);
    }
  }, [selectedParcelId]);

  // Verify existing in-memory session & fetch blockchain status on mount
  useEffect(() => {
    loadBlockchainStatus();
    if (getAuthToken()) {
      apiFetch<{ staff: StaffProfile }>('/api/registrar/me')
        .then((res) => setStaff(res.staff))
        .catch(() => {
          setAuthToken(null);
          setStaff(null);
        });
    }
  }, [loadBlockchainStatus]);

  // Attach MetaMask accountsChanged & chainChanged listeners
  useEffect(() => {
    const eth = getEthereumProvider();
    if (!eth?.on) return;

    // Passive check for already-authorized accounts
    eth
      .request({ method: 'eth_accounts' })
      .then((accs) => {
        const list = accs as string[];
        if (list?.length) {
          setWalletAddress(list[0]);
          loadWalletInfo(list[0]);
          eth.request({ method: 'eth_chainId' }).then((hex) => {
            setWalletChainId(parseInt(String(hex), 16));
          });
        }
      })
      .catch(() => {});

    const handleAccountsChanged = (accounts: unknown) => {
      const list = accounts as string[];
      if (list && list.length > 0) {
        setWalletAddress(list[0]);
        loadWalletInfo(list[0]);
      } else {
        setWalletAddress(null);
        setWalletInfo(null);
      }
    };

    const handleChainChanged = (chainHex: unknown) => {
      const parsed = parseInt(String(chainHex), 16);
      setWalletChainId(parsed);
      if (walletAddress) {
        loadWalletInfo(walletAddress);
      }
    };

    eth.on('accountsChanged', handleAccountsChanged);
    eth.on('chainChanged', handleChainChanged);

    return () => {
      eth.removeListener?.('accountsChanged', handleAccountsChanged);
      eth.removeListener?.('chainChanged', handleChainChanged);
    };
  }, [loadWalletInfo, walletAddress]);

  // Load workspace data once authenticated
  useEffect(() => {
    if (staff) {
      loadRegistrarWorkspaceData();
      loadBlockchainStatus();
    }
  }, [staff, loadRegistrarWorkspaceData, loadBlockchainStatus]);

  const handleConnectWallet = async () => {
    setWalletBusy(true);
    setWalletError(null);
    try {
      const { address, chainId } = await connectMetaMaskWallet(false);
      setWalletAddress(address);
      setWalletChainId(chainId);
      await loadWalletInfo(address);
    } catch (err) {
      setWalletError((err as Error).message);
    } finally {
      setWalletBusy(false);
    }
  };

  const handleSwitchWallet = async () => {
    setWalletBusy(true);
    setWalletError(null);
    try {
      const { address, chainId } = await connectMetaMaskWallet(true);
      setWalletAddress(address);
      setWalletChainId(chainId);
      await loadWalletInfo(address);
    } catch (err) {
      setWalletError((err as Error).message);
    } finally {
      setWalletBusy(false);
    }
  };

  const handleSwitchToAmoy = async () => {
    setWalletBusy(true);
    setWalletError(null);
    try {
      await switchToPolygonAmoy();
      setWalletChainId(80002);
      if (walletAddress) {
        await loadWalletInfo(walletAddress);
      }
    } catch (err) {
      setWalletError((err as Error).message);
    } finally {
      setWalletBusy(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await apiFetch('/api/staff/logout', { method: 'POST' });
    } catch {
      // ignore logout log failure
    }
    setAuthToken(null);
    setStaff(null);
    setParcels([]);
    setPendingQueue([]);
    setRecentActivity([]);
  };

  const filteredParcels = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return parcels;
    return parcels.filter((p) => {
      const haystack = [
        p.id,
        p.parcel_id,
        p.parcel_code,
        p.title,
        p.owner_name,
        p.owner_wallet,
        p.state_name,
        p.lga_name,
        p.last_tx_hash,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [parcels, searchQuery]);

  if (!staff) {
    return (
      <LoginScreen
        onAuthenticated={(loggedInStaff) => {
          setStaff(loggedInStaff);
          setActiveTab('overview');
        }}
      />
    );
  }

  return (
    <div className="min-h-screen bg-[#FAFDF8] text-slate-900">
      <Sidebar
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        staff={staff}
        mobileOpen={mobileMenuOpen}
        onCloseMobile={() => setMobileMenuOpen(false)}
      />

      <div className="lg:pl-64 flex flex-col min-h-screen">
        <TopHeader
          sectionTitle={TAB_TITLES[activeTab]}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          staff={staff}
          walletAddress={walletAddress}
          walletChainId={walletChainId}
          walletInfo={walletInfo}
          walletBusy={walletBusy}
          onConnectWallet={handleConnectWallet}
          onSwitchWallet={handleSwitchWallet}
          onSwitchToAmoy={handleSwitchToAmoy}
          notifications={notifications}
          onNotificationSelect={(parcelId) => {
            if (parcelId) {
              setSelectedParcelId(parcelId);
              setActiveTab('intake');
            }
          }}
          onOpenMobileMenu={() => setMobileMenuOpen(true)}
          onSignOut={handleSignOut}
        />

        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-[1440px] w-full mx-auto space-y-5">
          {walletError && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900 flex items-center justify-between gap-3">
              <span>{walletError}</span>
              <button
                type="button"
                onClick={() => setWalletError(null)}
                className="font-semibold hover:underline cursor-pointer"
              >
                Dismiss
              </button>
            </div>
          )}

          {dataError && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-800 flex items-center justify-between gap-3">
              <span>{dataError}</span>
              <button
                type="button"
                onClick={loadRegistrarWorkspaceData}
                className="font-semibold hover:underline cursor-pointer"
              >
                Retry
              </button>
            </div>
          )}

          {activeTab === 'overview' && (
            <OverviewWorkspace
              stats={overviewStats}
              pendingQueue={pendingQueue}
              recentActivity={recentActivity}
              blockchainStatus={blockchainStatus}
              walletAddress={walletAddress}
              walletInfo={walletInfo}
              loading={dataLoading}
              onRefresh={() => {
                loadRegistrarWorkspaceData();
                loadBlockchainStatus();
                if (walletAddress) loadWalletInfo(walletAddress);
              }}
              onOpenParcel={(id, targetTab) => {
                setSelectedParcelId(id);
                setActiveTab(targetTab);
              }}
            />
          )}

          {activeTab === 'intake' && (
            <IntakeWorkspace
              parcels={filteredParcels}
              assignments={assignments}
              selectedParcelId={selectedParcelId}
              staff={staff}
              onSelectParcel={setSelectedParcelId}
              onNavigateTab={setActiveTab}
              onRefresh={loadRegistrarWorkspaceData}
            />
          )}

          {activeTab === 'gis' && (
            <GisWorkspace
              parcels={filteredParcels}
              selectedParcelId={selectedParcelId}
              onSelectParcel={setSelectedParcelId}
              onRefresh={loadRegistrarWorkspaceData}
            />
          )}

          {activeTab === 'documents' && (
            <DocumentReviewWorkspace
              parcels={filteredParcels}
              selectedParcelId={selectedParcelId}
              onSelectParcel={setSelectedParcelId}
              onRefresh={loadRegistrarWorkspaceData}
            />
          )}

          {activeTab === 'ownership' && (
            <OwnershipWorkspace
              parcels={filteredParcels}
              selectedParcelId={selectedParcelId}
              onSelectParcel={setSelectedParcelId}
              onRefresh={loadRegistrarWorkspaceData}
            />
          )}

          {activeTab === 'fees' && (
            <FeesWorkspace onRefreshOverview={loadRegistrarWorkspaceData} />
          )}

          {activeTab === 'minting' && (
            <MintingWorkspace
              parcels={filteredParcels}
              selectedParcelId={selectedParcelId}
              onSelectParcel={setSelectedParcelId}
              walletAddress={walletAddress}
              walletChainId={walletChainId}
              walletInfo={walletInfo}
              blockchainStatus={blockchainStatus}
              governorThresholdUsd={overviewStats.governorConsentThresholdUsd}
              onConnectWallet={handleConnectWallet}
              onSwitchToAmoy={handleSwitchToAmoy}
              onRefresh={() => {
                loadRegistrarWorkspaceData();
                loadBlockchainStatus();
                if (walletAddress) loadWalletInfo(walletAddress);
              }}
            />
          )}

          {activeTab === 'ledger' && (
            <LedgerDisputesWorkspace
              parcels={filteredParcels}
              selectedParcelId={selectedParcelId}
              onSelectParcel={setSelectedParcelId}
              onRefresh={loadRegistrarWorkspaceData}
            />
          )}
        </main>
      </div>
    </div>
  );
}
