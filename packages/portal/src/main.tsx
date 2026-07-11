import React, { useState, useEffect, useCallback, createContext, useContext } from 'react';
import { localeLabels, t as translate, type Locale } from './i18n';
import './ticketos.css';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface User {
  id: string;
  email: string;
}

interface Workspace {
  id: string;
  name: string;
  role?: string;
}

interface Ticket {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  ticketTypeId: string | null;
  createdBy: string;
  assignedTo: string | null;
  visibility: string;
  createdAt: string;
  updatedAt: string;
}

interface TimelineEntry {
  id: string;
  ticketId: string;
  kind: string;
  content: string;
  authorId: string | null;
  visibility: string;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// i18n Context
// ---------------------------------------------------------------------------

interface I18nContextValue {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (key: string, vars?: Record<string, string>) => string;
}

const I18nContext = createContext<I18nContextValue>({
  locale: 'en',
  setLocale: () => {},
  t: (key) => key,
});

function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocale] = useState<Locale>(() => {
    const saved = localStorage.getItem('ticketos-locale');
    return (saved === 'es' || saved === 'en') ? saved : 'en';
  });

  useEffect(() => {
    localStorage.setItem('ticketos-locale', locale);
    document.documentElement.lang = locale;
  }, [locale]);

  return (
    <I18nContext.Provider value={{ locale, setLocale, t: (key, vars) => translate(locale, key, vars) }}>
      {children}
    </I18nContext.Provider>
  );
}

function useI18n() {
  return useContext(I18nContext);
}

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`API ${res.status}: ${body || res.statusText}`);
  }
  return res.json();
}

// ---------------------------------------------------------------------------
// Icons (inline SVG)
// ---------------------------------------------------------------------------

function IconInbox({ size = 18 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width={size} height={size}>
      <path d="M22 12h-6l-2 3h-4l-2-3H2"/>
      <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>
    </svg>
  );
}

function IconTicket({ size = 18 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width={size} height={size}>
      <path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z"/>
      <path d="M13 5v2M13 11v2M13 17v2"/>
    </svg>
  );
}

function IconPlus({ size = 18 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width={size} height={size}>
      <line x1="12" y1="5" x2="12" y2="19"/>
      <line x1="5" y1="12" x2="19" y2="12"/>
    </svg>
  );
}

function IconSearch({ size = 16 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width={size} height={size}>
      <circle cx="11" cy="11" r="8"/>
      <path d="m21 21-4.3-4.3"/>
    </svg>
  );
}

function IconBell({ size = 18 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width={size} height={size}>
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/>
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>
    </svg>
  );
}

function IconLock({ size = 12 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width={size} height={size}>
      <rect width="18" height="11" x="3" y="11" rx="2"/>
      <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
    </svg>
  );
}

function IconPaperclip({ size = 16 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width={size} height={size}>
      <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
    </svg>
  );
}

function IconMail({ size = 18 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width={size} height={size}>
      <rect x="2" y="4" width="20" height="16" rx="2"/>
      <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>
    </svg>
  );
}

function IconUsers({ size = 18 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width={size} height={size}>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
      <circle cx="9" cy="7" r="4"/>
      <path d="M22 21v-2a4 4 0 0 0-3-3.87"/>
      <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
    </svg>
  );
}

function IconGear({ size = 18 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width={size} height={size}>
      <circle cx="12" cy="12" r="3"/>
      <path d="M12 1v6m0 6v6m11-7h-6m-6 0H1"/>
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Error Boundary
// ---------------------------------------------------------------------------

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  state = { hasError: false, error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="error-state" role="alert">
          <svg className="error-state-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="8" x2="12" y2="12"/>
            <line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          <h2 className="error-state-title">Algo salió mal</h2>
          <p className="error-state-desc">{this.state.error?.message}</p>
        </div>
      );
    }
    return this.props.children;
  }
}

// ---------------------------------------------------------------------------
// Loading Skeleton
// ---------------------------------------------------------------------------

function LoadingSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">Cargando...</span>
      <div className="timeline">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="timeline-entry event" style={{ opacity: 0.6 }}>
            <div className="timeline-entry-body" style={{ flex: 1 }}>
              <div className="skeleton skeleton-text short" />
              <div className="skeleton skeleton-text medium" />
              <div className="skeleton skeleton-text" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Empty State
// ---------------------------------------------------------------------------

