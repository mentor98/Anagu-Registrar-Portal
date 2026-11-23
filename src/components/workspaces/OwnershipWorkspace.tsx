import { useEffect, useState } from 'react';
import { Scale } from 'lucide-react';
import { apiFetch, formatDateTime } from '../../lib/api';
import { ParcelSelectorBar } from '../ParcelSelectorBar';
import { StatusText } from '../StatusText';
import type { OwnershipVerification, ParcelRecord } from '../../types/registrar';

interface OwnershipWorkspaceProps {
  parcels: ParcelRecord[];
  selectedParcelId: string | null;
  onSelectParcel: (id: string) => void;
  onRefresh: () => void;
}

export function OwnershipWorkspace({
  parcels,
  selectedParcelId,
  onSelectParcel,
  onRefresh,
}: OwnershipWorkspaceProps) {
  const [statutoryScore, setStatutoryScore] = useState(80);
  const [customaryScore, setCustomaryScore] = useState(75);
  const [communityAffidavit, setCommunityAffidavit] = useState('');
  const [conflictNotes, setConflictNotes] = useState('');
  const [status, setStatus] = useState<'VERIFIED' | 'CONFLICT_DETECTED' | 'PENDING_AUDIT' | 'REJECTED'>('PENDING_AUDIT');
  const [existing, setExisting] = useState<OwnershipVerification | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const parcel = parcels.find((p) => p.id === selectedParcelId) || parcels[0] || null;

  useEffect(() => {
    if (!parcel?.id) return;
    let active = true;
    setLoading(true);
    setFeedback(null);
    setError(null);

    apiFetch<{ ownershipVerification: OwnershipVerification | null }>(
      `/api/registrar/parcels/${parcel.id}`
    )
      .then((res) => {
        if (!active) return;
        const ov = res.ownershipVerification;
        setExisting(ov);
        if (ov) {
          setStatutoryScore(ov.statutory_score ?? 0);
          setCustomaryScore(ov.customary_score ?? 0);
          setCommunityAffidavit(ov.community_affidavit || '');
          setConflictNotes(ov.conflict_notes || '');
          setStatus((ov.status as typeof status) || 'PENDING_AUDIT');
        } else {
          setStatutoryScore(0);
          setCustomaryScore(0);
          setCommunityAffidavit('');
          setConflictNotes('');
          setStatus('PENDING_AUDIT');
        }
      })
      .catch((err) => {
        if (active) setError((err as Error).message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [parcel?.id]);

  const handleSave = async () => {
    if (!parcel) return;
    setSaving(true);
    setFeedback(null);
    setError(null);
    try {
      const res = await apiFetch<{ ownershipVerification: OwnershipVerification }>(
        `/api/registrar/parcels/${parcel.id}/ownership-verification`,
        {
          method: 'POST',
          body: JSON.stringify({
            statutoryScore,
            customaryScore,
            communityAffidavit,
            conflictNotes,
            status,
          }),
        }
      );
      setExisting(res.ownershipVerification);
      setFeedback(`Dual-tenure verification saved (${status}).`);
      onRefresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <ParcelSelectorBar
        parcels={parcels}
        selectedParcelId={parcel?.id || null}
        onSelectParcel={onSelectParcel}
        label="Parcel Dual-Tenure Ownership Verification"
      />

      {!parcel ? (
        <div className="rounded-2xl bg-white border border-slate-200 p-8 text-center text-sm text-slate-500">
          Select or load a parcel to inspect dual-tenure ownership scores.
        </div>
      ) : loading ? (
        <div className="rounded-2xl bg-white border border-slate-200 p-8 text-center text-sm text-slate-500">
          Loading ownership_verifications record…
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-8 rounded-2xl bg-white border border-slate-200 shadow-sm p-6 space-y-6">
            <div className="flex items-center justify-between gap-3 border-b border-slate-200 pb-4">
              <div className="flex items-center gap-2">
                <Scale className="w-5 h-5 text-emerald-700" />
                <div>
                  <h2 className="font-display text-base font-bold text-slate-900">
                    Dual-Tenure Statutory &amp; Customary Scoring
                  </h2>
                  <p className="text-xs text-slate-500">
                    Evaluate statutory title chain alongside community customary affidavits (0–100 scale)
                  </p>
                </div>
              </div>
              <StatusText status={existing?.status || status} />
            </div>

            {feedback && (
              <div className="rounded-xl border border-emerald-200 bg-[#F3FDE9] px-4 py-2.5 text-xs text-emerald-900">
                {feedback}
              </div>
            )}
            {error && (
              <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-xs text-rose-800">
                {error}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div className="p-4 rounded-xl bg-[#FAFDF8] border border-slate-200 space-y-3">
                <div className="flex items-center justify-between">
                  <label htmlFor="statutory-score" className="text-xs font-semibold text-slate-800">
                    Statutory Score
                  </label>
                  <span className="font-mono-tabular text-sm font-bold text-emerald-700">
                    {statutoryScore} / 100
                  </span>
                </div>
                <input
                  id="statutory-score"
                  type="range"
                  min={0}
                  max={100}
                  value={statutoryScore}
                  onChange={(e) => setStatutoryScore(Number(e.target.value))}
                  className="w-full accent-emerald-700 cursor-pointer"
                />
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={statutoryScore}
                  onChange={(e) => setStatutoryScore(Math.max(0, Math.min(100, Number(e.target.value))))}
                  className="w-full px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-mono-tabular text-slate-900"
                />
              </div>

              <div className="p-4 rounded-xl bg-[#FAFDF8] border border-slate-200 space-y-3">
                <div className="flex items-center justify-between">
                  <label htmlFor="customary-score" className="text-xs font-semibold text-slate-800">
                    Customary Score
                  </label>
                  <span className="font-mono-tabular text-sm font-bold text-emerald-700">
                    {customaryScore} / 100
                  </span>
                </div>
                <input
                  id="customary-score"
                  type="range"
                  min={0}
                  max={100}
                  value={customaryScore}
                  onChange={(e) => setCustomaryScore(Number(e.target.value))}
                  className="w-full accent-emerald-700 cursor-pointer"
                />
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={customaryScore}
                  onChange={(e) => setCustomaryScore(Math.max(0, Math.min(100, Number(e.target.value))))}
                  className="w-full px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-mono-tabular text-slate-900"
                />
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label htmlFor="community-affidavit" className="block text-xs font-medium text-slate-700 mb-1.5">
                  Community / Traditional Council Affidavit Reference
                </label>
                <textarea
                  id="community-affidavit"
                  rows={2}
                  value={communityAffidavit}
                  onChange={(e) => setCommunityAffidavit(e.target.value)}
                  placeholder="Enter sworn customary affidavit ID, family head attestation, or council seal ref…"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-[#FAFDF8] text-xs text-slate-900"
                />
              </div>

              <div>
                <label htmlFor="conflict-notes" className="block text-xs font-medium text-slate-700 mb-1.5">
                  Conflict / Encumbrance Notes
                </label>
                <textarea
                  id="conflict-notes"
                  rows={3}
                  value={conflictNotes}
                  onChange={(e) => setConflictNotes(e.target.value)}
                  placeholder="Document any competing family claims, litigation caveats, or boundary disputes…"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-[#FAFDF8] text-xs text-slate-900"
                />
              </div>

              <div>
                <span className="block text-xs font-medium text-slate-700 mb-1.5">
                  Ownership Determination Status
                </span>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {(['VERIFIED', 'CONFLICT_DETECTED', 'PENDING_AUDIT', 'REJECTED'] as const).map((st) => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => setStatus(st)}
                      className={`px-3 py-2 rounded-xl text-[11px] font-semibold border transition-colors cursor-pointer ${
                        status === st
                          ? 'bg-emerald-700 border-emerald-700 text-white'
                          : 'bg-[#FAFDF8] border-slate-200 text-slate-700 hover:bg-white'
                      }`}
                    >
                      {st.replace(/_/g, ' ')}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="button"
                disabled={saving}
                onClick={handleSave}
                className="px-5 py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 disabled:opacity-60 text-white text-xs font-semibold cursor-pointer"
              >
                {saving ? 'Saving Verification…' : 'Save Dual-Tenure Verification'}
              </button>
            </div>
          </div>

          <div className="lg:col-span-4 rounded-2xl bg-white border border-slate-200 shadow-sm p-5 space-y-4">
            <h3 className="font-display text-sm font-bold text-slate-900">
              Verification Summary
            </h3>
            <dl className="space-y-3 text-xs">
              <div>
                <dt className="text-slate-500">Declared Tenure Type</dt>
                <dd className="font-medium text-slate-900 mt-0.5">
                  {parcel.tenure_type || 'Statutory / Customary Dual'}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Composite Confidence</dt>
                <dd className="font-mono-tabular font-bold text-emerald-700 text-lg mt-0.5">
                  {Math.round((statutoryScore + customaryScore) / 2)}%
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Verified By Staff</dt>
                <dd className="font-mono-tabular text-slate-900 mt-0.5">
                  {existing?.verified_by || 'Pending final sign-off'}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Last Updated</dt>
                <dd className="font-mono-tabular text-slate-600 mt-0.5">
                  {formatDateTime(existing?.updated_at || existing?.created_at)}
                </dd>
              </div>
            </dl>
          </div>
        </div>
      )}
    </div>
  );
}
