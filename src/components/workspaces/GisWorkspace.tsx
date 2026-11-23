import { useState } from 'react';
import { AlertTriangle, CheckCircle2, Compass, Play } from 'lucide-react';
import { apiFetch, formatDateTime, formatNumber } from '../../lib/api';
import { LeafletParcelMap } from '../LeafletParcelMap';
import { ParcelSelectorBar } from '../ParcelSelectorBar';
import type { OverlapCheckResponse, ParcelRecord } from '../../types/registrar';

interface GisWorkspaceProps {
  parcels: ParcelRecord[];
  selectedParcelId: string | null;
  onSelectParcel: (id: string) => void;
  onRefresh: () => void;
}

export function GisWorkspace({
  parcels,
  selectedParcelId,
  onSelectParcel,
  onRefresh,
}: GisWorkspaceProps) {
  const [bufferMeters, setBufferMeters] = useState(0.5);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<OverlapCheckResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const parcel = parcels.find((p) => p.id === selectedParcelId) || parcels[0] || null;

  const handleRunOverlapCheck = async () => {
    if (!parcel) return;
    setRunning(true);
    setError(null);
    try {
      const res = await apiFetch<OverlapCheckResponse>('/api/registrar/gis/check-overlap', {
        method: 'POST',
        body: JSON.stringify({
          parcelId: parcel.id,
          bufferMeters,
        }),
      });
      setResult(res);
      onRefresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="space-y-5">
      <ParcelSelectorBar
        parcels={parcels}
        selectedParcelId={parcel?.id || null}
        onSelectParcel={(id) => {
          onSelectParcel(id);
          setResult(null);
          setError(null);
        }}
        label="Parcel Geometry for PostGIS Boundary Verification"
      />

      {!parcel ? (
        <div className="rounded-2xl bg-white border border-slate-200 p-8 text-center text-sm text-slate-500">
          No parcels loaded from Supabase yet.
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
          {/* Interactive Leaflet Map */}
          <div className="xl:col-span-8 rounded-2xl bg-white border border-slate-200 shadow-sm p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-display text-base font-bold text-slate-900">
                  WGS84 Cadastral Polygon &amp; OpenStreetMap Overlay
                </h2>
                <p className="text-xs text-slate-500">
                  Green polygon shows target parcel; dashed crimson polygons highlight PostGIS boundary overlaps.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <label htmlFor="buffer-meters" className="text-xs text-slate-600 whitespace-nowrap">
                  Buffer (m)
                </label>
                <input
                  id="buffer-meters"
                  type="number"
                  step="0.1"
                  min="0"
                  max="50"
                  value={bufferMeters}
                  onChange={(e) => setBufferMeters(Number(e.target.value))}
                  className="w-20 px-2.5 py-1.5 rounded-xl border border-slate-200 bg-[#FAFDF8] text-xs font-mono-tabular text-slate-900"
                />
                <button
                  type="button"
                  disabled={running}
                  onClick={handleRunOverlapCheck}
                  className="px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 disabled:opacity-60 text-white text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                >
                  <Play className="w-3.5 h-3.5" />
                  {running ? 'Running PostGIS Check…' : 'Run Overlap Check'}
                </button>
              </div>
            </div>

            <LeafletParcelMap
              geojson={parcel.geojson}
              boundaryCoordinates={parcel.boundary_coordinates}
              centroidLat={result?.centroid?.lat ?? parcel.centroid_lat}
              centroidLng={result?.centroid?.lng ?? parcel.centroid_lng}
              parcelLabel={parcel.parcel_code || parcel.parcel_id || parcel.id}
              neighbors={result?.neighbors || []}
              heightClass="h-[460px]"
            />
          </div>

          {/* Spatial Telemetry & PostGIS Result Panel */}
          <div className="xl:col-span-4 space-y-4">
            <div className="rounded-2xl bg-white border border-slate-200 shadow-sm p-5 space-y-4">
              <div className="flex items-center gap-2 text-sm font-display font-bold text-slate-900">
                <Compass className="w-4 h-4 text-emerald-700" />
                <span>Spatial Telemetry</span>
              </div>

              <dl className="space-y-3 text-xs">
                <div>
                  <dt className="text-slate-500">Measured Area</dt>
                  <dd className="font-mono-tabular font-semibold text-slate-900 text-sm mt-0.5">
                    {formatNumber(result?.areaSqm ?? parcel.area_sqm)} sqm
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500">WGS84 Centroid</dt>
                  <dd className="font-mono-tabular text-slate-900 mt-0.5">
                    {(result?.centroid?.lat ?? parcel.centroid_lat) != null
                      ? `${result?.centroid?.lat ?? parcel.centroid_lat}, ${result?.centroid?.lng ?? parcel.centroid_lng}`
                      : 'Calculated upon overlap scan'}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500">Keccak256 Spatial Hash</dt>
                  <dd className="font-mono-tabular text-slate-700 mt-0.5 break-all">
                    {result?.spatialHash || parcel.spatial_hash || 'Pending generation'}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500">PostGIS RPC Function</dt>
                  <dd className="font-mono-tabular text-emerald-700 mt-0.5">
                    check_parcel_overlap(input_geom, {bufferMeters})
                  </dd>
                </div>
              </dl>
            </div>

            {error && (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-xs text-rose-800">
                {error}
              </div>
            )}

            {result && (
              <div
                className={`rounded-2xl border p-5 space-y-3 ${
                  result.hasOverlap
                    ? 'border-rose-200 bg-rose-50'
                    : 'border-emerald-200 bg-[#F3FDE9]'
                }`}
              >
                <div className="flex items-center gap-2 text-sm font-bold">
                  {result.hasOverlap ? (
                    <>
                      <AlertTriangle className="w-4 h-4 text-rose-700" />
                      <span className="text-rose-900">
                        Boundary Overlap Detected ({result.neighbors.length})
                      </span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4 text-emerald-700" />
                      <span className="text-emerald-900">
                        No Neighbor Overlap ({result.bufferMeters}m Buffer Clear)
                      </span>
                    </>
                  )}
                </div>

                <div className="text-[11px] font-mono-tabular text-slate-600">
                  Checked at {formatDateTime(result.checkedAt)}
                </div>

                {result.neighbors.length > 0 && (
                  <ul className="divide-y divide-rose-200/70 text-xs pt-2">
                    {result.neighbors.map((n, idx) => (
                      <li key={`${n.parcel_id}-${idx}`} className="py-2">
                        <div className="font-mono-tabular font-semibold text-rose-900">
                          {n.parcel_code || n.parcel_id}
                        </div>
                        <div className="text-rose-800 mt-0.5">
                          {n.title || 'Neighboring Parcel'} ·{' '}
                          {n.overlap_area_sqm != null
                            ? `${formatNumber(n.overlap_area_sqm)} sqm overlap`
                            : 'Within 0.5m tolerance'}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