function EmptyState({ title, description, actionLabel, onAction }: {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="empty-state" data-testid="empty-state">
      <svg className="empty-state-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z"/>
        <path d="M13 5v2M13 11v2M13 17v2"/>
      </svg>
      <h2 className="empty-state-title">{title}</h2>
      <p className="empty-state-desc">{description}</p>
      {actionLabel && onAction && (
        <button className="btn btn-primary mt-4" onClick={onAction}>{actionLabel}</button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Locale Switcher
// ---------------------------------------------------------------------------

function LocaleSwitcher() {
  const { locale, setLocale } = useI18n();
  return (
    <div className="flex items-center gap-1" data-testid="locale-switcher">
      <button
        className="btn btn-ghost btn-sm"
        style={locale === 'en' ? { fontWeight: 600, color: 'var(--accent)' } : {}}
        onClick={() => setLocale('en')}
        aria-pressed={locale === 'en'}
        aria-label="English"
      >
        EN
      </button>
      <span className="text-muted text-small">·</span>
      <button
        className="btn btn-ghost btn-sm"
        style={locale === 'es' ? { fontWeight: 600, color: 'var(--accent)' } : {}}
        onClick={() => setLocale('es')}
        aria-pressed={locale === 'es'}
        aria-label="Español"
      >
        ES
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Badge helpers
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: string }) {
  const { t } = useI18n();
  const statusMap: Record<string, { class: string; dot: string }> = {
    backlog: { class: 'badge-neutral', dot: 'var(--neutral)' },
    todo: { class: 'badge-info', dot: 'var(--info)' },
    in_progress: { class: 'badge-warn', dot: 'var(--warn)' },
    done: { class: 'badge-success', dot: 'var(--success)' },
    cancelled: { class: 'badge-danger', dot: 'var(--danger)' },
  };
  const s = statusMap[status] ?? { class: 'badge-neutral', dot: 'var(--neutral)' };
  const label = t(`portal.status.${status}`) || status;
  return (
    <span className={`badge ${s.class}`}>
      <span className="status-dot" style={{ background: s.dot }} />
      {label}
    </span>
  );
}

function PriorityBadge({ priority }: { priority: string }) {
  const { t } = useI18n();
  const classMap: Record<string, string> = {
    urgent: 'priority-urgent',
    high: 'priority-high',
    normal: 'priority-normal',
    low: 'priority-low',
  };
  const label = t(`portal.priority.${priority}`) || priority;
  return (
    <span className={`priority ${classMap[priority] ?? 'priority-normal'}`}>● {label}</span>
  );
}

function TicketTypeBadge({ type }: { type: string | null }) {
  const { t } = useI18n();
  if (!type) return null;
  const classMap: Record<string, string> = {
    incident: 'badge-neutral',
    'service-request': 'badge-accent',
  };
  const label = t(`portal.type.${type}`) || type;
  return <span className={`badge ${classMap[type] ?? 'badge-neutral'}`}>{label}</span>;
}

function VisibilityBadge({ visibility }: { visibility: string }) {
  const { t } = useI18n();
  if (visibility === 'public') return null;
  return (
    <span className="badge badge-neutral">
      <IconLock size={12} />
      {t(`portal.visibility.${visibility}`) || visibility}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Login
// ---------------------------------------------------------------------------

function Login({ onLogin }: { onLogin: (_user: User, _workspace: Workspace) => void }) {
  const { t } = useI18n();
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setLoading(true);
    try {
      await api<{ token: string }>('/api/auth/magic-link', {
        method: 'POST',
        body: JSON.stringify({ email }),
      });
      setMessage(t('portal.magic_link_sent', { email }));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('portal.login_failed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="auth-page" data-testid="login-page">
      <div className="auth-card">
        <div className="auth-brand">
          <div className="logo">T</div>
          <div className="brand-name">ticket<span className="os">OS</span></div>
        </div>

        <h1 className="auth-title">{t('portal.login')}</h1>
        <p className="auth-subtitle">{t('portal.login_subtitle')}</p>

        <form onSubmit={handleSubmit}>
          <div className="field">
            <label className="label" htmlFor="email">
              {t('portal.email_label')} <span className="required" aria-hidden="true">*</span>
            </label>
            <input
              className={`input${error ? ' error' : ''}`}
              type="email"
              id="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="tu@empresa.com"
              required
              autoComplete="email"
              aria-describedby="email-hint"
              autoFocus
            />
            <div className="field-hint" id="email-hint">{t('portal.login_subtitle')}</div>
          </div>

          <button
            type="submit"
            className="btn btn-primary btn-block btn-lg"
            disabled={loading}
          >
            <IconMail size={18} />
            {t('portal.send_magic_link')}
          </button>
        </form>

        {message && <p className="mt-4 text-center text-small" style={{ color: 'var(--success)' }} data-testid="login-message" role="status">{message}</p>}
        {error && <p className="mt-4 text-center text-small" style={{ color: 'var(--danger)' }} data-testid="login-error" role="alert">{error}</p>}

        <div className="divider" />

        <div className="flex justify-center items-center gap-2 mt-4">
          <LocaleSwitcher />
        </div>
      </div>
    </main>
  );
}

// ---------------------------------------------------------------------------
// Workspace Selector
// ---------------------------------------------------------------------------

function WorkspaceSelector({
  workspaces,
  onSelect,
}: {
  workspaces: Workspace[];
  onSelect: (ws: Workspace) => void;
}) {
  const { t } = useI18n();
  return (
    <main className="auth-page" data-testid="workspace-selector">
      <div className="auth-card">
        <div className="auth-brand">
          <div className="logo">T</div>
          <div className="brand-name">ticket<span className="os">OS</span></div>
        </div>

        <h1 className="auth-title">{t('portal.select_workspace')}</h1>

        {workspaces.length === 0 ? (
          <div className="empty-state" style={{ padding: 'var(--sp-6) 0' }}>
            <p className="text-muted">{t('portal.no_workspaces')}</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {workspaces.map((ws) => (
              <button
                key={ws.id}
                className="nav-item"
                style={{ border: '1px solid var(--border)', borderRadius: 'var(--r-md)', padding: 'var(--sp-3) var(--sp-4)' }}
                onClick={() => onSelect(ws)}
                aria-label={`${ws.name} — ${ws.role ?? 'Member'}`}
              >
                <div style={{ width: 36, height: 36, borderRadius: 'var(--r-md)', background: 'var(--accent-light)', color: 'var(--accent)', display: 'grid', placeItems: 'center', fontWeight: 700, fontSize: 14 }}>
                  {ws.name.charAt(0).toUpperCase()}
                </div>
                <div style={{ textAlign: 'left' }}>
                  <div style={{ fontWeight: 600 }}>{ws.name}</div>
                  <div className="text-small text-muted">{ws.role ?? 'Member'}</div>
                </div>
              </button>
            ))}
          </div>
        )}

        <div className="divider" />

        <div className="flex justify-center items-center gap-2 mt-4">
          <LocaleSwitcher />
        </div>
      </div>
    </main>
  );
}

// ---------------------------------------------------------------------------
// Sidebar
// ---------------------------------------------------------------------------

function Sidebar({
  currentPage,
  onNavigate,
  workspace,
  ticketCount,
}: {
  currentPage: string;
  onNavigate: (page: string) => void;
  workspace: Workspace | null;
  ticketCount: number;
}) {
  const { t } = useI18n();
  const isAgent = workspace?.role === 'agent' || workspace?.role === 'workspace-admin';

  return (
    <aside className="sidebar" data-testid="sidebar">
      <div className="sidebar-brand">
        <div className="logo">T</div>
        <div className="brand-name">ticket<span className="os">OS</span></div>
      </div>
      <nav className="sidebar-nav">
        <div className="sidebar-section-label">{t('portal.navigation')}</div>

        {isAgent ? (
          <>
            <button
              className={`nav-item${currentPage === 'queue' ? ' active' : ''}`}
              onClick={() => onNavigate('queue')}
            >
              <IconInbox />
              <span>{t('portal.inbox')}</span>
              <span className="badge-count">{ticketCount}</span>
            </button>
            <button
              className={`nav-item${currentPage === 'my-tickets' ? ' active' : ''}`}
              onClick={() => onNavigate('my-tickets')}
            >
              <IconTicket />
              <span>{t('portal.my_tickets')}</span>
            </button>
          </>
        ) : (
          <button
            className={`nav-item${currentPage === 'ticket-list' ? ' active' : ''}`}
            onClick={() => onNavigate('ticket-list')}
          >
            <IconTicket />
            <span>{t('portal.my_tickets')}</span>
            <span className="badge-count">{ticketCount}</span>
          </button>
        )}

        <button
          className={`nav-item${currentPage === 'create-ticket' ? ' active' : ''}`}
          onClick={() => onNavigate('create-ticket')}
        >
          <IconPlus />
          <span>{t('portal.new_ticket')}</span>
        </button>

        {workspace?.role === 'workspace-admin' && (
          <>
            <div className="sidebar-section-label" style={{ marginTop: 'var(--sp-3)' }}>{t('portal.admin')}</div>
            <button className="nav-item" onClick={() => onNavigate('admin-queues')}>
              <IconInbox />
              <span>{t('portal.queues')}</span>
            </button>
            <button className="nav-item" onClick={() => onNavigate('admin-members')}>
              <IconUsers />
              <span>{t('portal.members')}</span>
            </button>
          </>
        )}
      </nav>
      <div className="sidebar-footer">
        <div className="workspace-switcher">
          <div className="ws-icon">{workspace?.name?.charAt(0).toUpperCase() ?? '?'}</div>
          <div>
            <div className="ws-name">{workspace?.name ?? '—'}</div>
            <div className="ws-role">{workspace?.role ?? 'Member'}</div>
          </div>
        </div>
      </div>
    </aside>
  );
}

// ---------------------------------------------------------------------------
// Ticket List (Requester)
// ---------------------------------------------------------------------------

function TicketList({
  tickets,
  onOpen,
  onCreate,
}: {
  tickets: Ticket[];
  onOpen: (id: string) => void;
  onCreate: () => void;
}) {
  const { t } = useI18n();
  const [filter, setFilter] = useState('all');

  const filtered = tickets.filter((tk) => {
    if (filter === 'all') return true;
    if (filter === 'open') return tk.status !== 'done' && tk.status !== 'cancelled';
    if (filter === 'resolved') return tk.status === 'done';
    if (filter === 'closed') return tk.status === 'cancelled';
    return true;
  });

  return (
    <div className="content" data-testid="ticket-list">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div className="tabs" style={{ marginBottom: 0, border: 'none' }}>
          {(['all', 'open', 'resolved', 'closed'] as const).map((f) => (
            <button
              key={f}
              className={`tab${filter === f ? ' active' : ''}`}
              onClick={() => setFilter(f)}
            >
              {t(`portal.filter.${f}`)} <span className="count">({tickets.filter((tk) => {
                if (f === 'all') return true;
                if (f === 'open') return tk.status !== 'done' && tk.status !== 'cancelled';
                if (f === 'resolved') return tk.status === 'done';
                if (f === 'closed') return tk.status === 'cancelled';
                return true;
              }).length})</span>
            </button>
          ))}
        </div>
        <button className="btn btn-primary" onClick={onCreate} data-testid="new-ticket-btn">
          <IconPlus size={16} />
          {t('portal.new_ticket')}
        </button>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title={t('portal.no_tickets')}
          description={t('portal.no_tickets_desc')}
          actionLabel={t('portal.new_ticket')}
          onAction={onCreate}
        />
      ) : (
        <div className="table-wrap" data-testid="ticket-table">
          <table className="table">
            <thead>
              <tr>
                <th>ID</th>
                <th>{t('portal.title_col')}</th>
                <th className="hide-mobile">{t('portal.type_col')}</th>
                <th>{t('portal.status_col')}</th>
                <th>{t('portal.priority_col')}</th>
                <th className="hide-mobile">{t('portal.updated_col')}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((tk) => (
                <tr key={tk.id} onClick={() => onOpen(tk.id)} data-testid={`open-ticket-${tk.id}`}>
                  <td><span className="text-mono">{tk.id.slice(0, 8).toUpperCase()}</span></td>
                  <td><div style={{ fontWeight: 500 }}>{tk.title}</div></td>
                  <td className="hide-mobile"><TicketTypeBadge type={tk.ticketTypeId} /></td>
                  <td><StatusBadge status={tk.status} /></td>
                  <td><PriorityBadge priority={tk.priority} /></td>
                  <td className="text-muted text-small hide-mobile">{new Date(tk.updatedAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex items-center justify-between mt-4">
        <p className="text-small text-muted">
          {t('portal.showing', { count: String(filtered.length) })}
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Agent Queue (Worklist)
// ---------------------------------------------------------------------------

function AgentQueue({
  tickets,
  onOpen,
  onClaim,
}: {
  tickets: Ticket[];
  onOpen: (id: string) => void;
  onClaim: (id: string) => void;
}) {
  const { t } = useI18n();
  const [tab, setTab] = useState('all');

  const filtered = tickets.filter((tk) => {
    if (tab === 'all') return true;
    if (tab === 'unassigned') return !tk.assignedTo;
    if (tab === 'mine') return tk.assignedTo === 'current-user';
    if (tab === 'urgent') return tk.priority === 'urgent';
    return true;
  });

  const unassignedCount = tickets.filter((tk) => !tk.assignedTo).length;
  const urgentCount = tickets.filter((tk) => tk.priority === 'urgent').length;

  return (
    <div className="content" data-testid="agent-queue">
      {/* Stats */}
      <div className="flex gap-6 mb-6 flex-wrap">
        <div className="stat-card">
          <span className="stat-value">{tickets.length}</span>
          <span className="stat-label">{t('portal.stat.total')}</span>
        </div>
        <div className="stat-card">
          <span className="stat-value" style={{ color: 'var(--warn)' }}>{unassignedCount}</span>
          <span className="stat-label">{t('portal.stat.unassigned')}</span>
        </div>
        <div className="stat-card">
          <span className="stat-value" style={{ color: 'var(--accent)' }}>
            {tickets.filter((tk) => tk.assignedTo === 'current-user').length}
          </span>
          <span className="stat-label">{t('portal.stat.mine')}</span>
        </div>
        <div className="stat-card">
          <span className="stat-value" style={{ color: 'var(--danger)' }}>{urgentCount}</span>
          <span className="stat-label">{t('portal.stat.urgent')}</span>
        </div>
      </div>

      {/* Tabs */}
      <div className="tabs">
        {([
          { key: 'all', label: t('portal.tab.all'), count: tickets.length },
          { key: 'unassigned', label: t('portal.tab.unassigned'), count: unassignedCount },
          { key: 'mine', label: t('portal.tab.mine'), count: tickets.filter((tk) => tk.assignedTo === 'current-user').length },
          { key: 'urgent', label: t('portal.tab.urgent'), count: urgentCount },
        ] as const).map((item) => (
          <button
            key={item.key}
            className={`tab${tab === item.key ? ' active' : ''}`}
            onClick={() => setTab(item.key)}
          >
            {item.label} <span className="count">({item.count})</span>
          </button>
        ))}
      </div>

      {/* Filter chips */}
      <div className="filter-bar mb-4">
        <button className="chip active">{t('portal.filter.all_status')}</button>
        <button className="chip">{t('portal.filter.open')}</button>
        <button className="chip">{t('portal.filter.in_progress')}</button>
        <button className="chip">{t('portal.filter.pending')}</button>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <EmptyState
          title={t('portal.no_tickets')}
          description={t('portal.queue_empty_desc')}
        />
      ) : (
        <div className="table-wrap" data-testid="queue-table">
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: 28 }}><input type="checkbox" aria-label={t('portal.select_all')} /></th>
                <th>ID</th>
                <th>{t('portal.title_col')}</th>
                <th className="hide-mobile">{t('portal.requester_col')}</th>
                <th>{t('portal.status_col')}</th>
                <th>{t('portal.priority_col')}</th>
                <th className="hide-mobile">{t('portal.agent_col')}</th>
                <th>{t('portal.updated_col')}</th>
                <th style={{ width: 40 }} />
              </tr>
            </thead>
            <tbody>
              {filtered.map((tk) => (
                <tr key={tk.id} onClick={() => onOpen(tk.id)}>
                  <td onClick={(e) => e.stopPropagation()}>
                    <input type="checkbox" aria-label={t('portal.select_ticket')} />
                  </td>
                  <td><span className="text-mono">{tk.id.slice(0, 8).toUpperCase()}</span></td>
                  <td>
                    <div style={{ fontWeight: 500 }}>{tk.title}</div>
                  </td>
                  <td className="hide-mobile">{tk.createdBy.slice(0, 8)}</td>
                  <td><StatusBadge status={tk.status} /></td>
                  <td><PriorityBadge priority={tk.priority} /></td>
                  <td className="hide-mobile">
                    {tk.assignedTo ? (
                      <span className="flex items-center gap-2">
                        <div className="avatar avatar-sm" style={{ background: 'var(--accent-light)', color: 'var(--accent)' }}>
                          {tk.assignedTo.slice(0, 2).toUpperCase()}
                        </div>
                        {tk.assignedTo.slice(0, 8)}
                      </span>
                    ) : (
                      <span className="badge badge-warn">{t('portal.unassigned')}</span>
                    )}
                  </td>
                  <td className="text-muted text-small">{new Date(tk.updatedAt).toLocaleDateString()}</td>
                  <td onClick={(e) => e.stopPropagation()}>
                    {!tk.assignedTo ? (
                      <button className="btn btn-ghost btn-sm" style={{ color: 'var(--accent)' }} onClick={() => onClaim(tk.id)} data-testid={`claim-${tk.id}`}>
                        {t('portal.claim')}
                      </button>
                    ) : (
                      <button className="btn btn-icon btn-ghost" aria-label="More options">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width={16} height={16}>
                          <circle cx="12" cy="12" r="1"/>
                          <circle cx="12" cy="5" r="1"/>
                          <circle cx="12" cy="19" r="1"/>
                        </svg>
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex items-center justify-between mt-4">
        <p className="text-small text-muted">
          {t('portal.showing_queue', { count: String(filtered.length), total: String(tickets.length) })}
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ticket Detail
// ---------------------------------------------------------------------------

function TicketDetail({
  ticket,
  timeline,
  onBack,
  onSendMessage,
  onAddNote,
  role,
}: {
  ticket: Ticket;
  timeline: TimelineEntry[];
  onBack: () => void;
  onSendMessage: (content: string) => void;
  onAddNote: (content: string) => void;
  role: string;
}) {
  const { t } = useI18n();
  const [message, setMessage] = useState('');
  const [note, setNote] = useState('');
  const [replyMode, setReplyMode] = useState<'public' | 'internal'>('public');

  const handleSubmit = () => {
    if (replyMode === 'public') {
      if (!message.trim()) return;
      onSendMessage(message);
      setMessage('');
    } else {
      if (!note.trim()) return;
      onAddNote(note);
      setNote('');
    }
  };

  return (
    <div className="content" data-testid="ticket-detail">
      {/* Breadcrumb */}
      <div className="breadcrumb mb-4">
        <button onClick={onBack} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer' }}>
          {t('portal.back')}
        </button>
        <span>/</span>
        <span className="current text-mono">{ticket.id.slice(0, 8).toUpperCase()}</span>
      </div>

      {/* Ticket header */}
      <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
        <div style={{ flex: 1, minWidth: 300 }}>
          <div className="flex items-center gap-3 mb-2 flex-wrap">
            <span className="text-mono text-muted">{ticket.id.slice(0, 8).toUpperCase()}</span>
            <StatusBadge status={ticket.status} />
            <TicketTypeBadge type={ticket.ticketTypeId} />
            <PriorityBadge priority={ticket.priority} />
            <VisibilityBadge visibility={ticket.visibility} />
          </div>
          <h1 className="h2">{ticket.title}</h1>
        </div>
      </div>

      {/* Split layout */}
      <div className="split-layout">
        {/* Main: Timeline + Reply */}
        <div className="split-main" data-testid="agent-timeline">
          <h3 className="h4 mb-4">{t('portal.timeline')}</h3>

          {timeline.length === 0 ? (
            <div className="empty-state" style={{ padding: 'var(--sp-6)' }}>
              <p className="text-muted">{t('portal.no_timeline')}</p>
            </div>
          ) : (
            <div className="timeline">
              {timeline.map((entry) => (
                <div
                  key={entry.id}
                  className={`timeline-entry ${
                    entry.kind === 'message' ? 'message' :
                    entry.kind === 'internal_note' ? 'note' :
                    'event'
                  }`}
                  data-testid="timeline-entry"
                >
                  {entry.kind !== 'system_event' && entry.kind !== 'status_change' && entry.kind !== 'priority_change' && entry.kind !== 'assignment_change' && (
                    <div className="avatar" style={
                      entry.kind === 'internal_note'
                        ? { background: 'oklch(88% 0.06 65)', color: 'oklch(45% 0.12 65)' }
                        : entry.authorId === 'current-user'
                          ? { background: 'var(--accent-light)', color: 'var(--accent)' }
                          : {}
                    }>
                      {entry.authorId?.slice(0, 2).toUpperCase() ?? '??'}
                    </div>
                  )}
                  <div className="timeline-entry-body">
                    <div className="timeline-entry-header">
                      {entry.kind === 'message' && <span className="timeline-badge">Mensaje</span>}
                      {entry.kind === 'internal_note' && (
                        <span className="timeline-badge">
                          <IconLock size={11} /> Nota interna
                        </span>
                      )}
                      {entry.kind === 'system_event' && <span className="timeline-badge">Sistema</span>}
                      {entry.kind === 'status_change' && <span className="timeline-badge">Sistema</span>}
                      {entry.kind === 'priority_change' && <span className="timeline-badge">Sistema</span>}
                      {entry.kind === 'assignment_change' && <span className="timeline-badge">Sistema</span>}
                      <span className="timeline-time">
                        {new Date(entry.createdAt).toLocaleString()}
                      </span>
                    </div>
                    <div className="timeline-content">{entry.content}</div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Reply box */}
          <div className="reply-box mt-6" data-testid="reply-box">
            {role !== 'requester' && (
              <div className="reply-box-header">
                <button
                  className={`reply-mode-tab${replyMode === 'public' ? ' active' : ''}`}
                  onClick={() => setReplyMode('public')}
                >
                  <IconMail size={14} />
                  {t('portal.reply')}
                </button>
                <button
                  className={`reply-mode-tab${replyMode === 'internal' ? ' active note' : ''}`}
                  onClick={() => setReplyMode('internal')}
                >
                  <IconLock size={14} />
                  {t('portal.internal_note')}
                </button>
              </div>
            )}
            <textarea
              className="textarea"
              value={replyMode === 'public' ? message : note}
              onChange={(e) => replyMode === 'public' ? setMessage(e.target.value) : setNote(e.target.value)}
              placeholder={replyMode === 'public' ? t('portal.message_placeholder') : t('portal.note_placeholder')}
              aria-label={replyMode === 'public' ? t('portal.reply') : t('portal.internal_note')}
              data-testid={replyMode === 'public' ? 'message-input' : 'internal-note-input'}
            />
            <div className="reply-box-footer">
              <div className="flex items-center gap-2">
                <button className="btn btn-ghost btn-sm">
                  <IconPaperclip size={16} />
                  {t('portal.attach')}
                </button>
              </div>
              <button
                className="btn btn-primary btn-sm"
                onClick={handleSubmit}
                data-testid={replyMode === 'public' ? 'send-message-btn' : 'send-note-btn'}
              >
                {replyMode === 'public' ? t('portal.send_reply') : t('portal.send_note')}
              </button>
            </div>
          </div>
        </div>

        {/* Sidebar: Properties */}
        <div className="split-side" data-testid="ticket-sidebar">
          <div className="card mb-4">
            <div className="card-header">
              <span className="card-title">{t('portal.properties')}</span>
            </div>
            <div className="card-body">
              <div className="info-row">
                <span className="info-label">{t('portal.status_col')}</span>
                <StatusBadge status={ticket.status} />
              </div>
              <div className="info-row">
                <span className="info-label">{t('portal.priority_col')}</span>
                <PriorityBadge priority={ticket.priority} />
              </div>
              <div className="info-row">
                <span className="info-label">{t('portal.type_col')}</span>
                <span className="info-value">{ticket.ticketTypeId ?? '—'}</span>
              </div>
              <div className="info-row">
                <span className="info-label">{t('portal.assigned')}</span>
                <span className="info-value">
                  {ticket.assignedTo ? ticket.assignedTo.slice(0, 8) : t('portal.unassigned')}
                </span>
              </div>
              <div className="info-row">
                <span className="info-label">{t('portal.created_col')}</span>
                <span className="info-value">{new Date(ticket.createdAt).toLocaleDateString()}</span>
              </div>
            </div>
          </div>

          {ticket.description && (
            <div className="card">
              <div className="card-header">
                <span className="card-title">{t('portal.description')}</span>
              </div>
              <div className="card-body">
                <p className="text-small" style={{ lineHeight: 1.6 }}>{ticket.description}</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Create Ticket
// ---------------------------------------------------------------------------

function CreateTicket({
  onSubmit,
  onBack,
}: {
  onSubmit: (title: string, description: string) => void;
  onBack: () => void;
}) {
  const { t } = useI18n();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');

  return (
    <div className="content" data-testid="create-ticket">
      <div className="breadcrumb mb-4">
        <button onClick={onBack} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer' }}>
          {t('portal.back')}
        </button>
        <span>/</span>
        <span className="current">{t('portal.new_ticket')}</span>
      </div>

      <div className="card" style={{ maxWidth: 600 }}>
        <div className="card-header">
          <span className="card-title">{t('portal.new_ticket_title')}</span>
        </div>
        <div className="card-body">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              onSubmit(title, description);
            }}
          >
            <div className="field">
              <label className="label" htmlFor="ticket-title">
                {t('portal.title_label')} <span className="required" aria-hidden="true">*</span>
              </label>
              <input
                className="input"
                id="ticket-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                aria-required="true"
              />
            </div>

            <div className="field">
              <label className="label" htmlFor="ticket-desc">
                {t('portal.description_label')}
              </label>
              <textarea
                className="textarea"
                id="ticket-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>

            <div className="flex gap-2" style={{ justifyContent: 'flex-end' }}>
              <button type="button" className="btn btn-secondary" onClick={onBack}>
                {t('portal.cancel')}
              </button>
              <button type="submit" className="btn btn-primary" data-testid="submit-ticket-btn">
                <IconPlus size={16} />
                {t('portal.create')}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Bottom Navigation (Mobile)
// ---------------------------------------------------------------------------

function BottomNav({ currentPage, onNavigate, isAgent }: { currentPage: string; onNavigate: (page: string) => void; isAgent: boolean }) {
  const { t } = useI18n();
  return (
    <nav className="bottom-nav" data-testid="bottom-nav">
      {isAgent ? (
        <>
          <button className={`bottom-nav-item${currentPage === 'queue' ? ' active' : ''}`} onClick={() => onNavigate('queue')}>
            <IconInbox size={22} />
            {t('portal.inbox')}
          </button>
          <button className={`bottom-nav-item${currentPage === 'my-tickets' ? ' active' : ''}`} onClick={() => onNavigate('my-tickets')}>
            <IconTicket size={22} />
            {t('portal.my_tickets')}
          </button>
        </>
      ) : (
        <>
          <button className={`bottom-nav-item${currentPage === 'ticket-list' ? ' active' : ''}`} onClick={() => onNavigate('ticket-list')}>
            <IconTicket size={22} />
            {t('portal.tickets')}
          </button>
          <button className={`bottom-nav-item${currentPage === 'create-ticket' ? ' active' : ''}`} onClick={() => onNavigate('create-ticket')}>
            <IconPlus size={22} />
            {t('portal.new_ticket')}
          </button>
        </>
      )}
      <button className="bottom-nav-item">
        <IconGear size={22} />
        {t('portal.settings')}
      </button>
    </nav>
  );
}

// ---------------------------------------------------------------------------
// App Content (inside I18nProvider)
// ---------------------------------------------------------------------------

type Page =
  | 'login'
  | 'workspace-select'
  | 'ticket-list'
  | 'ticket-detail'
  | 'create-ticket'
  | 'queue'
  | 'my-tickets'
  | 'admin-queues'
  | 'admin-members';

function AppContent() {
  const { t } = useI18n();
  const [page, setPage] = useState<Page>('login');
  const [user, setUser] = useState<User | null>(null);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const loadTickets = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await api<Ticket[]>('/api/tickets');
      setTickets(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load tickets');
      setTickets([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (page === 'ticket-list' || page === 'queue' || page === 'my-tickets') loadTickets();
  }, [page, loadTickets]);

  const handleLogin = useCallback((_user: User, ws: Workspace) => {
    setUser(_user);
    setWorkspace(ws);
    setPage(ws.role === 'agent' || ws.role === 'workspace-admin' ? 'queue' : 'ticket-list');
  }, []);

  const handleWorkspaceSelect = useCallback((ws: Workspace) => {
    setWorkspace(ws);
    setPage(ws.role === 'agent' || ws.role === 'workspace-admin' ? 'queue' : 'ticket-list');
  }, []);

  const handleOpenTicket = useCallback(async (id: string) => {
    try {
      const ticket = await api<Ticket>(`/api/tickets/${id}`);
      setSelectedTicket(ticket);
      const tl = await api<TimelineEntry[]>(`/api/tickets/${id}/timeline`);
      setTimeline(tl);
      setPage('ticket-detail');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load ticket');
    }
  }, []);

  const handleSendMessage = useCallback(async (content: string) => {
    if (!selectedTicket) return;
    try {
      await api(`/api/tickets/${selectedTicket.id}/timeline`, {
        method: 'POST',
        body: JSON.stringify({ kind: 'message', content, visibility: 'public' }),
      });
      const tl = await api<TimelineEntry[]>(`/api/tickets/${selectedTicket.id}/timeline`);
      setTimeline(tl);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to send message');
    }
  }, [selectedTicket]);

  const handleAddNote = useCallback(async (content: string) => {
    if (!selectedTicket) return;
    try {
      await api(`/api/tickets/${selectedTicket.id}/timeline`, {
        method: 'POST',
        body: JSON.stringify({ kind: 'internal_note', content, visibility: 'internal' }),
      });
      const tl = await api<TimelineEntry[]>(`/api/tickets/${selectedTicket.id}/timeline`);
      setTimeline(tl);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to add note');
    }
  }, [selectedTicket]);

  const handleClaim = useCallback(async (id: string) => {
    try {
      await api(`/api/tickets/${id}/claim`, { method: 'POST' });
      loadTickets();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to claim ticket');
    }
  }, [loadTickets]);

  const handleCreateTicket = useCallback(async (title: string, description: string) => {
    try {
      await api('/api/tickets', {
        method: 'POST',
        body: JSON.stringify({ title, description }),
      });
      setPage(workspace?.role === 'agent' || workspace?.role === 'workspace-admin' ? 'queue' : 'ticket-list');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create ticket');
    }
  }, [workspace]);

  const isAgent = workspace?.role === 'agent' || workspace?.role === 'workspace-admin';

  return (
    <div className="app" data-testid="app-root">
      {/* Sidebar (desktop) */}
      {page !== 'login' && page !== 'workspace-select' && (
        <Sidebar
          currentPage={page}
          onNavigate={(p) => setPage(p as Page)}
          workspace={workspace}
          ticketCount={tickets.length}
        />
      )}

      <div className="main">
        {/* Topbar */}
        {page !== 'login' && page !== 'workspace-select' && page !== 'ticket-detail' && (
          <header className="topbar" data-testid="topbar">
            <div className="topbar-title">{t(`portal.page.${page}`) || page}</div>
            <div className="topbar-spacer" />
            <div className="search-input hide-mobile">
              <IconSearch />
              <input type="search" className="input" placeholder={t('portal.search')} aria-label={t('portal.search')} />
            </div>
            <LocaleSwitcher />
            <button className="btn btn-icon btn-ghost" aria-label="Notifications">
              <IconBell />
            </button>
            <div className="avatar" style={{ background: 'var(--accent-light)', color: 'var(--accent)' }}>U</div>
          </header>
        )}

        {/* Error banner */}
        {error && (
          <div className="p-4" style={{ background: 'var(--danger-light)', borderBottom: '1px solid var(--danger)' }} role="alert">
            <div className="flex items-center justify-between">
              <span className="text-small" style={{ color: 'var(--danger)' }}>{error}</span>
              <button className="btn btn-ghost btn-sm" onClick={() => setError('')}>×</button>
            </div>
          </div>
        )}

        {/* Pages */}
        {page === 'login' && <Login onLogin={handleLogin} />}
        {page === 'workspace-select' && (
          <WorkspaceSelector workspaces={[]} onSelect={handleWorkspaceSelect} />
        )}

        {page === 'ticket-list' && (
          loading ? <div className="content"><LoadingSkeleton /></div> :
          <TicketList
            tickets={tickets}
            onOpen={handleOpenTicket}
            onCreate={() => setPage('create-ticket')}
          />
        )}

        {(page === 'queue' || page === 'my-tickets') && (
          loading ? <div className="content"><LoadingSkeleton /></div> :
          <AgentQueue
            tickets={page === 'my-tickets' ? tickets.filter((tk) => tk.assignedTo === 'current-user') : tickets}
            onOpen={handleOpenTicket}
            onClaim={handleClaim}
          />
        )}

        {page === 'ticket-detail' && selectedTicket && (
          <TicketDetail
            ticket={selectedTicket}
            timeline={timeline}
            onBack={() => setPage(isAgent ? 'queue' : 'ticket-list')}
            onSendMessage={handleSendMessage}
            onAddNote={handleAddNote}
            role={workspace?.role ?? 'requester'}
          />
        )}

        {page === 'create-ticket' && (
          <CreateTicket
            onSubmit={handleCreateTicket}
            onBack={() => setPage(isAgent ? 'queue' : 'ticket-list')}
          />
        )}
      </div>

      {/* Bottom nav (mobile) */}
      {page !== 'login' && page !== 'workspace-select' && (
        <BottomNav
          currentPage={page}
          onNavigate={(p) => setPage(p as Page)}
          isAgent={isAgent}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Root App
// ---------------------------------------------------------------------------

export default function App() {
  return (
    <I18nProvider>
      <ErrorBoundary>
        <AppContent />
      </ErrorBoundary>
    </I18nProvider>
  );
}
