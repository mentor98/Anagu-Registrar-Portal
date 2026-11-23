import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Award,
  CheckCircle2,
  ExternalLink,
  Forward,
  ShieldCheck,
  Stamp,
} from 'lucide-react';
import { apiFetch, formatNumber, truncateAddress } from '../../lib/api';
import {
  CONTRACT_ADDRESSES,
  POLYGON_AMOY_CHAIN_ID,
  POLYGON_AMOY_EXPLORER,
  buildParcelMetadataUri,
  keccakId,
} from '../../lib/contracts';
import { executeOnChainTitleAction } from '../../lib/web3';
import { CertificateModal } from '../CertificateModal';
import { ParcelSelectorBar } from '../ParcelSelectorBar';
import { StatusText } from '../StatusText';
import type {
  BlockchainStatus,
  LandTitleRecord,
  ParcelRecord,
  WalletOnChainInfo,
} from '../../types/registrar';

interface MintingWorkspaceProps {
  parcels: ParcelRecord[];
  selectedParcelId: string | null;
  onSelectParcel: (id: string) => void;
  walletAddress: string | null;
  walletChainId: number | null;
  walletInfo: WalletOnChainInfo | null;
  blockchainStatus: BlockchainStatus | null;
  governorThresholdUsd: number;
  onConnectWallet: () => void;
  onSwitchToAmoy: () => void;
  onRefresh: () => void;
}

