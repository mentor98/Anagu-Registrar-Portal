import { useState } from 'react';
import {
  CheckCircle2,
  ExternalLink,
  Trash2,
  UserCheck,
} from 'lucide-react';
import { apiFetch, formatDateTime, formatNumber, truncateAddress } from '../../lib/api';
import { StatusText } from '../StatusText';
import type {
  ApplicationAssignment,
  ParcelRecord,
  RegistrarTab,
  StaffProfile,
} from '../../types/registrar';

interface IntakeWorkspaceProps {
  parcels: ParcelRecord[];
  assignments: ApplicationAssignment[];
  selectedParcelId: string | null;
  staff: StaffProfile;
  onSelectParcel: (id: string) => void;
  onNavigateTab: (tab: RegistrarTab) => void;
  onRefresh: () => void;
}

const STATUS_FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'pending_audit', label: 'Pending Audit' },
  { id: 'under_review', label: 'Under Review' },
  { id: 'governor_consent', label: 'Governor Consent' },
  { id: 'verified', label: 'Verified' },
  { id: 'disputed', label: 'Disputed' },
  { id: 'rejected', label: 'Rejected' },
];

export function IntakeWorkspace({
  parcels,
  assignments,
  selectedParcelId,
  staff,
  onSelectParcel,
  onNavigateTab,
  onRefresh,
}: IntakeWorkspaceProps) {
  const [filter, setFilter] = useState('all');
  const [statusNote, setStatusNote] = useState('');
  const [assignStaffId, setAssignStaffId] = useState(staff.staff_id);
  const [assignPriority, setAssignPriority] = useState('normal');
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const filteredParcels = parcels.filter((p) => {
    if (filter === 'all') return true;
    if (filter === 'governor_consent') {
      return p.governor_consent_status === 'GOVERNOR_CONSENT_PENDING';
    }
    return p.status === filter;
  });

  const activeParcel =
    filteredParcels.find((p) => p.id === selectedParcelId) ||
    parcels.find((p) => p.id === selectedParcelId) ||
    filteredParcels[0] ||
    null;

  const parcelAssignments = activeParcel
    ? assignments.filter((a) => a.parcel_id === activeParcel.id)
    : [];

  const handleStatusUpdate = async (newStatus: string) => {
    if (!activeParcel) return;
    setBusy(true);
    setFeedback(null);
    try {
      await apiFetch(`/api/registrar/parcels/${activeParcel.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({
          status: newStatus,
          notes: statusNote.trim() || activeParcel.notes,
        }),
      });
      setFeedback({ type: 'ok', text: `Parcel status updated to "${newStatus}".` });
      onRefresh();
    } catch (err) {
      setFeedback({ type: 'err', text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const handleAssignStaff = async () => {
    if (!activeParcel) return;
    setBusy(true);
    setFeedback(null);
    try {
      await apiFetch(`/api/registrar/parcels/${activeParcel.id}/assign`, {
        method: 'POST',
        body: JSON.stringify({
          assigned_staff_id: assignStaffId.trim().toUpperCase(),
          assigned_role: 'registrar',
          priority: assignPriority,
          notes: statusNote.trim() || undefined,
        }),
      });
      setFeedback({ type: 'ok', text: `Assigned to ${assignStaffId.toUpperCase()}.` });
      onRefresh();
    } catch (err) {
      setFeedback({ type: 'err', text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const handleRejectOrDelete = async () => {
    if (!activeParcel) return;
    setBusy(true);
    setFeedback(null);
    try {
      const res = await apiFetch<{ deleted: boolean; rejected?: boolean }>(
        `/api/registrar/parcels/${activeParcel.id}`,
        {
          method: 'DELETE',
          body: JSON.stringify({
            reason: statusNote.trim() || 'Rejected by Cadastral Registrar during intake triage.',
          }),
        }
      );
      setConfirmDelete(false);
      setFeedback({
        type: 'ok',
        text: res.deleted
          ? 'Invalid submission deleted from registry.'
          : 'Linked submission marked as rejected.',
      });
      onRefresh();
    } catch (err) {
      setFeedback({ type: 'err', text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Segmented Filter Bar */}
      <div className="flex flex-wrap items-center gap-1.5 p-1.5 rounded-2xl bg-[#FAFDF8] border border-slate-200 w-fit">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
              filter === f.id
                ? 'bg-emerald-700 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900 hover:bg-white'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* Applications Table */}
        <div className="xl:col-span-7 rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
            <h2 className="font-display text-base font-bold text-slate-900">
              Cadastral Intake Queue ({filteredParcels.length})
            </h2>
            <span className="text-xs text-slate-500">Select row to triage</span>
          </div>

          {filteredParcels.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500">
              No parcel applications match this filter.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-[#FAFDF8] text-[11px] font-semibold text-slate-500">
                    <th className="py-3 px-4">Parcel ID</th>
                    <th className="py-3 px-4">Applicant</th>
                    <th className="py-3 px-4 text-right">Value (USD)</th>
                    <th className="py-3 px-4">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {filteredParcels.map((p) => {
                    const isSelected = activeParcel?.id === p.id;
                    const code = p.parcel_code || p.parcel_id || p.id.slice(0, 8);
                    return (
                      <tr
                        key={p.id}
                        onClick={() => {
                          onSelectParcel(p.id);
                          setConfirmDelete(false);
                          setFeedback(null);
                        }}
                        className={`cursor-pointer transition-colors ${
                          isSelected ? 'bg-[#F3FDE9]' : 'hover:bg-[#FAFDF8]'
                        }`}
                      >
                        <td className="py-3 px-4 font-mono-tabular font-semibold text-slate-900 whitespace-nowrap">
                          {code}
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-medium text-slate-900 truncate max-w-[180px]">
                            {p.owner_name || p.title || 'Unnamed Holder'}
                          </div>
                          <div className="text-[11px] text-slate-500 truncate max-w-[180px]">
                            {[p.lga_name, p.state_name].filter(Boolean).join(', ') || '—'}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-right font-mono-tabular text-slate-700 whitespace-nowrap">
                          {p.estimated_value_usd != null ? `$${formatNumber(p.estimated_value_usd, 0)}` : '—'}
                        </td>
                        <td className="py-3 px-4">
                          <StatusText
                            status={
                              p.governor_consent_status === 'GOVERNOR_CONSENT_PENDING'
                                ? 'governor_consent_pending'
                                : p.status
                            }
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Triage Inspector Panel */}
        <div className="xl:col-span-5 rounded-2xl bg-white border border-slate-200 shadow-sm p-5 space-y-5">
          {!activeParcel ? (
            <div className="py-12 text-center text-sm text-slate-500">
              Select a parcel application to inspect its applicant profile and triage actions.
            </div>
          ) : (
            <>
              <div className="border-b border-slate-200 pb-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-mono-tabular text-xs font-semibold text-emerald-700">
                      {activeParcel.parcel_code || activeParcel.parcel_id || activeParcel.id}
                    </div>
                    <h3 className="font-display text-lg font-bold text-slate-900 mt-0.5">
                      {activeParcel.title || activeParcel.address || 'Parcel Application'}
                    </h3>
                  </div>
                  <StatusText status={activeParcel.status} />
                </div>

                <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <span className="text-slate-500 block">Applicant Name</span>
                    <span className="font-medium text-slate-900">{activeParcel.owner_name || '—'}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Applicant Contact</span>
                    <span className="text-slate-900 break-all">{activeParcel.owner_email || activeParcel.owner_phone || '—'}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Owner Wallet</span>
                    <span className="font-mono-tabular text-slate-900">
                      {truncateAddress(activeParcel.owner_wallet, 8, 6)}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Submitted</span>
                    <span className="font-mono-tabular text-slate-700">
                      {formatDateTime(activeParcel.created_at)}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Jurisdiction</span>
                    <span className="text-slate-900">
                      {[activeParcel.lga_name, activeParcel.state_name].filter(Boolean).join(', ') || '—'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Area &amp; Land Use</span>
                    <span className="font-mono-tabular text-slate-900">
                      {activeParcel.area_sqm ? `${formatNumber(activeParcel.area_sqm)} sqm` : '—'} · {activeParcel.land_use || 'Mixed'}
                    </span>
                  </div>
                </div>
              </div>

              {feedback && (
                <div
                  className={`rounded-xl border px-3.5 py-2.5 text-xs ${
                    feedback.type === 'ok'
                      ? 'bg-[#F3FDE9] border-emerald-200 text-emerald-900'
                      : 'bg-rose-50 border-rose-200 text-rose-800'
                  }`}
                >
                  {feedback.text}
                </div>
              )}

              {/* Quick Navigation into Inspection Steps */}
              <div className="grid grid-cols-3 gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => onNavigateTab('gis')}
                  className="px-3 py-2 rounded-xl border border-slate-200 hover:bg-[#FAFDF8] text-slate-800 font-medium inline-flex items-center justify-center gap-1 cursor-pointer"
                >
                  GIS Check <ExternalLink className="w-3 h-3" />
                </button>
                <button
                  type="button"
                  onClick={() => onNavigateTab('documents')}
                  className="px-3 py-2 rounded-xl border border-slate-200 hover:bg-[#FAFDF8] text-slate-800 font-medium inline-flex items-center justify-center gap-1 cursor-pointer"
                >
                  Documents <ExternalLink className="w-3 h-3" />
                </button>
                <button
                  type="button"
                  onClick={() => onNavigateTab('minting')}
                  className="px-3 py-2 rounded-xl border border-slate-200 hover:bg-[#FAFDF8] text-slate-800 font-medium inline-flex items-center justify-center gap-1 cursor-pointer"
                >
                  Mint Title <ExternalLink className="w-3 h-3" />
                </button>
              </div>

              {/* Triage Notes & Status Transitions */}
              <div className="space-y-3">
                <label htmlFor="triage-notes" className="block text-xs font-medium text-slate-700">
                  Registrar Triage Notes
                </label>
                <textarea
                  id="triage-notes"
                  rows={2}
                  value={statusNote}
                  onChange={(e) => setStatusNote(e.target.value)}
                  placeholder="Record intake audit observations or rejection reason…"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-[#FAFDF8] text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-700/20 focus:border-emerald-700"
                />

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => handleStatusUpdate('under_review')}
                    className="px-3.5 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 disabled:opacity-60 text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Accept for Audit
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => handleStatusUpdate('pending_audit')}
                    className="px-3 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-medium cursor-pointer"
                  >
                    Return to Pending
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setConfirmDelete((prev) => !prev)}
                    className="px-3 py-2 rounded-xl border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-medium inline-flex items-center gap-1 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Reject / Delete
                  </button>
                </div>

                {confirmDelete && (
                  <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs space-y-2">
                    <p className="text-rose-900 font-medium">
                      Confirm rejecting or removing this parcel submission? Linked records will be marked as rejected.
                    </p>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={handleRejectOrDelete}
                        className="px-3 py-1.5 rounded-lg bg-rose-700 hover:bg-rose-800 text-white font-semibold cursor-pointer"
                      >
                        Confirm Reject / Delete
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDelete(false)}
                        className="px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-slate-700 cursor-pointer"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Staff Assignment */}
              <div className="pt-4 border-t border-slate-200 space-y-3">
                <div className="text-xs font-semibold text-slate-900 flex items-center gap-1.5">
                  <UserCheck className="w-4 h-4 text-emerald-700" />
                  <span>Application Assignment</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <input
                    type="text"
                    value={assignStaffId}
                    onChange={(e) => setAssignStaffId(e.target.value.toUpperCase())}
                    placeholder="REG-1042"
                    className="px-3 py-2 rounded-xl border border-slate-200 bg-[#FAFDF8] text-xs font-mono-tabular text-slate-900"
                  />
                  <select
                    value={assignPriority}
                    onChange={(e) => setAssignPriority(e.target.value)}
                    className="px-3 py-2 rounded-xl border border-slate-200 bg-[#FAFDF8] text-xs text-slate-900"
                  >
                    <option value="normal">Normal Priority</option>
                    <option value="high">High Priority</option>
                    <option value="urgent">Urgent</option>
                  </select>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={handleAssignStaff}
                    className="px-3 py-2 rounded-xl border border-emerald-700 text-emerald-700 hover:bg-[#F3FDE9] text-xs font-semibold cursor-pointer"
                  >
                    Assign Staff
                  </button>
                </div>

                {parcelAssignments.length > 0 && (
                  <div className="space-y-1 text-[11px] text-slate-600">
                    {parcelAssignments.map((a) => (
                      <div key={a.id} className="flex items-center justify-between py-1 border-b border-slate-100 last:border-0">
                        <span className="font-mono-tabular font-medium text-slate-800">
                          {a.assigned_staff_id} · {a.priority || 'normal'}
                        </span>
                        <span className="font-mono-tabular text-slate-400">
                          {formatDateTime(a.created_at)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
