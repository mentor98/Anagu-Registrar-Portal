import { useEffect, useState } from 'react';
import { CheckCircle2, ExternalLink, RefreshCw, Search } from 'lucide-react';
import { apiFetch, formatDateTime, formatNumber, truncateAddress } from '../../lib/api';
import { POLYGON_AMOY_EXPLORER } from '../../lib/contracts';
import { StatusText } from '../StatusText';
import type { TxInspectionResult, WalletTransaction } from '../../types/registrar';

interface FeesWorkspaceProps {
  onRefreshOverview: () => void;
}

export function FeesWorkspace({ onRefreshOverview }: FeesWorkspaceProps) {
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [inspectHash, setInspectHash] = useState('');
  const [inspection, setInspection] = useState<TxInspectionResult | null>(null);
  const [inspecting, setInspecting] = useState(false);
  const [reconcilingId, setReconcilingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const loadTransactions = async () => {
    setLoading(true);
    try {
      const res = await apiFetch<{ transactions: WalletTransaction[] }>('/api/registrar/transactions');
      setTransactions(res.transactions || []);
    } catch (err) {
      setFeedback({ type: 'err', text: (err as Error).message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTransactions();
  }, []);

  const handleInspectTx = async (hashToCheck?: string) => {
    const target = (hashToCheck || inspectHash).trim();
    if (!target) return;
    setInspectHash(target);
    setInspecting(true);
    setFeedback(null);
    try {
      const res = await apiFetch<TxInspectionResult>(`/api/blockchain/tx/${encodeURIComponent(target)}`);
      setInspection(res);
    } catch (err) {
      setFeedback({ type: 'err', text: (err as Error).message });
    } finally {
      setInspecting(false);
    }
  };

  const handleReconcile = async (tx: WalletTransaction) => {
    setReconcilingId(tx.id);
    setFeedback(null);
    try {
      const res = await apiFetch<{ transaction: WalletTransaction; blockNumber: number }>(
        `/api/registrar/transactions/${tx.id}/reconcile`,
        { method: 'POST' }
      );
      setFeedback({
        type: 'ok',
        text: `Reconciled tx ${truncateAddress(tx.tx_hash)} at Polygon Amoy block #${res.blockNumber}.`,
      });
      await loadTransactions();
      onRefreshOverview();
    } catch (err) {
      setFeedback({ type: 'err', text: (err as Error).message });
    } finally {
      setReconcilingId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Live Polygon Amoy Tx Inspector */}
      <section className="rounded-2xl bg-white border border-slate-200 shadow-sm p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-base font-bold text-slate-900">
              Polygon Amoy Transaction Inspector
            </h2>
            <p className="text-xs text-slate-500">
              Verify ANAGU / POL fee transfers and decode LandRegistry events directly via /api/blockchain/tx/:txHash
            </p>
          </div>
          <button
            type="button"
            onClick={loadTransactions}
            className="px-3 py-1.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-xs font-medium text-slate-700 inline-flex items-center gap-1.5 w-fit cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh Ledger
          </button>
        </div>

        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={inspectHash}
              onChange={(e) => setInspectHash(e.target.value)}
              placeholder="0x… Polygon Amoy transaction hash"
              className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 bg-[#FAFDF8] text-xs font-mono-tabular text-slate-900"
            />
          </div>
          <button
            type="button"
            disabled={inspecting || !inspectHash.trim()}
            onClick={() => handleInspectTx()}
            className="px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 disabled:opacity-60 text-white text-xs font-semibold whitespace-nowrap cursor-pointer"
          >
            {inspecting ? 'Inspecting…' : 'Inspect On-Chain Tx'}
          </button>
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

        {inspection && (
          <div className="rounded-xl border border-slate-200 bg-[#FAFDF8] p-4 space-y-3 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <StatusText status={inspection.status} />
                {inspection.blockNumber && (
                  <span className="font-mono-tabular text-slate-600">
                    Block #{inspection.blockNumber} ({inspection.confirmations} confirmations)
                  </span>
                )}
              </div>
              <a
                href={`${POLYGON_AMOY_EXPLORER}/tx/${inspection.txHash}`}
                target="_blank"
                rel="noreferrer"
                className="text-emerald-700 hover:underline inline-flex items-center gap-1 font-medium"
              >
                View on Amoy PolygonScan <ExternalLink className="w-3 h-3" />
              </a>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 font-mono-tabular text-[11px] text-slate-700">
              <div>From: {truncateAddress(inspection.from, 8, 6)}</div>
              <div>To: {truncateAddress(inspection.to, 8, 6)}</div>
              <div>Gas Used: {inspection.gasUsed || '—'}</div>
            </div>

            {inspection.decodedEvents.length > 0 && (
              <div className="pt-2 border-t border-slate-200 space-y-1.5">
                <div className="font-semibold text-slate-800">Decoded Contract Events</div>
                {inspection.decodedEvents.map((ev, idx) => (
                  <div key={idx} className="rounded-lg bg-white border border-slate-200 p-2.5 font-mono-tabular text-[11px]">
                    <span className="font-semibold text-emerald-700">
                      {ev.contract}.{ev.eventName}
                    </span>
                    <div className="text-slate-600 mt-1 break-all">
                      {JSON.stringify(ev.args)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </section>

      {/* Wallet Transactions Table */}
      <section className="rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
          <h2 className="font-display text-base font-bold text-slate-900">
            Fee Payments Ledger (wallet_transactions)
          </h2>
          <span className="text-xs font-mono-tabular text-slate-500">
            {transactions.length} records
          </span>
        </div>

        {loading ? (
          <div className="p-8 text-center text-sm text-slate-500">
            Loading fee transactions…
          </div>
        ) : transactions.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">
            No wallet fee transactions recorded yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-[#FAFDF8] text-[11px] font-semibold text-slate-500">
                  <th className="py-3 px-4">Tx Hash</th>
                  <th className="py-3 px-4">Payer Wallet</th>
                  <th className="py-3 px-4">Type</th>
                  <th className="py-3 px-4 text-right">Amount</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Recorded</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {transactions.map((tx) => (
                  <tr key={tx.id} className="hover:bg-[#FAFDF8]">
                    <td className="py-3 px-4 font-mono-tabular whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => handleInspectTx(tx.tx_hash)}
                        className="text-emerald-700 hover:underline font-medium cursor-pointer"
                      >
                        {truncateAddress(tx.tx_hash, 8, 6)}
                      </button>
                    </td>
                    <td className="py-3 px-4 font-mono-tabular text-slate-700 whitespace-nowrap">
                      {truncateAddress(tx.wallet_address)}
                    </td>
                    <td className="py-3 px-4 text-slate-700 whitespace-nowrap">
                      {tx.tx_type || 'registration_fee'}
                    </td>
                    <td className="py-3 px-4 text-right font-mono-tabular font-semibold text-slate-900 whitespace-nowrap">
                      {formatNumber(tx.amount)} {tx.token_symbol || 'ANAGU'}
                    </td>
                    <td className="py-3 px-4">
                      <StatusText status={tx.reconciled ? 'reconciled' : tx.status} />
                    </td>
                    <td className="py-3 px-4 font-mono-tabular text-slate-500 whitespace-nowrap">
                      {formatDateTime(tx.created_at)}
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      {tx.reconciled ? (
                        <span className="inline-flex items-center gap-1 text-emerald-700 font-medium">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Verified
                        </span>
                      ) : (
                        <button
                          type="button"
                          disabled={reconcilingId === tx.id}
                          onClick={() => handleReconcile(tx)}
                          className="px-3 py-1 rounded-lg bg-emerald-700 hover:bg-emerald-800 disabled:opacity-60 text-white font-semibold cursor-pointer"
                        >
                          {reconcilingId === tx.id ? 'Checking…' : 'Reconcile'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
