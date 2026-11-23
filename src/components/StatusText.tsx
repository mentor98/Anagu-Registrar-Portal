import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Lock,
  ShieldAlert,
  XCircle,
} from 'lucide-react';
import { formatStatusLabel } from '../lib/api';

interface StatusTextProps {
  status?: string | null;
  className?: string;
}

export function StatusText({ status, className = '' }: StatusTextProps) {
  const normalized = (status || 'pending').toLowerCase();

  let colorClass = 'text-slate-600';
  let Icon = Clock;

  if (
    normalized.includes('verified') ||
    normalized === 'active' ||
    normalized === 'confirmed' ||
    normalized === 'approved' ||
    normalized === 'reconciled' ||
    normalized === 'resolved'
  ) {
    colorClass = 'text-emerald-700';
    Icon = CheckCircle2;
  } else if (
    normalized.includes('disputed') ||
    normalized.includes('conflict') ||
    normalized.includes('rejected') ||
    normalized.includes('reverted') ||
    normalized.includes('revoked')
  ) {
    colorClass = 'text-rose-700';
    Icon = normalized.includes('rejected') || normalized.includes('reverted') ? XCircle : ShieldAlert;
  } else if (normalized.includes('escrow') || normalized.includes('locked')) {
    colorClass = 'text-amber-700';
    Icon = Lock;
  } else if (
    normalized.includes('correction') ||
    normalized.includes('governor') ||
    normalized.includes('review') ||
    normalized.includes('pending')
  ) {
    colorClass = 'text-amber-700';
    Icon = normalized.includes('correction') ? AlertTriangle : Clock;
  }

  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium whitespace-nowrap ${colorClass} ${className}`}>
      <Icon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
      <span>{formatStatusLabel(status)}</span>
    </span>
  );
}
