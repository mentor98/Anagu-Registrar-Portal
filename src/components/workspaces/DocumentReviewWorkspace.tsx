import { useEffect, useState } from 'react';
import { ExternalLink, FileCheck2, FileText } from 'lucide-react';
import { apiFetch, formatDateTime } from '../../lib/api';
import { getDocumentPublicUrl } from '../../lib/contracts';
import { ParcelSelectorBar } from '../ParcelSelectorBar';
import { StatusText } from '../StatusText';
import type {
  DocumentReview,
  ParcelRecord,
  StatutoryDocument,
} from '../../types/registrar';

interface DocumentReviewWorkspaceProps {
  parcels: ParcelRecord[];
  selectedParcelId: string | null;
  onSelectParcel: (id: string) => void;
  onRefresh: () => void;
}

export function DocumentReviewWorkspace({
  parcels,
  selectedParcelId,
  onSelectParcel,
  onRefresh,
}: DocumentReviewWorkspaceProps) {
  const [documents, setDocuments] = useState<StatutoryDocument[]>([]);
  const [reviews, setReviews] = useState<DocumentReview[]>([]);
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const [decision, setDecision] = useState<'VERIFIED' | 'NEEDS_CORRECTION' | 'REJECTED'>('VERIFIED');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const parcel = parcels.find((p) => p.id === selectedParcelId) || parcels[0] || null;

  useEffect(() => {
    if (!parcel?.id) return;
    let active = true;
    setLoading(true);
    setError(null);

    apiFetch<{
      documents: StatutoryDocument[];
      documentReviews: DocumentReview[];
    }>(`/api/registrar/parcels/${parcel.id}`)
      .then((res) => {
        if (!active) return;
        setDocuments(res.documents || []);
        setReviews(res.documentReviews || []);
        if (res.documents?.length) {
          setSelectedDocId(res.documents[0].id);
          setNotes(res.documents[0].reviewer_notes || '');
        } else {
          setSelectedDocId(null);
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

  const activeDoc = documents.find((d) => d.id === selectedDocId) || documents[0] || null;
  const publicUrl = activeDoc
    ? activeDoc.file_url || getDocumentPublicUrl(activeDoc.storage_path)
    : null;

  const isImage =
    activeDoc?.mime_type?.startsWith('image/') ||
    /\.(png|jpe?g|webp|gif)$/i.test(publicUrl || '');

  const handleSaveReview = async () => {
    if (!activeDoc || !parcel) return;
    setSaving(true);
    setError(null);
    setFeedback(null);
    try {
      await apiFetch(`/api/registrar/documents/${activeDoc.id}/review`, {
        method: 'POST',
        body: JSON.stringify({
          parcelId: parcel.id,
          status: decision,
          reviewerNotes: notes,
        }),
      });
      setFeedback(`Document review saved as ${decision}.`);
      // Refresh dossier
      const refreshed = await apiFetch<{
        documents: StatutoryDocument[];
        documentReviews: DocumentReview[];
      }>(`/api/registrar/parcels/${parcel.id}`);
      setDocuments(refreshed.documents || []);
      setReviews(refreshed.documentReviews || []);
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
        label="Parcel Statutory & Customary Document Dossier"
      />

      {loading ? (
        <div className="rounded-2xl bg-white border border-slate-200 p-8 text-center text-sm text-slate-500">
          Loading Supabase Storage documents…
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
          {/* Left: Document List & Review Form */}
          <div className="xl:col-span-5 space-y-5">
            <div className="rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
                <h2 className="font-display text-base font-bold text-slate-900">
                  Submitted Documents ({documents.length})
                </h2>
                <span className="text-[11px] font-mono-tabular text-slate-500">
                  bucket: documents
                </span>
              </div>

              {documents.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-500">
                  No statutory or customary documents uploaded for this parcel yet.
                </div>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {documents.map((doc) => {
                    const isSelected = activeDoc?.id === doc.id;
                    return (
                      <li key={doc.id}>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedDocId(doc.id);
                            setNotes(doc.reviewer_notes || '');
                            setFeedback(null);
                          }}
                          className={`w-full text-left px-5 py-3.5 transition-colors cursor-pointer ${
                            isSelected ? 'bg-[#F3FDE9]' : 'hover:bg-[#FAFDF8]'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-semibold text-slate-900 flex items-center gap-2">
                              <FileText className="w-3.5 h-3.5 text-emerald-700" />
                              {doc.document_type.replace(/_/g, ' ').toUpperCase()}
                            </span>
                            <StatusText status={doc.review_status || 'PENDING'} />
                          </div>
                          <div className="text-[11px] text-slate-500 mt-1 truncate">
                            {doc.file_name || doc.storage_path || 'Document file'}
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {activeDoc && (
              <div className="rounded-2xl bg-white border border-slate-200 shadow-sm p-5 space-y-4">
                <div className="flex items-center gap-2 text-sm font-display font-bold text-slate-900">
                  <FileCheck2 className="w-4 h-4 text-emerald-700" />
                  <span>Registrar Document Verdict</span>
                </div>

                {feedback && (
                  <div className="rounded-xl border border-emerald-200 bg-[#F3FDE9] px-3.5 py-2.5 text-xs text-emerald-900">
                    {feedback}
                  </div>
                )}
                {error && (
                  <div className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs text-rose-800">
                    {error}
                  </div>
                )}

                <div className="grid grid-cols-3 gap-2">
                  {(['VERIFIED', 'NEEDS_CORRECTION', 'REJECTED'] as const).map((st) => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => setDecision(st)}
                      className={`px-2.5 py-2 rounded-xl text-[11px] font-semibold border transition-colors cursor-pointer ${
                        decision === st
                          ? 'bg-emerald-700 border-emerald-700 text-white'
                          : 'bg-[#FAFDF8] border-slate-200 text-slate-700 hover:bg-white'
                      }`}
                    >
                      {st.replace(/_/g, ' ')}
                    </button>
                  ))}
                </div>

                <div>
                  <label htmlFor="doc-reviewer-notes" className="block text-xs font-medium text-slate-700 mb-1.5">
                    Reviewer Notes (saved to document_reviews &amp; statutory_documents)
                  </label>
                  <textarea
                    id="doc-reviewer-notes"
                    rows={3}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Verify survey seal, beacon coordinates, stamp duty receipt, or required corrections…"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-[#FAFDF8] text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-700/20 focus:border-emerald-700"
                  />
                </div>

                <button
                  type="button"
                  disabled={saving}
                  onClick={handleSaveReview}
                  className="w-full py-2.5 px-4 rounded-xl bg-emerald-700 hover:bg-emerald-800 disabled:opacity-60 text-white text-xs font-semibold cursor-pointer"
                >
                  {saving ? 'Saving Document Review…' : 'Save Document Review'}
                </button>

                {reviews.length > 0 && (
                  <div className="pt-3 border-t border-slate-100 space-y-2">
                    <div className="text-[11px] font-semibold text-slate-500">
                      Review Audit Trail
                    </div>
                    {reviews.slice(0, 5).map((r) => (
                      <div key={r.id} className="text-xs flex items-start justify-between gap-2">
                        <div>
                          <StatusText status={r.status} />
                          {r.reviewer_notes && (
                            <p className="text-[11px] text-slate-600 mt-0.5">{r.reviewer_notes}</p>
                          )}
                        </div>
                        <span className="font-mono-tabular text-[11px] text-slate-400 shrink-0">
                          {formatDateTime(r.created_at)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Right: Supabase Storage Document Previewer */}
          <div className="xl:col-span-7 rounded-2xl bg-white border border-slate-200 shadow-sm p-5 flex flex-col">
            <div className="flex items-center justify-between gap-3 pb-3 border-b border-slate-200 mb-4">
              <div className="min-w-0">
                <h3 className="font-display text-sm font-bold text-slate-900 truncate">
                  {activeDoc ? activeDoc.file_name || activeDoc.document_type : 'Document Preview'}
                </h3>
                {publicUrl && (
                  <div className="text-[11px] font-mono-tabular text-slate-500 truncate mt-0.5">
                    {publicUrl}
                  </div>
                )}
              </div>
              {publicUrl && (
                <a
                  href={publicUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="px-3 py-1.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-xs font-medium text-slate-700 inline-flex items-center gap-1 shrink-0"
                >
                  Open Raw <ExternalLink className="w-3.5 h-3.5" />
                </a>
              )}
            </div>

            {!publicUrl ? (
              <div className="flex-1 min-h-[420px] rounded-xl bg-[#FAFDF8] border border-slate-200 flex items-center justify-center text-xs text-slate-500">
                Select a statutory or customary document to preview from Supabase Storage.
              </div>
            ) : isImage ? (
              <div className="flex-1 min-h-[420px] rounded-xl bg-[#FAFDF8] border border-slate-200 p-4 flex items-center justify-center overflow-auto">
                <img
                  src={publicUrl}
                  alt={activeDoc?.file_name || 'Statutory document'}
                  referrerPolicy="no-referrer"
                  className="max-h-[540px] w-auto object-contain rounded-lg"
                />
              </div>
            ) : (
              <iframe
                src={publicUrl}
                title={activeDoc?.file_name || 'Document Preview'}
                className="w-full flex-1 min-h-[520px] rounded-xl border border-slate-200 bg-[#FAFDF8]"
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
