import { Download, ExternalLink, Printer, X } from 'lucide-react';
import {
  ANAGU_LOGO_URL,
  CONTRACT_ADDRESSES,
  POLYGON_AMOY_EXPLORER,
  buildParcelMetadataUri,
} from '../lib/contracts';
import { formatDateTime, formatNumber } from '../lib/api';
import type { LandTitleRecord, ParcelRecord } from '../types/registrar';

interface CertificateModalProps {
  parcel: ParcelRecord;
  landTitle?: LandTitleRecord | null;
  onClose: () => void;
}

export function CertificateModal({ parcel, landTitle, onClose }: CertificateModalProps) {
  const parcelCode = parcel.parcel_code || parcel.parcel_id || parcel.id;
  const tokenId = landTitle?.token_id ?? parcel.nft_token_id ?? '—';
  const txHash = landTitle?.last_tx_hash || parcel.last_tx_hash || '';
  const metadataUri = landTitle?.metadata_uri || buildParcelMetadataUri(parcelCode);
  const ownerWallet = landTitle?.owner_wallet || parcel.owner_wallet || '—';
  const ownerName = landTitle?.owner_name || parcel.owner_name || 'Registered Holder';

  const handleDownloadJson = () => {
    const payload = {
      issuer: 'ANAGU Land Administration',
      certificateType: 'Certificate of Occupancy & On-Chain Land Title Record',
      network: 'Polygon Amoy Testnet (Chain ID: 80002)',
      contractAddress: CONTRACT_ADDRESSES.LandTitleNFT,
      tokenId: String(tokenId),
      parcelId: parcel.id,
      parcelCode,
      title: parcel.title || parcel.address,
      ownerName,
      ownerWallet,
      state: parcel.state_name,
      lga: parcel.lga_name,
      areaSqm: parcel.area_sqm,
      spatialHash: parcel.spatial_hash || landTitle?.spatial_hash,
      metadataUri,
      transactionHash: txHash,
      issuedAt: landTitle?.issued_at || parcel.updated_at || new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ANAGU-Certificate-${parcelCode}-Token-${tokenId}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-[1px] flex items-center justify-center p-4 overflow-y-auto">
      <div className="w-full max-w-2xl rounded-2xl bg-white border border-slate-200 shadow-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between no-print">
          <h3 className="font-display text-base font-bold text-slate-900">
            Digital Certificate of Occupancy / Deed Record
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 sm:p-8 bg-[#FAFDF8]">
          <div className="rounded-xl bg-white border border-emerald-200 p-6 sm:p-8 space-y-6">
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 pb-5">
              <div className="flex items-center gap-3">
                <img
                  src={ANAGU_LOGO_URL}
                  alt="ANAGU Seal"
                  referrerPolicy="no-referrer"
                  className="w-11 h-11 object-contain"
                />
                <div>
                  <div className="font-display font-bold text-lg text-slate-900">
                    ANAGU Land Administration
                  </div>
                  <div className="text-xs text-emerald-700 font-medium">
                    Verified Cadastral Title Certificate · Polygon Amoy (80002)
                  </div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-[11px] text-slate-500">NFT Token ID</div>
                <div className="font-mono-tabular text-lg font-bold text-emerald-700">
                  #{tokenId}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div>
                <div className="text-slate-500">Parcel Identifier</div>
                <div className="font-mono-tabular font-semibold text-slate-900 mt-0.5">
                  {parcelCode}
                </div>
              </div>
              <div>
                <div className="text-slate-500">Registered Proprietor</div>
                <div className="font-semibold text-slate-900 mt-0.5">{ownerName}</div>
              </div>
              <div className="sm:col-span-2">
                <div className="text-slate-500">Proprietor Wallet Address</div>
                <div className="font-mono-tabular text-slate-900 mt-0.5 break-all">
                  {ownerWallet}
                </div>
              </div>
              <div>
                <div className="text-slate-500">Jurisdiction / Location</div>
                <div className="text-slate-900 mt-0.5">
                  {[parcel.address, parcel.lga_name, parcel.state_name].filter(Boolean).join(', ') || '—'}
                </div>
              </div>
              <div>
                <div className="text-slate-500">Surveyed Area &amp; Tenure</div>
                <div className="font-mono-tabular text-slate-900 mt-0.5">
                  {parcel.area_sqm ? `${formatNumber(parcel.area_sqm)} sqm` : '—'} · {parcel.tenure_type || 'Statutory'}
                </div>
              </div>
              <div className="sm:col-span-2">
                <div className="text-slate-500">PostGIS Spatial Hash</div>
                <div className="font-mono-tabular text-slate-700 mt-0.5 break-all">
                  {parcel.spatial_hash || landTitle?.spatial_hash || '—'}
                </div>
              </div>
              <div className="sm:col-span-2">
                <div className="text-slate-500">Metadata URI Standard</div>
                <div className="font-mono-tabular text-emerald-700 mt-0.5 break-all">
                  {metadataUri}
                </div>
              </div>
              <div>
                <div className="text-slate-500">LandTitleNFT Contract</div>
                <div className="font-mono-tabular text-slate-700 mt-0.5 break-all">
                  {CONTRACT_ADDRESSES.LandTitleNFT}
                </div>
              </div>
              <div>
                <div className="text-slate-500">Issued / Recorded At</div>
                <div className="font-mono-tabular text-slate-900 mt-0.5">
                  {formatDateTime(landTitle?.issued_at || parcel.updated_at)}
                </div>
              </div>
            </div>

            {txHash && (
              <div className="pt-4 border-t border-slate-100 flex items-center justify-between gap-3 text-xs">
                <span className="font-mono-tabular text-slate-500 truncate">
                  Tx: {txHash}
                </span>
                <a
                  href={`${POLYGON_AMOY_EXPLORER}/tx/${txHash}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-emerald-700 hover:text-emerald-800 font-medium inline-flex items-center gap-1 shrink-0"
                >
                  PolygonScan <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            )}
          </div>
        </div>

        <div className="px-6 py-4 border-t border-slate-200 bg-white flex flex-wrap items-center justify-end gap-3 no-print">
          <button
            type="button"
            onClick={handleDownloadJson}
            className="px-4 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-800 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            Download Deed JSON
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
          >
            <Printer className="w-3.5 h-3.5" />
            Print / Save PDF
          </button>
        </div>
      </div>
    </div>
  );
}