export function MintingWorkspace({
  parcels,
  selectedParcelId,
  onSelectParcel,
  walletAddress,
  walletChainId,
  walletInfo,
  blockchainStatus,
  governorThresholdUsd,
  onConnectWallet,
  onSwitchToAmoy,
  onRefresh,
}: MintingWorkspaceProps) {
  const parcel = parcels.find((p) => p.id === selectedParcelId) || parcels[0] || null;

  const [operation, setOperation] = useState<'register' | 'transfer'>('register');
  const [ownerWallet, setOwnerWallet] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [tokenIdInput, setTokenIdInput] = useState('');
  const [appIdProcessed, setAppIdProcessed] = useState<boolean | null>(null);
  const [busyStep, setBusyStep] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successInfo, setSuccessInfo] = useState<{ txHash: string; tokenId: string } | null>(null);
  const [certificateOpen, setCertificateOpen] = useState(false);
  const [syncedTitle, setSyncedTitle] = useState<LandTitleRecord | null>(null);

  useEffect(() => {
    if (!parcel) return;
    const isTransfer =
      parcel.application_type === 'transfer' ||
      (parcel.nft_token_id != null && Boolean(parcel.new_owner_wallet));
    setOperation(isTransfer ? 'transfer' : 'register');
    setOwnerWallet(
      isTransfer
        ? parcel.new_owner_wallet || parcel.owner_wallet || ''
        : parcel.owner_wallet || ''
    );
    setOwnerName(
      isTransfer
        ? parcel.new_owner_name || parcel.owner_name || ''
        : parcel.owner_name || ''
    );
    setTokenIdInput(parcel.nft_token_id != null ? String(parcel.nft_token_id) : '');
    setSuccessInfo(null);
    setError(null);

    const appId = parcel.application_id || parcel.id;
    apiFetch<{ processed: boolean }>(`/api/blockchain/application/${encodeURIComponent(appId)}`)
      .then((res) => setAppIdProcessed(res.processed))
      .catch(() => setAppIdProcessed(null));
  }, [parcel?.id]);

  if (!parcel) {
    return (
      <div className="rounded-2xl bg-white border border-slate-200 p-8 text-center text-sm text-slate-500">
        No parcels available for title minting or conveyance execution.
      </div>
    );
  }

  const parcelCode = parcel.parcel_code || parcel.parcel_id || parcel.id;
  const applicationId = parcel.application_id || parcel.id;
  const spatialHash = parcel.spatial_hash || keccakId(parcel.id);
  const metadataUri = buildParcelMetadataUri(parcelCode);

  const estimatedVal = Number(parcel.estimated_value_usd || 0);
  const requiresGovernorConsent =
    estimatedVal >= governorThresholdUsd &&
    parcel.governor_consent_status !== 'APPROVED' &&
    parcel.governor_consent_status !== 'GOVERNOR_CONSENT_APPROVED';

  const requiredFeeFormatted =
    operation === 'transfer'
      ? blockchainStatus?.transferFeeFormatted || '0'
      : blockchainStatus?.registrationFeeFormatted || '0';

  const requiredFeeWei = BigInt(
    operation === 'transfer'
      ? blockchainStatus?.transferFeeWei || '0'
      : blockchainStatus?.registrationFeeWei || '0'
  );

  const hasEnoughAnagu = walletInfo
    ? BigInt(walletInfo.anaguBalanceWei) >= requiredFeeWei
    : false;
  const needsApproval =
    requiredFeeWei > 0n && walletInfo
      ? BigInt(walletInfo.anaguAllowanceWei) < requiredFeeWei
      : false;

  const handleForwardGovernor = async () => {
    setBusyStep('Forwarding parcel to Governor Consent queue…');
    setError(null);
    try {
      await apiFetch(`/api/registrar/parcels/${parcel.id}/forward-governor`, {
        method: 'POST',
        body: JSON.stringify({
          notes: `Parcel valuation ($${formatNumber(estimatedVal, 0)}) meets/exceeds threshold ($${formatNumber(governorThresholdUsd, 0)}).`,
        }),
      });
      onRefresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusyStep(null);
    }
  };

  const handleExecuteOnChain = async () => {
    setError(null);
    setSuccessInfo(null);
    setBusyStep('Initializing MetaMask transaction…');

    try {
      const chainResult = await executeOnChainTitleAction({
        operation,
        applicationId,
        parcelId: parcelCode,
        spatialHash,
        ownerAddress: ownerWallet.trim(),
        tokenId: operation === 'transfer' ? tokenIdInput.trim() : undefined,
        onProgress: (msg) => setBusyStep(msg),
      });

      setBusyStep('Syncing Polygon Amoy receipt to Supabase Registry…');
      const synced = await apiFetch<{
        parcel: ParcelRecord;
        landTitle: LandTitleRecord | null;
        tokenId: string;
      }>('/api/registrar/titles/sync', {
        method: 'POST',
        body: JSON.stringify({
          parcelId: parcel.id,
          txHash: chainResult.txHash,
          operation,
          ownerAddress: ownerWallet.trim(),
          ownerName: ownerName.trim(),
          signerAddress: chainResult.signerAddress,
          tokenId: chainResult.tokenId,
        }),
      });

      setSyncedTitle(synced.landTitle);
      setSuccessInfo({
        txHash: chainResult.txHash,
        tokenId: synced.tokenId || chainResult.tokenId,
      });
      setAppIdProcessed(true);
      onRefresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusyStep(null);
    }
  };

  const wrongNetwork = walletAddress && walletChainId !== POLYGON_AMOY_CHAIN_ID;

  return (
    <div className="space-y-5">
      <ParcelSelectorBar
        parcels={parcels}
        selectedParcelId={parcel.id}
        onSelectParcel={onSelectParcel}
        label="Select Parcel for On-Chain Title Minting or Conveyance"
      />

      {/* Governor Consent Threshold Notice */}
      {requiresGovernorConsent && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1 text-xs">
            <div className="font-semibold text-amber-900 flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4 text-amber-700" />
              <span>
                Executive Governor Consent Required (Valuation ${formatNumber(estimatedVal, 0)} ≥ ${formatNumber(governorThresholdUsd, 0)})
              </span>
            </div>
            <p className="text-amber-800">
              Current consent status: {parcel.governor_consent_status || 'NOT_FORWARDED'}. Forward to the Governor portal before final title issuance.
            </p>
          </div>
          {parcel.governor_consent_status !== 'GOVERNOR_CONSENT_PENDING' && (
            <button
              type="button"
              disabled={Boolean(busyStep)}
              onClick={handleForwardGovernor}
              className="px-4 py-2 rounded-xl bg-amber-700 hover:bg-amber-800 text-white text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
            >
              <Forward className="w-3.5 h-3.5" />
              Forward to Governor Consent
            </button>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        {/* Left: Contract Execution Form */}
        <div className="xl:col-span-7 rounded-2xl bg-white border border-slate-200 shadow-sm p-6 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4">
            <div className="flex items-center gap-2">
              <Stamp className="w-5 h-5 text-emerald-700" />
              <div>
                <h2 className="font-display text-base font-bold text-slate-900">
                  LandRegistry Contract Execution (Polygon Amoy)
                </h2>
                <p className="text-xs text-slate-500 font-mono-tabular">
                  {CONTRACT_ADDRESSES.LandRegistry}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1 p-1 rounded-xl bg-[#FAFDF8] border border-slate-200">
              <button
                type="button"
                onClick={() => setOperation('register')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${
                  operation === 'register'
                    ? 'bg-emerald-700 text-white'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Register Title
              </button>
              <button
                type="button"
                onClick={() => setOperation('transfer')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${
                  operation === 'transfer'
                    ? 'bg-emerald-700 text-white'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Transfer Title
              </button>
            </div>
          </div>

          {error && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-800">
              {error}
            </div>
          )}

          {busyStep && (
            <div className="rounded-xl border border-emerald-200 bg-[#F3FDE9] px-4 py-3 text-xs font-medium text-emerald-900">
              {busyStep}
            </div>
          )}

          {successInfo && (
            <div className="rounded-xl border border-emerald-200 bg-[#F3FDE9] p-4 space-y-2 text-xs">
              <div className="font-semibold text-emerald-900 flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-700" />
                <span>
                  On-Chain Execution Confirmed &amp; Synced — Token #{successInfo.tokenId}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <a
                  href={`${POLYGON_AMOY_EXPLORER}/tx/${successInfo.txHash}`}
                  target="_blank"
                  rel="noreferrer"
                  className="font-mono-tabular text-emerald-700 hover:underline inline-flex items-center gap-1"
                >
                  {truncateAddress(successInfo.txHash, 10, 8)} <ExternalLink className="w-3 h-3" />
                </a>
                <button
                  type="button"
                  onClick={() => setCertificateOpen(true)}
                  className="px-3 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white font-semibold inline-flex items-center gap-1 cursor-pointer"
                >
                  <Award className="w-3.5 h-3.5" />
                  View / Download C-of-O Deed
                </button>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div>
              <label htmlFor="mint-owner-wallet" className="block font-medium text-slate-700 mb-1">
                {operation === 'transfer' ? 'New Owner Wallet Address' : 'Proprietor Wallet Address'}
              </label>
              <input
                id="mint-owner-wallet"
                type="text"
                value={ownerWallet}
                onChange={(e) => setOwnerWallet(e.target.value)}
                placeholder="0x…"
                className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-[#FAFDF8] font-mono-tabular text-slate-900"
              />
            </div>

            <div>
              <label htmlFor="mint-owner-name" className="block font-medium text-slate-700 mb-1">
                Registered Holder Name
              </label>
              <input
                id="mint-owner-name"
                type="text"
                value={ownerName}
                onChange={(e) => setOwnerName(e.target.value)}
                placeholder="Full legal name or corporate entity"
                className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-[#FAFDF8] text-slate-900"
              />
            </div>

            {operation === 'transfer' && (
              <div>
                <label htmlFor="mint-token-id" className="block font-medium text-slate-700 mb-1">
                  Existing LandTitleNFT Token ID
                </label>
                <input
                  id="mint-token-id"
                  type="text"
                  value={tokenIdInput}
                  onChange={(e) => setTokenIdInput(e.target.value)}
                  placeholder="e.g. 1"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-[#FAFDF8] font-mono-tabular text-slate-900"
                />
              </div>
            )}

            <div className={operation === 'transfer' ? '' : 'sm:col-span-2'}>
              <span className="block font-medium text-slate-700 mb-1">
                Deterministic Metadata URI Standard
              </span>
              <div className="px-3 py-2 rounded-xl border border-slate-200 bg-[#FAFDF8] font-mono-tabular text-emerald-700 break-all">
                {metadataUri}
              </div>
            </div>

            <div className="sm:col-span-2">
              <span className="block font-medium text-slate-700 mb-1">
                Bytes32 Hashes (applicationId · parcelId · spatialHash)
              </span>
              <div className="p-3 rounded-xl border border-slate-200 bg-[#FAFDF8] font-mono-tabular text-[11px] text-slate-600 space-y-1 break-all">
                <div>appBytes: {keccakId(applicationId)}</div>
                <div>parcelBytes: {keccakId(parcelCode)}</div>
                <div>spatialHash: {keccakId(spatialHash)}</div>
              </div>
            </div>
          </div>

          <div className="pt-2 flex flex-wrap items-center justify-between gap-3">
            {(parcel.nft_token_id != null || syncedTitle) && (
              <button
                type="button"
                onClick={() => setCertificateOpen(true)}
                className="px-4 py-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-800 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Award className="w-4 h-4 text-emerald-700" />
                Open Certificate / Deed
              </button>
            )}

            <div className="ml-auto flex items-center gap-2">
              {!walletAddress ? (
                <button
                  type="button"
                  onClick={onConnectWallet}
                  className="px-5 py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold cursor-pointer"
                >
                  Connect Registrar Wallet
                </button>
              ) : wrongNetwork ? (
                <button
                  type="button"
                  onClick={onSwitchToAmoy}
                  className="px-5 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold cursor-pointer"
                >
                  Switch to Polygon Amoy (80002)
                </button>
              ) : (
                <button
                  type="button"
                  disabled={Boolean(busyStep) || appIdProcessed === true}
                  onClick={handleExecuteOnChain}
                  className="px-5 py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white text-xs font-semibold cursor-pointer"
                >
                  {operation === 'transfer'
                    ? 'Execute transferTitle on Amoy'
                    : 'Mint Title (registerTitle) on Amoy'}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Right: On-Chain Pre-Flight Checklist */}
        <div className="xl:col-span-5 rounded-2xl bg-white border border-slate-200 shadow-sm p-6 space-y-4">
          <div className="flex items-center gap-2 text-sm font-display font-bold text-slate-900">
            <ShieldCheck className="w-4 h-4 text-emerald-700" />
            <span>On-Chain Pre-Flight Verification</span>
          </div>

          <ul className="divide-y divide-slate-100 text-xs">
            <li className="py-3 flex items-center justify-between gap-2">
              <span className="text-slate-600">REGISTRAR_ROLE on Signer</span>
              <StatusText status={walletInfo?.hasRegistrarRole ? 'verified' : 'pending'} />
            </li>
            <li className="py-3 flex items-center justify-between gap-2">
              <span className="text-slate-600">Application Unprocessed</span>
              <StatusText
                status={
                  appIdProcessed === false
                    ? 'verified'
                    : appIdProcessed === true
                      ? 'rejected'
                      : 'pending'
                }
              />
            </li>
            <li className="py-3 flex items-center justify-between gap-2">
              <span className="text-slate-600">
                Protocol Fee ({operation === 'transfer' ? 'fees(1)' : 'fees(0)'})
              </span>
              <span className="font-mono-tabular font-semibold text-slate-900">
                {requiredFeeFormatted} ANAGU
              </span>
            </li>
            <li className="py-3 flex items-center justify-between gap-2">
              <span className="text-slate-600">Signer ANAGU Balance</span>
              <span className={`font-mono-tabular font-semibold ${hasEnoughAnagu ? 'text-emerald-700' : 'text-rose-700'}`}>
                {walletInfo ? `${walletInfo.anaguBalanceFormatted} ANAGU` : 'Wallet disconnected'}
              </span>
            </li>
            <li className="py-3 flex items-center justify-between gap-2">
              <span className="text-slate-600">LandRegistry Allowance</span>
              <span className="font-mono-tabular text-slate-800">
                {requiredFeeWei === 0n
                  ? 'No fee required'
                  : needsApproval
                    ? 'Auto-approve prompted on submit'
                    : 'Sufficient allowance'}
              </span>
            </li>
          </ul>
        </div>
      </div>

      {certificateOpen && (
        <CertificateModal
          parcel={parcel}
          landTitle={syncedTitle}
          onClose={() => setCertificateOpen(false)}
        />
      )}
    </div>
  );
}
