import { useState, type FormEvent } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  ExternalLink,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  ShieldCheck,
} from 'lucide-react';
import { AUTH_HERO_IMAGE_URL } from '../lib/contracts';
import { apiFetch, setAuthToken } from '../lib/api';
import type { StaffProfile } from '../types/registrar';

const LOGIN_LOGO_URL =
  'https://res.cloudinary.com/jinrrp4r/image/upload/v1795507507/Glossy_Emerald_A_Orbit_Logo_joxrb8.png';

interface LoginScreenProps {
  onAuthenticated: (staff: StaffProfile) => void;
}

const SPARKLES = [
  { left: '14%', top: '18%', size: '8px', delay: '0s' },
  { left: '22%', top: '78%', size: '10px', delay: '0.7s' },
  { left: '38%', top: '12%', size: '6px', delay: '1.4s' },
  { left: '46%', top: '84%', size: '9px', delay: '0.3s' },
  { left: '64%', top: '20%', size: '11px', delay: '1.9s' },
  { left: '70%', top: '76%', size: '7px', delay: '1.1s' },
  { left: '80%', top: '42%', size: '9px', delay: '2.2s' },
  { left: '28%', top: '50%', size: '6px', delay: '1.6s' },
] as const;

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
    <div className="min-h-screen bg-white flex flex-col">
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-2">
        {/* Left Column — Clean Centered Login Card */}
        <div className="flex flex-col justify-center px-6 py-10 sm:px-12 lg:px-16 bg-white border-r border-slate-200">
          <div className="w-full max-w-md mx-auto">
            {/* Centered Brand Stack */}
            <div className="flex flex-col items-center text-center">
              <img
                src={LOGIN_LOGO_URL}
                alt="ANAGU Land Administration"
                referrerPolicy="no-referrer"
                className="w-[60px] h-[60px] object-contain"
              />
              <h1 className="mt-4 text-3xl font-display font-extrabold text-slate-900 tracking-tight">
                Registrar
              </h1>
              <p className="mt-1.5 text-sm font-semibold text-emerald-700 tracking-wide">
                ANAGU Land Administration
              </p>
            </div>

            {error && (
              <div
                role="alert"
                className="mt-6 rounded-xl bg-red-50 border border-red-200 p-3.5 text-sm text-red-800 flex items-start gap-2.5"
              >
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-red-700" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="mt-8 space-y-5">
              <div>
                <label htmlFor="staff-id" className="block text-sm font-medium text-slate-700 mb-1.5">
                  Registrar&apos;s ID
                </label>
                <div className="relative">
                  <ShieldCheck className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    id="staff-id"
                    type="text"
                    required
                    autoComplete="username"
                    placeholder="REG-XXXX"
                    value={staffId}
                    onChange={(e) => setStaffId(e.target.value.toUpperCase())}
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-900 font-mono text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-600/20 focus:border-emerald-700"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="passcode" className="block text-sm font-medium text-slate-700 mb-1.5">
                  Assigned Passcode
                </label>
                <div className="relative">
                  <KeyRound className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    id="passcode"
                    type={showPasscode ? 'text' : 'password'}
                    required
                    autoComplete="current-password"
                    placeholder="Enter assigned passcode"
                    value={passcode}
                    onChange={(e) => setPasscode(e.target.value)}
                    className="w-full pl-10 pr-11 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-900 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-600/20 focus:border-emerald-700"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPasscode((prev) => !prev)}
                    aria-label={showPasscode ? 'Hide passcode' : 'Show passcode'}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 p-1 cursor-pointer"
                  >
                    {showPasscode ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 disabled:opacity-60 text-white font-semibold text-sm px-5 py-3 transition-colors cursor-pointer"
              >
                <Lock className="w-4 h-4" />
                <span>{loading ? 'Verifying Credentials…' : 'Sign In to Registrar Portal'}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>

            {/* Colored Cross-Portal Buttons */}
            <div className="mt-8 pt-6 border-t border-slate-200">
              <p className="text-xs font-semibold text-slate-500 text-center mb-3.5">
                ANAGU Portals
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <a
                  href="https://anagu.vercel.app/"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center justify-center gap-1.5 px-2.5 py-2.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors bg-emerald-700 hover:bg-emerald-800 text-white shadow-sm shadow-emerald-900/10"
                >
                  <span>Land Owners</span>
                  <ExternalLink className="w-3.5 h-3.5 shrink-0 opacity-90" />
                </a>
                <a
                  href="https://anagu-admin.vercel.app/"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center justify-center gap-1.5 px-2.5 py-2.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors bg-slate-800 hover:bg-slate-900 text-white shadow-sm shadow-slate-900/10"
                >
                  <span>Admin Portal</span>
                  <ExternalLink className="w-3.5 h-3.5 shrink-0 opacity-90" />
                </a>
                <a
                  href="https://anagu-governor-portal.vercel.app/"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center justify-center gap-1.5 px-2.5 py-2.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors bg-teal-700 hover:bg-teal-800 text-white shadow-sm shadow-teal-900/10"
                >
                  <span>Governors Portal</span>
                  <ExternalLink className="w-3.5 h-3.5 shrink-0 opacity-90" />
                </a>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column — Desktop Only Grass Gradient Hero */}
        <div className="hidden lg:flex relative overflow-hidden flex-col items-center justify-center p-12 anagu-grass-hero group">
          {/* Sparkling Animated Light Motes */}
          <div className="pointer-events-none absolute inset-0 transition-opacity duration-500 opacity-80 group-hover:opacity-100">
            {SPARKLES.map((sp, index) => (
              <span
                key={index}
                style={{
                  left: sp.left,
                  top: sp.top,
                  width: sp.size,
                  height: sp.size,
                  animationDelay: sp.delay,
                }}
                className="absolute rounded-full bg-white/90 shadow-[0_0_12px_rgba(255,255,255,0.95)] animate-sparkle"
              />
            ))}
          </div>

          {/* Animated Swaying Grass Meadow Wave */}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-32 overflow-hidden">
            <svg
              viewBox="0 0 800 120"
              preserveAspectRatio="none"
              className="w-full h-full opacity-50 group-hover:opacity-75 transition-opacity duration-500"
              aria-hidden="true"
            >
              <path
                d="M0,120 L0,88 Q40,42 70,88 Q105,36 140,86 Q175,40 210,88 Q250,28 290,88 Q325,45 360,86 Q400,32 440,88 Q480,44 520,88 Q560,26 600,86 Q640,42 680,88 Q725,30 760,88 Q785,55 800,82 L800,120 Z"
                fill="#237E10"
                className="animate-grass-sway"
              />
              <path
                d="M0,120 L0,96 Q30,58 60,96 Q95,50 130,96 Q170,54 205,96 Q245,46 285,96 Q320,60 355,96 Q395,48 435,96 Q475,58 515,96 Q555,44 595,96 Q635,56 675,96 Q715,48 755,96 Q780,68 800,92 L800,120 Z"
                fill="#1B7311"
                className="animate-grass-sway-delayed"
              />
            </svg>
          </div>

          {/* Floating Glossy Planet & Headline */}
          <div className="relative z-10 flex flex-col items-center">
            <div className="animate-orbital-float transition-transform duration-500 ease-out group-hover:scale-[1.04]">
              {!heroImageFailed ? (
                <img
                  src={AUTH_HERO_IMAGE_URL}
                  alt="ANAGU Orbital Cadastral Registry"
                  referrerPolicy="no-referrer"
                  onError={() => setHeroImageFailed(true)}
                  className="max-w-lg max-h-[540px] object-contain select-none"
                />
              ) : (
                <div className="w-80 h-80 rounded-full bg-emerald-100/70 border border-emerald-300 flex items-center justify-center">
                  <img
                    src={LOGIN_LOGO_URL}
                    alt="ANAGU Monogram"
                    referrerPolicy="no-referrer"
                    className="w-28 h-28 object-contain"
                  />
                </div>
              )}
            </div>

            <div className="mt-8 max-w-md text-center px-4">
              <div className="mx-auto mb-3 h-0.5 w-16 rounded-full bg-emerald-800/40" />
              <h2 className="text-2xl xl:text-[28px] font-display font-extrabold text-emerald-950 tracking-tight leading-snug text-balance">
                PostGIS Spatial Verification
              </h2>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
