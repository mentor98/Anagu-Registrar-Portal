import { formatNumber, truncateAddress } from '../lib/api';
import { StatusText } from './StatusText';
import type { ParcelRecord } from '../types/registrar';

interface ParcelSelectorBarProps {
  parcels: ParcelRecord[];
  selectedParcelId: string | null;
  onSelectParcel: (id: string) => void;
  label?: string;
}

export function ParcelSelectorBar({
  parcels,
  selectedParcelId,
  onSelectParcel,
  label = 'Active Parcel Dossier',
}: ParcelSelectorBarProps) {
  const active = parcels.find((p) => p.id === selectedParcelId) || parcels[0] || null;

  return (
    <div className="rounded-2xl bg-white border border-slate-200 shadow-sm p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
      <div className="min-w-0 flex-1">
        <label htmlFor="parcel-dossier-select" className="block text-xs font-medium text-slate-500 mb-1">
          {label}
        </label>
        <select
          id="parcel-dossier-select"
          value={active?.id || ''}
          onChange={(e) => onSelectParcel(e.target.value)}
          className="w-full md:max-w-xl px-3 py-2 rounded-xl border border-slate-200 bg-[#FAFDF8] text-sm font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-700/20 focus:border-emerald-700"
        >
          {parcels.length === 0 ? (
            <option value="">No parcels available</option>
          ) : (
            parcels.map((p) => {
              const code = p.parcel_code || p.parcel_id || p.id.slice(0, 8);
              return (
                <option key={p.id} value={p.id}>
                  {code} — {p.title || p.address || 'Untitled Parcel'} ({p.state_name || 'Registry'})
                </option>
              );
            })
          )}
        </select>
      </div>

      {active && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-slate-600 shrink-0">
          <StatusText status={active.status} />
          <span className="text-slate-300" aria-hidden="true">·</span>
          <span className="font-mono-tabular">
            {active.area_sqm ? `${formatNumber(active.area_sqm)} sqm` : 'Area N/A'}
          </span>
          <span className="text-slate-300" aria-hidden="true">·</span>
          <span className="font-mono-tabular">
            Owner: {truncateAddress(active.owner_wallet)}
          </span>
          {active.nft_token_id != null && (
            <>
              <span className="text-slate-300" aria-hidden="true">·</span>
              <span className="font-mono-tabular text-emerald-700 font-semibold">
                Token #{active.nft_token_id}
              </span>
            </>
          )}
        </div>
      )}
    </div>
  );
}
