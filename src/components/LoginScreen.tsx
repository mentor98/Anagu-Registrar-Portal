import { useState, type FormEvent } from 'react';
import { Eye, EyeOff, KeyRound, Lock, ShieldCheck, ArrowUpRight } from 'lucide-react';
import { ANAGU_LOGO_URL, AUTH_HERO_IMAGE_URL } from '../lib/contracts';
import { apiFetch, setAuthToken } from '../lib/api';
import type { StaffProfile } from '../types/registrar';

interface LoginScreenProps {
  onAuthenticated: (staff: StaffProfile) => void;
}

export function LoginScreen({ onAuthenticated }: LoginScreenProps) {
  const [staffId, setStaffId] = useState('');
  const [passcode, setPasscode] = useState('');
  const [showPasscode, setShowPasscode] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [heroImageFailed, setHeroImageFailed] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const response = await apiFetch<{ token: string; staff: StaffProfile }>('/api/staff/login', {
        method: 'POST',
        body: JSON.stringify({
          staffId: staffId.trim().toUpperCase(),
          passcode,
        }),
      });
      setAuthToken(response.token);
      onAuthenticated(response.staff);
    } catch (err) {
      setError((err as Error).message || 'Unable to verify Registrar credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-white text-slate-900 flex flex-col lg:flex-row">
      {/* Left Column: Clean Light Mode Login Card */}
      <div className="flex-1 flex flex-col justify-between px-6 py-8 sm:px-12 lg:px-16 xl:px-24 bg-white">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img
              src={ANAGU_LOGO_URL}
              alt="ANAGU Land Administration"
              referrerPolicy="no-referrer"
              className="w-9 h-9 object-contain"
            />
            <div>
              <span className="font-display font-bold text-lg tracking-tight text-slate-900 block leading-none">
                ANAGU
              </span>
              <span className="text-xs text-slate-500">Land Administration</span>
            </div>
          </div>
          <span className="text-xs font-mono-tabular text-slate-500">
            Polygon Amoy · 80002
          </span>
        </div>

        <main className="w-full max-w-md mx-auto my-10">
          <div className="rounded-2xl bg-white border border-slate-200 shadow-sm p-6 sm:p-8">
            <div className="mb-6">
              <div className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 mb-2">
                <ShieldCheck className="w-4 h-4" />
                <span>Cadastral Registrar Portal</span>
              </div>
              <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900 text-balance">
                Sign in with Registrar Staff ID
              </h1>
              <p className="mt-1.5 text-sm text-slate-600 leading-relaxed">
                Enter your assigned ANAGU Registrar Staff ID and passcode to access cadastral triage, PostGIS verification, and title minting.
              </p>
            </div>

            {error && (
              <div
                role="alert"
                className="mb-5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-800 leading-relaxed"
              >
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="staff-id" className="block text-xs font-medium text-slate-700 mb-1.5">
                  Registrar Staff ID
                </label>
                <div className="relative">
                  <KeyRound className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    id="staff-id"
                    type="text"
                    required
                    autoComplete="username"
                    placeholder="REG-1042"
                    value={staffId}
                    onChange={(e) => setStaffId(e.target.value.toUpperCase())}
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 bg-[#FAFDF8] text-sm font-mono-tabular text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-700/20 focus:border-emerald-700"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="passcode" className="block text-xs font-medium text-slate-700 mb-1.5">
                  Assigned Passcode
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    id="passcode"
                    type={showPasscode ? 'text' : 'password'}
                    required
                    autoComplete="current-password"
                    placeholder="Enter assigned passcode"
                    value={passcode}
                    onChange={(e) => setPasscode(e.target.value)}
                    className="w-full pl-10 pr-11 py-2.5 rounded-xl border border-slate-200 bg-[#FAFDF8] text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-700/20 focus:border-emerald-700"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPasscode((prev) => !prev)}
                    aria-label={showPasscode ? 'Hide passcode' : 'Show passcode'}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 p-1"
                  >
                    {showPasscode ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full mt-2 py-2.5 px-4 rounded-xl bg-emerald-700 hover:bg-emerald-800 disabled:opacity-60 text-white text-sm font-semibold transition-colors cursor-pointer whitespace-nowrap"
              >
                {loading ? 'Verifying Credentials…' : 'Sign In to Registrar Portal'}
              </button>
            </form>

            <div className="mt-6 pt-5 border-t border-slate-100 text-xs text-slate-500 flex items-center justify-between gap-2">
              <span>Role guard: Active Registrar IDs only</span>
              <span className="font-mono-tabular">HMAC-SHA256 · 12h</span>
            </div>
          </div>
        </main>

        <footer className="flex flex-wrap items-center justify-between gap-4 text-xs text-slate-500 border-t border-slate-100 pt-5">
          <span>ANAGU Cadastral Infrastructure</span>
          <div className="flex flex-wrap items-center gap-4">
            <a href="/" className="hover:text-emerald-700 inline-flex items-center gap-1">
              User Platform <ArrowUpRight className="w-3 h-3" />
            </a>
            <a href="/gis" className="hover:text-emerald-700 inline-flex items-center gap-1">
              Public GIS Explorer <ArrowUpRight className="w-3 h-3" />
            </a>
            <a href="/register" className="hover:text-emerald-700 inline-flex items-center gap-1">
              Register Parcel <ArrowUpRight className="w-3 h-3" />
            </a>
            <a href="/oracle" className="hover:text-emerald-700 inline-flex items-center gap-1">
              Oracle <ArrowUpRight className="w-3 h-3" />
            </a>
          </div>
        </footer>
      </div>

      {/* Right Column: Desktop lg:flex ONLY Hero Composition (No dark container wrapper) */}
      <div className="hidden lg:flex lg:w-[48%] xl:w-[50%] bg-[#FAFDF8] border-l border-slate-200 items-center justify-center p-12">
        <div className="max-w-lg w-full flex flex-col items-center text-center">
          {!heroImageFailed ? (
            <img
              src={AUTH_HERO_IMAGE_URL}
              alt="ANAGU Orbital Cadastral Registry"
              referrerPolicy="no-referrer"
              onError={() => setHeroImageFailed(true)}
              className="w-full max-w-md h-auto object-contain mb-8"
            />
          ) : (
            <div className="w-72 h-72 rounded-2xl bg-[#F3FDE9] border border-emerald-200 flex items-center justify-center mb-8">
              <img
                src={ANAGU_LOGO_URL}
                alt="ANAGU Monogram"
                referrerPolicy="no-referrer"
                className="w-28 h-28 object-contain"
              />
            </div>
          )}
          <h2 className="font-display text-2xl font-bold text-slate-900 text-balance">
            PostGIS Spatial Verification &amp; Immutable Polygon Amoy Title Registry
          </h2>
          <p className="mt-3 text-sm text-slate-600 leading-relaxed max-w-md">
            Audit dual-tenure statutory and customary documentation, detect 0.5m cadastral overlaps in real time, and mint verified C-of-O land titles on-chain.
          </p>
        </div>
      </div>
    </div>
  );
}
