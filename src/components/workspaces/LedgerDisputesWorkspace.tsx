import { useEffect, useState } from 'react';
import {
  Award,
  ExternalLink,
  Lock,
  ShieldAlert,
  Unlock,
} from 'lucide-react';
import { apiFetch, formatDateTime, truncateAddress } from '../../lib/api';
import { CONTRACT_ADDRESSES, POLYGON_AMOY_EXPLORER } from '../../lib/contracts';
import { CertificateModal } from '../CertificateModal';
import { StatusText } from '../StatusText';
import type {
  LandTitleRecord,
  ParcelRecord,
  SupportTicket,
} from '../../types/registrar';

interface LedgerDisputesWorkspaceProps {
  parcels: ParcelRecord[];
  selectedParcelId: string | null;
  onSelectParcel: (id: string) => void;
  onRefresh: () => void;
}

export function LedgerDisputesWorkspace({
  parcels,
  selectedParcelId,
  onSelectParcel,
  onRefresh,
}: LedgerDisputesWorkspaceProps) {
  const [titles, setTitles] = useState<LandTitleRecord[]>([]);
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [subView, setSubView] = useState<'ledger' | 'disputes'>('ledger');
  const [disputeParcelId, setDisputeParcelId] = useState(selectedParcelId || '');
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState('high');
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tokenLookup, setTokenLookup] = useState<Record<string, unknown> | null>(null);
  const [certificateTarget, setCertificateTarget] = useState<{
    parcel: ParcelRecord;
    title: LandTitleRecord;
  } | null>(null);

  const loadLedger = async () => {
    setLoading(true);
    try {
      const res = await apiFetch<{
        titles: LandTitleRecord[];
        tickets: SupportTicket[];
      }>('/api/registrar/ledger');
      setTitles(res.titles || []);
      setTickets(res.tickets || []);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLedger();
  }, []);

  useEffect(() => {
    if (selectedParcelId) {
      setDisputeParcelId(selectedParcelId);
    } else if (parcels.length > 0 && !disputeParcelId) {
      setDisputeParcelId(parcels[0].id);
    }
  }, [selectedParcelId, parcels]);

  const handleDisputeAction = async (parcelId: string, action: 'lock' | 'unlock') => {
    if (!parcelId) return;
    setBusy(true);
    setError(null);
    setFeedback(null);
    try {
      await apiFetch(`/api/registrar/parcels/${parcelId}/dispute`, {
        method: 'POST',
        body: JSON.stringify({
          action,
          subject: subject.trim() || 'Cadastral Boundary / Ownership Dispute',
          description: description.trim(),
          priority,
        }),
      });
      setFeedback(
        action === 'lock'
          ? 'Dispute ticket opened and parcel/title escrow-locked.'
          : 'Dispute resolved and parcel/title unlocked.'
      );
      setSubject('');
      setDescription('');
      await loadLedger();
      onRefresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const handleInspectOnChainToken = async (tokenId: string | number) => {
    setError(null);
    try {
      const res = await apiFetch<Record<string, unknown>>(
        `/api/blockchain/token/${encodeURIComponent(String(tokenId))}`
      );
      setTokenLookup(res);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <div className="space-y-5">
      {/* Sub-view Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 p-1 rounded-2xl bg-[#FAFDF8] border border-slate-200">
          <button
            type="button"
            onClick={() => setSubView('ledger')}
            className={`px-4 py-1.5 rounded-xl text-xs font-semibold cursor-pointer ${
              subView === 'ledger' ? 'bg-emerald-700 text-white' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            C-of-O &amp; NFT Registry Ledger ({titles.length})
          </button>
          <button
            type="button"
            onClick={() => setSubView('disputes')}
            className={`px-4 py-1.5 rounded-xl text-xs font-semibold cursor-pointer ${
              subView === 'disputes' ? 'bg-emerald-700 text-white' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Dispute Flagging &amp; Escrow Locks ({tickets.length})
          </button>
        </div>

        <span className="text-xs font-mono-tabular text-slate-500">
          NFT Contract: {truncateAddress(CONTRACT_ADDRESSES.LandTitleNFT)}
        </span>
      </div>

      {feedback && (
        <div className="rounded-xl border border-emerald-200 bg-[#F3FDE9] px-4 py-3 text-xs text-emerald-900">
          {feedback}
        </div>
      )}
      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-800">
          {error}
        </div>
      )}

      {subView === 'ledger' ? (
        <div className="space-y-5">
          {tokenLookup && (
            <div className="rounded-2xl border border-emerald-200 bg-[#FAFDF8] p-4 text-xs space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-emerald-900">
                  Live On-Chain LandTitleNFT #{String(tokenLookup.tokenId)}
                </span>
                <button
                  type="button"
                  onClick={() => setTokenLookup(null)}
                  className="text-slate-500 hover:text-slate-900 cursor-pointer"
                >
                  Dismiss
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 font-mono-tabular text-[11px] text-slate-700">
                <div>Owner: {truncateAddress(String(tokenLookup.owner), 8, 6)}</div>
                <div>Revoked: {tokenLookup.isRevoked ? 'YES' : 'NO'}</div>
                <div>URI: {String(tokenLookup.uri || '—')}</div>
              </div>
            </div>
          )}

          <div className="rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200">
              <h2 className="font-display text-base font-bold text-slate-900">
                Issued Land Titles &amp; C-of-O Ledger (land_titles)
              </h2>
            </div>

            {loading ? (
              <div className="p-8 text-center text-sm text-slate-500">
                Loading registry ledger…
              </div>
            ) : titles.length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-500">
                No minted land titles recorded in land_titles yet.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 bg-[#FAFDF8] text-[11px] font-semibold text-slate-500">
                      <th className="py-3 px-4">Token ID</th>
                      <th className="py-3 px-4">Parcel</th>
                      <th className="py-3 px-4">Holder / Wallet</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4">Issued</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {titles.map((t) => {
                      const matchedParcel = parcels.find((p) => p.id === t.parcel_id);
                      return (
                        <tr key={t.id} className="hover:bg-[#FAFDF8]">
                          <td className="py-3 px-4 font-mono-tabular font-bold text-emerald-700 whitespace-nowrap">
                            #{t.token_id}
                          </td>
                          <td className="py-3 px-4">
                            <div className="font-mono-tabular font-medium text-slate-900">
                              {matchedParcel?.parcel_code || matchedParcel?.parcel_id || t.parcel_id.slice(0, 8)}
                            </div>
                            <div className="text-[11px] text-slate-500 truncate max-w-[180px]">
                              {matchedParcel?.title || '—'}
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <div className="font-medium text-slate-900">{t.owner_name || '—'}</div>
                            <div className="font-mono-tabular text-[11px] text-slate-500">
                              {truncateAddress(t.owner_wallet)}
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <StatusText status={t.status} />
                          </td>
                          <td className="py-3 px-4 font-mono-tabular text-slate-500 whitespace-nowrap">
                            {formatDateTime(t.issued_at || t.created_at)}
                          </td>
                          <td className="py-3 px-4 text-right whitespace-nowrap">
                            <div className="inline-flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => handleInspectOnChainToken(t.token_id)}
                                className="px-2.5 py-1 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 font-medium cursor-pointer"
                              >
                                Verify On-Chain
                              </button>
                              {matchedParcel && (
                                <button
                                  type="button"
                                  onClick={() => setCertificateTarget({ parcel: matchedParcel, title: t })}
                                  className="px-2.5 py-1 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white font-medium inline-flex items-center gap-1 cursor-pointer"
                                >
                                  <Award className="w-3 h-3" /> Deed
                                </button>
                              )}
                              {t.last_tx_hash && (
                                <a
                                  href={`${POLYGON_AMOY_EXPLORER}/tx/${t.last_tx_hash}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-emerald-700 hover:text-emerald-800 p-1"
                                  aria-label="Open on PolygonScan"
                                >
                                  <ExternalLink className="w-3.5 h-3.5" />
                                </a>
                              )}
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
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
          {/* Flag Dispute & Lock Escrow Form */}
          <div className="xl:col-span-5 rounded-2xl bg-white border border-slate-200 shadow-sm p-5 space-y-4">
            <div className="flex items-center gap-2 text-sm font-display font-bold text-slate-900">
              <ShieldAlert className="w-4 h-4 text-rose-700" />
              <span>Flag Conflict &amp; Lock Parcel Escrow</span>
            </div>
            <p className="text-xs text-slate-500">
              Opening a dispute creates a support_tickets record, sets parcels.status = &apos;disputed&apos;, and locks land_titles.status = &apos;ESCROW_LOCKED&apos;.
            </p>

            <div className="space-y-3 text-xs">
              <div>
                <label htmlFor="dispute-parcel" className="block font-medium text-slate-700 mb-1">
                  Target Parcel
                </label>
                <select
                  id="dispute-parcel"
                  value={disputeParcelId}
                  onChange={(e) => {
                    setDisputeParcelId(e.target.value);
                    onSelectParcel(e.target.value);
                  }}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-[#FAFDF8] text-slate-900"
                >
                  {parcels.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.parcel_code || p.parcel_id || p.id.slice(0, 8)} — {p.title || p.address || 'Parcel'} ({p.status})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="dispute-subject" className="block font-medium text-slate-700 mb-1">
                  Dispute Subject
                </label>
                <input
                  id="dispute-subject"
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="e.g. Overlapping boundary beacon claim by adjacent holder"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-[#FAFDF8] text-slate-900"
                />
              </div>

              <div>
                <label htmlFor="dispute-priority" className="block font-medium text-slate-700 mb-1">
                  Priority
                </label>
                <select
                  id="dispute-priority"
                  value={priority}
                  onChange={(e) => setPriority(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-[#FAFDF8] text-slate-900"
                >
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="critical">Critical</option>
                </select>
              </div>

              <div>
                <label htmlFor="dispute-description" className="block font-medium text-slate-700 mb-1">
                  Investigation Details / Resolution Notes
                </label>
                <textarea
                  id="dispute-description"
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Provide court injunction reference, survey overlap evidence, or resolution confirmation…"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-[#FAFDF8] text-slate-900"
                />
              </div>

              <div className="flex flex-wrap gap-2 pt-1">
                <button
                  type="button"
                  disabled={busy || !disputeParcelId}
                  onClick={() => handleDisputeAction(disputeParcelId, 'lock')}
                  className="px-4 py-2 rounded-xl bg-rose-700 hover:bg-rose-800 disabled:opacity-60 text-white font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <Lock className="w-3.5 h-3.5" />
                  Flag &amp; Lock Parcel
                </button>
                <button
                  type="button"
                  disabled={busy || !disputeParcelId}
                  onClick={() => handleDisputeAction(disputeParcelId, 'unlock')}
                  className="px-4 py-2 rounded-xl border border-emerald-700 text-emerald-700 hover:bg-[#F3FDE9] disabled:opacity-60 font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <Unlock className="w-3.5 h-3.5" />
                  Resolve &amp; Unlock
                </button>
              </div>
            </div>
          </div>

          {/* Dispute Tickets Table */}
          <div className="xl:col-span-7 rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200">
              <h2 className="font-display text-base font-bold text-slate-900">
                Active &amp; Historical Dispute Tickets (support_tickets)
              </h2>
            </div>

            {tickets.length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-500">
                No dispute tickets recorded.
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {tickets.map((t) => (
                  <div key={t.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-slate-900">{t.subject}</span>
                        <StatusText status={t.status} />
                      </div>
                      {t.description && (
                        <p className="text-slate-600">{t.description}</p>
                      )}
                      <div className="text-[11px] font-mono-tabular text-slate-400">
                        Parcel: {t.parcel_id?.slice(0, 8) || '—'} · Priority: {t.priority || 'normal'} · {formatDateTime(t.created_at)}
                      </div>
                    </div>

                    {t.parcel_id && t.status !== 'resolved' && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => handleDisputeAction(t.parcel_id!, 'unlock')}
                        className="px-3 py-1.5 rounded-lg border border-emerald-700 text-emerald-700 hover:bg-[#F3FDE9] font-semibold whitespace-nowrap cursor-pointer"
                      >
                        Resolve &amp; Unlock
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {certificateTarget && (
        <CertificateModal
          parcel={certificateTarget.parcel}
          landTitle={certificateTarget.title}
          onClose={() => setCertificateTarget(null)}
        />
      )}
    </div>
  );
}
