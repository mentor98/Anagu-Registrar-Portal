import {
  ArrowUpRight,
  BookOpenCheck,
  Coins,
  FileCheck2,
  Inbox,
  LayoutDashboard,
  MapPinned,
  Scale,
  Stamp,
  X,
} from 'lucide-react';
import { ANAGU_LOGO_URL, POLYGON_AMOY_EXPLORER } from '../lib/contracts';
import type { RegistrarTab, StaffProfile } from '../types/registrar';

interface SidebarProps {
  activeTab: RegistrarTab;
  onSelectTab: (tab: RegistrarTab) => void;
  staff: StaffProfile;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

const NAV_ITEMS: Array<{ id: RegistrarTab; label: string; icon: typeof LayoutDashboard }> = [
  { id: 'overview', label: 'Registrar Overview', icon: LayoutDashboard },
  { id: 'intake', label: 'Intake & Triage', icon: Inbox },
  { id: 'gis', label: 'GIS Verification', icon: MapPinned },
  { id: 'documents', label: 'Document Review', icon: FileCheck2 },
  { id: 'ownership', label: 'Dual-Tenure Audit', icon: Scale },
  { id: 'fees', label: 'Fee Reconciliation', icon: Coins },
  { id: 'minting', label: 'Title Minting', icon: Stamp },
  { id: 'ledger', label: 'Disputes & Ledger', icon: BookOpenCheck },
];

export function Sidebar({
  activeTab,
  onSelectTab,
  staff,
  mobileOpen,
  onCloseMobile,
}: SidebarProps) {
  const handleNav = (id: RegistrarTab) => {
    onSelectTab(id);
    onCloseMobile();
  };

  const sidebarContent = (
    <div className="flex flex-col h-full bg-white border-r border-slate-200 w-64">
      {/* Top Logo — navigates to Registrar Overview inside authenticated portal */}
      <div className="h-16 px-5 flex items-center justify-between border-b border-slate-200 shrink-0">
        <button
          type="button"
          onClick={() => handleNav('overview')}
          className="flex items-center gap-2.5 text-left cursor-pointer group focus:outline-none"
        >
          <img
            src={ANAGU_LOGO_URL}
            alt="ANAGU Registrar Overview"
            referrerPolicy="no-referrer"
            className="w-8 h-8 object-contain shrink-0"
          />
          <div>
            <span className="font-display font-bold text-base tracking-tight text-slate-900 group-hover:text-emerald-700 transition-colors block leading-none">
              ANAGU
            </span>
            <span className="text-[11px] text-slate-500 block mt-0.5">Registrar Portal</span>
          </div>
        </button>

        <button
          type="button"
          onClick={onCloseMobile}
          className="lg:hidden p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100"
          aria-label="Close navigation menu"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1" aria-label="Registrar workspaces">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => handleNav(item.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors cursor-pointer whitespace-nowrap ${
                isActive
                  ? 'bg-[#F3FDE9] text-emerald-800 border border-emerald-200/80'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-[#FAFDF8] border border-transparent'
              }`}
            >
              <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-emerald-700' : 'text-slate-400'}`} />
              <span className="truncate">{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Staff Summary & Cross-Portal Links */}
      <div className="p-4 border-t border-slate-200 bg-[#FAFDF8] space-y-3 shrink-0">
        <div className="text-xs">
          <div className="font-semibold text-slate-900 truncate">{staff.full_name}</div>
          <div className="text-slate-500 font-mono-tabular mt-0.5">
            {staff.staff_id} · {staff.jurisdiction || staff.state_name || 'Federal Registry'}
          </div>
        </div>

        <div className="pt-2 border-t border-slate-200/80 grid grid-cols-2 gap-x-2 gap-y-1.5 text-[11px] text-slate-600">
          <a href="/" className="hover:text-emerald-700 inline-flex items-center gap-1 whitespace-nowrap">
            User Portal <ArrowUpRight className="w-3 h-3" />
          </a>
          <a href="/gis" className="hover:text-emerald-700 inline-flex items-center gap-1 whitespace-nowrap">
            GIS Explorer <ArrowUpRight className="w-3 h-3" />
          </a>
          <a href="/register" className="hover:text-emerald-700 inline-flex items-center gap-1 whitespace-nowrap">
            Register <ArrowUpRight className="w-3 h-3" />
          </a>
          <a href="/oracle" className="hover:text-emerald-700 inline-flex items-center gap-1 whitespace-nowrap">
            Oracle <ArrowUpRight className="w-3 h-3" />
          </a>
          <a
            href={POLYGON_AMOY_EXPLORER}
            target="_blank"
            rel="noreferrer"
            className="col-span-2 hover:text-emerald-700 inline-flex items-center gap-1 whitespace-nowrap pt-0.5"
          >
            Amoy PolygonScan <ArrowUpRight className="w-3 h-3" />
          </a>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Fixed Sidebar */}
      <aside className="hidden lg:block lg:fixed lg:inset-y-0 lg:left-0 lg:w-64 z-30">
        {sidebarContent}
      </aside>

      {/* Mobile Slide-Over Drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-900/30 backdrop-blur-[1px]"
            onClick={onCloseMobile}
            aria-hidden="true"
          />
          <div className="relative z-10 h-full">{sidebarContent}</div>
        </div>
      )}
    </>
  );
}
