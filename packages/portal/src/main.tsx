import React, { useState, useEffect, useCallback, useRef, createContext, useContext } from 'react';
import { createRoot } from 'react-dom/client';
import { t as translate, resolveInitialLocale, SUPPORTED_LOCALES, type Locale } from './i18n';
import { MembersPage, OrganizationsPage, StatusConfigurationPage, QueuesPage } from './AdminPages';
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
  statusId: string;
  statusName: string;
  statusCategory: string;
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

/** An Attachment as the authorized download/list endpoints report it (S1). */
interface AttachmentItem {
  id: string;
  ticketId: string;
  filename: string;
  mimeType: string;
  size: number;
  status: string;
  visibility: 'public' | 'internal';
  createdAt: string;
}

interface ConfigurationItem {
  id: string;
  name: string;
  description: string | null;
  color: string;
  sortOrder: number;
  isDefault: boolean;
}

interface SelectableConfiguration {
  statuses: ConfigurationItem[];
  priorities: ConfigurationItem[];
  ticketTypes: ConfigurationItem[];
}

interface ApiError extends Error {
  code?: string;
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
    return resolveInitialLocale(saved, navigator.languages);
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

// In development Vite proxies /api to the Docker app. In deployments this
// remains same-origin unless an explicit public API URL is configured.
const API_BASE = import.meta.env.VITE_API_URL ?? '';

async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: 'include',
    ...options,
    // A JSON content-type without a body is rejected by the server, so only
    // declare it when there is something to parse.
    headers: {
      ...(options?.body != null ? { 'Content-Type': 'application/json' } : {}),
      ...options?.headers,
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null) as { error?: string; code?: string } | null;
    const error = new Error(body?.error || res.statusText);
    (error as ApiError).code = body?.code;
    throw error;
  }
  return res.json();
}

/**
 * Upload one Attachment (S1). This cannot go through `api()`: the browser owns
 * the multipart boundary, so no Content-Type may be set by hand.
 */
async function uploadAttachment(
  ticketId: string,
  file: File,
  visibility: 'public' | 'internal',
): Promise<AttachmentItem> {
  const form = new FormData();
  form.append('visibility', visibility);
  form.append('file', file);
  const res = await fetch(`${API_BASE}/api/tickets/${ticketId}/attachments`, {
    method: 'POST',
    credentials: 'include',
    body: form,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null) as { error?: string; code?: string } | null;
    const error = new Error(body?.error || res.statusText);
    (error as ApiError).code = body?.code;
    throw error;
  }
  return res.json();
}

/** Human-readable Attachment size for the sidebar list. */
function formatAttachmentSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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

// Import t directly for class component (ErrorBoundary)
function getDefaultLocale(): Locale {
  const saved = localStorage.getItem('ticketos-locale');
  return (saved === 'es' || saved === 'en') ? saved : 'en';
}

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
          <h2 className="error-state-title">{translate(getDefaultLocale(), 'portal.error_boundary_title')}</h2>
          <p className="error-state-desc">{this.state.error?.message || translate(getDefaultLocale(), 'portal.error_boundary_desc')}</p>
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
  const { t } = useI18n();
  return (
    <div role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">{t('portal.loading')}</span>
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
    <select
      className="input"
      style={{ width: 'auto', padding: '4px 8px', fontSize: 'var(--text-sm)', height: 'fit-content' }}
      value={locale}
      onChange={(e) => setLocale(e.target.value as Locale)}
      aria-label="Language"
      data-testid="locale-switcher"
    >
      {SUPPORTED_LOCALES.map((l) => (
        <option key={l.code} value={l.code}>{l.nativeLabel}</option>
      ))}
    </select>
  );
}

// ---------------------------------------------------------------------------
// Badge helpers
// ---------------------------------------------------------------------------

// Canonical Status Categories (S5). The badge class comes from the category,
// the label comes from the Workspace-configured Status name.
const STATUS_CATEGORY_STYLES: Record<string, { class: string; dot: string }> = {
  new: { class: 'badge-neutral', dot: 'var(--neutral)' },
  open: { class: 'badge-info', dot: 'var(--info)' },
  pending: { class: 'badge-warn', dot: 'var(--warn)' },
  resolved: { class: 'badge-success', dot: 'var(--success)' },
  closed: { class: 'badge-danger', dot: 'var(--danger)' },
};

function StatusBadge({ name, category }: { name: string; category: string }) {
  const { t } = useI18n();
  const style = STATUS_CATEGORY_STYLES[category] ?? { class: 'badge-neutral', dot: 'var(--neutral)' };
  // i18n by category when a translation exists, otherwise the configured name.
  const key = `portal.status.${category}`;
  const translated = t(key);
  const label = translated === key ? name : translated;
  return (
    <span className={`badge ${style.class}`}>
      <span className="status-dot" style={{ background: style.dot }} />
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
    } catch {
      // Never echo the server message. The same neutral copy must cover an
      // unknown address and a delivery failure, so the form cannot reveal
      // whether Workspace Memberships exist for the email.
      setError(t('portal.magic_link_error'));
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
// Support Landing (unauthenticated)
// ---------------------------------------------------------------------------

function Landing({ onOpenTicket }: { onOpenTicket: () => void }) {
  const { t } = useI18n();
  return (
    <main className="auth-page" data-testid="landing-page">
      <div className="auth-card landing-card">
        <div className="auth-brand">
          <div className="logo">T</div>
          <div className="brand-name">ticket<span className="os">OS</span></div>
        </div>

        <h1 className="auth-title">{t('portal.landing_title')}</h1>
        <p className="auth-subtitle" data-testid="landing-tagline">
          {t('portal.landing_tagline')}
        </p>

        <button
          type="button"
          className="btn btn-primary btn-block btn-lg"
          onClick={onOpenTicket}
          data-testid="open-ticket-btn"
        >
          <IconTicket size={18} />
          {t('portal.open_ticket')}
        </button>

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
                aria-label={`${ws.name} — ${ws.role ?? t('portal.member')}`}
              >
                <div style={{ width: 36, height: 36, borderRadius: 'var(--r-md)', background: 'var(--accent-light)', color: 'var(--accent)', display: 'grid', placeItems: 'center', fontWeight: 700, fontSize: 14 }}>
                  {ws.name.charAt(0).toUpperCase()}
                </div>
                <div style={{ textAlign: 'left' }}>
                  <div style={{ fontWeight: 600 }}>{ws.name}</div>
                  <div className="text-small text-muted">{ws.role ?? t('portal.member')}</div>
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
  onLogout,
}: {
  currentPage: string;
  onNavigate: (page: string) => void;
  workspace: Workspace | null;
  ticketCount: number;
  onLogout: () => void;
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
            <button className={`nav-item${currentPage === 'admin-organizations' ? ' active' : ''}`} onClick={() => onNavigate('admin-organizations')}>
              <IconUsers />
              <span>{t('portal.organizations')}</span>
            </button>
            <button className={`nav-item${currentPage === 'admin-queues' ? ' active' : ''}`} onClick={() => onNavigate('admin-queues')}>
              <IconInbox />
              <span>{t('portal.queues')}</span>
            </button>
            <button className={`nav-item${currentPage === 'admin-members' ? ' active' : ''}`} onClick={() => onNavigate('admin-members')}>
              <IconUsers />
              <span>{t('portal.members')}</span>
            </button>
            <button className={`nav-item${currentPage === 'admin-statuses' ? ' active' : ''}`} onClick={() => onNavigate('admin-statuses')}>
              <IconGear />
              <span>{t('portal.settings')}</span>
            </button>
          </>
        )}
      </nav>
      <div className="sidebar-footer">
        <div className="workspace-switcher" style={{ cursor: 'pointer' }} onClick={onLogout} title={t('portal.logout')}>
          <div className="ws-icon">{workspace?.name?.charAt(0).toUpperCase() ?? '?'}</div>
          <div>
            <div className="ws-name">{workspace?.name ?? '—'}</div>
            <div className="ws-role">{t('portal.logout')}</div>
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
    if (filter === 'open') return tk.statusCategory !== 'resolved' && tk.statusCategory !== 'closed';
    if (filter === 'resolved') return tk.statusCategory === 'resolved';
    if (filter === 'closed') return tk.statusCategory === 'closed';
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
                if (f === 'open') return tk.statusCategory !== 'resolved' && tk.statusCategory !== 'closed';
                if (f === 'resolved') return tk.statusCategory === 'resolved';
                if (f === 'closed') return tk.statusCategory === 'closed';
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
                  <td><StatusBadge name={tk.statusName} category={tk.statusCategory} /></td>
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
  currentUserId,
  onOpen,
  onClaim,
}: {
  tickets: Ticket[];
  currentUserId: string | null;
  onOpen: (id: string) => void;
  onClaim: (id: string) => void;
}) {
  const { t } = useI18n();
  const [tab, setTab] = useState('all');

  const filtered = tickets.filter((tk) => {
    if (tab === 'all') return true;
    if (tab === 'unassigned') return !tk.assignedTo;
    if (tab === 'mine') return tk.assignedTo !== null && tk.assignedTo === currentUserId;
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
            {tickets.filter((tk) => tk.assignedTo !== null && tk.assignedTo === currentUserId).length}
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
          { key: 'mine', label: t('portal.tab.mine'), count: tickets.filter((tk) => tk.assignedTo !== null && tk.assignedTo === currentUserId).length },
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
                  <td><StatusBadge name={tk.statusName} category={tk.statusCategory} /></td>
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
  attachments,
  currentUserId,
  onBack,
  onSendMessage,
  onAddNote,
  onUploadAttachment,
  role,
}: {
  ticket: Ticket;
  timeline: TimelineEntry[];
  attachments: AttachmentItem[];
  currentUserId: string | null;
  onBack: () => void;
  onSendMessage: (content: string) => void;
  onAddNote: (content: string) => void;
  onUploadAttachment: (file: File, visibility: 'public' | 'internal') => Promise<void>;
  role: string;
}) {
  const { t } = useI18n();
  const [message, setMessage] = useState('');
  const [note, setNote] = useState('');
  const [replyMode, setReplyMode] = useState<'public' | 'internal'>('public');
  const [uploading, setUploading] = useState(false);
  const [attachError, setAttachError] = useState('');

  // S1: an Attachment uploaded while the Internal-Note tab is active is an
  // Internal-Note Attachment, and Requesters may not create one.
  const handleFileSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setUploading(true);
    setAttachError('');
    try {
      await onUploadAttachment(
        file,
        replyMode === 'internal' && role !== 'requester' ? 'internal' : 'public',
      );
    } catch {
      setAttachError(t('portal.attach_failed'));
    } finally {
      setUploading(false);
    }
  };

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
            <StatusBadge name={ticket.statusName} category={ticket.statusCategory} />
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
                        : entry.authorId !== null && entry.authorId === currentUserId
                          ? { background: 'var(--accent-light)', color: 'var(--accent)' }
                          : {}
                    }>
                      {entry.authorId?.slice(0, 2).toUpperCase() ?? '??'}
                    </div>
                  )}
                  <div className="timeline-entry-body">
                    <div className="timeline-entry-header">
                      {entry.kind === 'message' && <span className="timeline-badge">{t('portal.timeline.message')}</span>}
                      {entry.kind === 'internal_note' && (
                        <span className="timeline-badge">
                          <IconLock size={11} /> {t('portal.timeline.internal_note')}
                        </span>
                      )}
                      {entry.kind === 'system_event' && <span className="timeline-badge">{t('portal.timeline.system_event')}</span>}
                      {entry.kind === 'status_change' && <span className="timeline-badge">{t('portal.timeline.system_event')}</span>}
                      {entry.kind === 'priority_change' && <span className="timeline-badge">{t('portal.timeline.system_event')}</span>}
                      {entry.kind === 'assignment_change' && <span className="timeline-badge">{t('portal.timeline.system_event')}</span>}
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
                {/* S1: the Attach control uploads through the authorized endpoint. */}
                <label
                  className="btn btn-ghost btn-sm"
                  style={{ cursor: uploading ? 'progress' : 'pointer' }}
                >
                  <IconPaperclip size={16} />
                  {uploading ? t('portal.attach_uploading') : t('portal.attach')}
                  <input
                    type="file"
                    data-testid="attach-input"
                    onChange={handleFileSelected}
                    disabled={uploading}
                    style={{ display: 'none' }}
                  />
                </label>
                {attachError && (
                  <span className="text-small" role="alert" style={{ color: 'oklch(52% 0.18 25)' }}>
                    {attachError}
                  </span>
                )}
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
                <StatusBadge name={ticket.statusName} category={ticket.statusCategory} />
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

          {/* S1: Attachments, listed from the authorized endpoint. The download
              link is that same endpoint, never a public object URL. */}
          <div className="card mt-4" data-testid="attachment-list">
            <div className="card-header">
              <span className="card-title">{t('portal.attachments')}</span>
            </div>
            <div className="card-body">
              {attachments.length === 0 ? (
                <p className="text-small text-muted">{t('portal.no_attachments')}</p>
              ) : (
                attachments.map((attachment) => (
                  <div
                    key={attachment.id}
                    className="info-row"
                    data-testid="attachment-item"
                  >
                    <span className="info-value text-small" style={{ wordBreak: 'break-all' }}>
                      {attachment.visibility === 'internal' && <IconLock size={11} />}{' '}
                      {attachment.filename}
                      <span className="text-muted text-small">
                        {' '}({formatAttachmentSize(attachment.size)})
                      </span>
                    </span>
                    <a
                      className="text-small"
                      data-testid="attachment-download"
                      href={`${API_BASE}/api/tickets/${ticket.id}/attachments/${attachment.id}`}
                      download={attachment.filename}
                    >
                      {t('portal.download')}
                    </a>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Select (shared helpers for config-driven selects)
// ---------------------------------------------------------------------------

function configSelect({
  value,
  options,
  onChange,
  label,
  required,
  placeholder,
  id,
}: {
  value: string;
  options: ConfigurationItem[];
  onChange: (v: string) => void;
  label: string;
  required?: boolean;
  placeholder?: string;
  id: string;
}) {
  return (
    <div className="field">
      <label className="label" htmlFor={id}>
        {label} {required && <span className="required" aria-hidden="true">*</span>}
      </label>
      <select
        className="input"
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        aria-required={required}
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Create Ticket — driven by workspace configuration
// ---------------------------------------------------------------------------

function CreateTicket({
  onSubmit,
  onBack,
}: {
  onSubmit: (
    title: string,
    description: string,
    ticketTypeId: string,
    priorityId: string,
  ) => Promise<void>;
  onBack: () => void;
}) {
  const { t } = useI18n();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [ticketTypeId, setTicketTypeId] = useState('');
  const [priorityId, setPriorityId] = useState('');
  const [configuration, setConfiguration] = useState<SelectableConfiguration | null>(null);
  const [configLoading, setConfigLoading] = useState(true);
  const [configError, setConfigError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Load configuration when the component mounts
  useEffect(() => {
    let cancelled = false;
    setConfigLoading(true);
    setConfigError(null);
    api<SelectableConfiguration>('/api/tickets/selectable-configuration')
      .then((data) => {
        if (cancelled) return;
        setConfiguration(data);
        // Pre-select workspace defaults on open
        setTicketTypeId(data.ticketTypes.find((t) => t.isDefault)?.id ?? '');
        setPriorityId(data.priorities.find((p) => p.isDefault)?.id ?? '');
        setConfigLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setConfigError(t('portal.create_ticket_config_error'));
        setConfigLoading(false);
      });
    return () => { cancelled = true; };
  }, [t]);



  const needsTicketType =
    !!configuration &&
    configuration.ticketTypes.every((t) => !t.isDefault);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSubmitError(null);
    setSubmitting(true);
    try {
      await onSubmit(title, description, ticketTypeId, priorityId);
    } catch (err: unknown) {
      setSubmitting(false);
      if (err instanceof Error) {
        const apiErr = err as ApiError;
        // Map server code to localized copy (S10 — never show raw messages)
        if (apiErr.code) {
          const codeKey = `portal.create_ticket_error_${apiErr.code}`;
          setSubmitError(t(codeKey) !== codeKey ? t(codeKey) : t('portal.create_ticket_error_server'));
        } else {
          setSubmitError(t('portal.create_ticket_error_server'));
        }
      }
    }
  };

  // Show loading state while configuration is in flight
  if (configLoading) {
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
            <p className="text-muted">{t('portal.create_ticket_loading')}</p>
          </div>
        </div>
      </div>
    );
  }

  // Show inline error with retry when configuration load fails
  if (configError) {
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
            <p className="text-small" style={{ color: 'var(--danger)' }} role="alert">{configError}</p>
            <button className="btn btn-primary btn-sm" onClick={() => window.location.reload()}>
              {t('portal.create_ticket_retry')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  const types = configuration?.ticketTypes ?? [];
  const priorities = configuration?.priorities ?? [];

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
          <form onSubmit={handleSubmit}>
            {submitError && (
              <p className="text-small mb-4" style={{ color: 'var(--danger)' }} role="alert">
                {submitError}
              </p>
            )}

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

            {configSelect({
              value: ticketTypeId,
              options: types,
              onChange: setTicketTypeId,
              label: t('portal.ticket_type_label'),
              required: needsTicketType,
              placeholder: t('portal.ticket_type_placeholder'),
              id: 'ticket-type',
            })}

            {configSelect({
              value: priorityId,
              options: priorities,
              onChange: setPriorityId,
              label: t('portal.priority_label'),
              required: false,
              placeholder: t('portal.priority_placeholder'),
              id: 'ticket-priority',
            })}

            <div className="flex gap-2" style={{ justifyContent: 'flex-end' }}>
              <button type="button" className="btn btn-secondary" onClick={onBack}>
                {t('portal.cancel')}
              </button>
              <button type="submit" className="btn btn-primary" data-testid="submit-ticket-btn" disabled={submitting}>
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
// Setup Wizard (First-run onboarding)
// ---------------------------------------------------------------------------

// Timezones offered when the browser cannot report one, plus a small set of
// common values. The browser's own timezone is always added at render time, so a
// detected zone outside this list still appears selected instead of blank.
const SETUP_TIMEZONES = [
  'UTC', 'America/Mexico_City', 'America/New_York', 'America/Los_Angeles',
  'America/Chicago', 'America/Sao_Paulo', 'Europe/London', 'Europe/Madrid',
  'Europe/Berlin', 'Asia/Tokyo', 'Asia/Shanghai', 'Australia/Sydney',
];

/** Browser timezone with the documented `UTC` fallback. */
function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

function SetupWizard() {
  const { t, locale } = useI18n();
  const [workspaceName, setWorkspaceName] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [adminName, setAdminName] = useState('');
  const [timezone, setTimezone] = useState(browserTimeZone);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await api<{ workspaceId: string }>('/api/setup/bootstrap', {
        method: 'POST',
        body: JSON.stringify({
          workspaceName,
          adminEmail,
          adminName,
          locale,
          timezone: timezone || 'UTC',
        }),
      });
      // The Setup HTTP adapter sets the HttpOnly session cookie.
      window.location.href = window.location.pathname;
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('portal.setup_failed'));
    } finally {
      setLoading(false);
    }
  };

  const timezones = SETUP_TIMEZONES.includes(timezone)
    ? SETUP_TIMEZONES
    : [...SETUP_TIMEZONES, timezone];

  return (
    <main className="auth-page" data-testid="setup-wizard">
      <div className="auth-card" style={{ maxWidth: 480 }}>
        <div className="auth-brand">
          <div className="logo">T</div>
          <div className="brand-name">ticket<span className="os">OS</span></div>
        </div>

        <h1 className="auth-title">{t('portal.setup_title')}</h1>
        <p className="auth-subtitle">{t('portal.setup_subtitle')}</p>

        <form onSubmit={handleSubmit}>
          <div className="field">
            <label className="label" htmlFor="ws-name">
              {t('portal.setup_workspace_name')} <span className="required">*</span>
            </label>
            <input className="input" id="ws-name" value={workspaceName}
              onChange={(e) => setWorkspaceName(e.target.value)} required autoFocus />
          </div>

          <div className="field">
            <label className="label" htmlFor="admin-email">
              {t('portal.setup_admin_email')} <span className="required">*</span>
            </label>
            <input className="input" id="admin-email" type="email" value={adminEmail}
              onChange={(e) => setAdminEmail(e.target.value)} required />
          </div>

          <div className="field">
            <label className="label" htmlFor="admin-name">
              {t('portal.setup_admin_name')}
            </label>
            <input className="input" id="admin-name" value={adminName}
              onChange={(e) => setAdminName(e.target.value)} />
          </div>

          <div className="field">
            <label className="label" htmlFor="timezone">
              {t('portal.setup_timezone')}
            </label>
            <select className="input" id="timezone" value={timezone}
              onChange={(e) => setTimezone(e.target.value)}>
              {timezones.map((tz) => (
                <option key={tz} value={tz}>{tz}</option>
              ))}
            </select>
          </div>

          <button type="submit" className="btn btn-primary btn-block btn-lg" disabled={loading}>
            {loading ? t('portal.setup_creating') : t('portal.setup_start')}
          </button>
        </form>

        {error && <p className="mt-4 text-center text-small" style={{ color: 'var(--danger)' }} role="alert">{error}</p>}

        <div className="divider" />
        <div className="flex justify-center items-center gap-2">
          <LocaleSwitcher />
        </div>
      </div>
    </main>
  );
}

// ---------------------------------------------------------------------------
// App Content (inside I18nProvider)
// ---------------------------------------------------------------------------

type Page =
  | 'loading'
  | 'setup'
  | 'landing'
  | 'login'
  | 'workspace-select'
  | 'ticket-list'
  | 'ticket-detail'
  | 'create-ticket'
  | 'queue'
  | 'my-tickets'
  | 'admin-queues'
  | 'admin-members'
  | 'admin-organizations'
  | 'admin-statuses';

// ---------------------------------------------------------------------------
// Safe post-login destination
// ---------------------------------------------------------------------------

// The only pages an unauthenticated visitor may be returned to after signing
// in. This is a fixed allowlist of internal Page values: there is no URL-based
// routing, so no URL string is ever stored, validated or navigated to.
const POST_LOGIN_DESTINATIONS = ['create-ticket'] as const;
type PostLoginDestination = (typeof POST_LOGIN_DESTINATIONS)[number];
const POST_LOGIN_DESTINATION_KEY = 'ticketos-post-login-destination';

function isPostLoginDestination(value: string | null): value is PostLoginDestination {
  return value !== null && (POST_LOGIN_DESTINATIONS as readonly string[]).includes(value);
}

/** Record where an authenticated-only action should land once the User signs in. */
function rememberPostLoginDestination(destination: PostLoginDestination): void {
  try {
    // localStorage (not sessionStorage): a magic link can complete in a new tab.
    localStorage.setItem(POST_LOGIN_DESTINATION_KEY, destination);
  } catch {
    // Storage unavailable: the sign-in still works, it just lands on the
    // default Workspace page.
  }
}

/** Read and clear the recorded destination, so it is used exactly once. */
function consumePostLoginDestination(): PostLoginDestination | null {
  try {
    const stored = localStorage.getItem(POST_LOGIN_DESTINATION_KEY);
    if (stored === null) return null;
    localStorage.removeItem(POST_LOGIN_DESTINATION_KEY);
    return isPostLoginDestination(stored) ? stored : null;
  } catch {
    return null;
  }
}

function forgetPostLoginDestination(): void {
  try {
    localStorage.removeItem(POST_LOGIN_DESTINATION_KEY);
  } catch {
    // Storage unavailable — nothing to forget.
  }
}

/** The page an authenticated User lands on inside their active Workspace. */
function workspaceHomePage(role: string | undefined): Page {
  return role === 'agent' || role === 'workspace-admin' ? 'queue' : 'ticket-list';
}

function AppContent() {
  const { t, locale } = useI18n();
  const [page, setPage] = useState<Page>('loading');
  const [user, setUser] = useState<User | null>(null);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [availableWorkspaces, setAvailableWorkspaces] = useState<Workspace[]>([]);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);
  const [attachments, setAttachments] = useState<AttachmentItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // -------------------------------------------------------------------------
  // Session hydration — runs once on mount
  // -------------------------------------------------------------------------
  const hydrationStarted = useRef(false);
  useEffect(() => {
    // React StrictMode replays effects in development. A magic link is
    // single-use, so exchanging it twice would turn a successful login into
    // an "expired token" error on the replay.
    if (hydrationStarted.current) return;
    hydrationStarted.current = true;

    // Step 1: check for magic-link token in URL
    const tokenParam = new URLSearchParams(window.location.search).get('token');

    void (async () => {
      if (tokenParam) {
        try {
          // Exchange token for session
          await api('/api/auth/verify', {
            method: 'POST',
            body: JSON.stringify({ token: tokenParam }),
          });
          window.history.replaceState({}, '', window.location.pathname);
          // Session cookie is now set; continue to session check
        } catch {
          setError('Invalid or expired magic link');
          setPage('login');
          return;
        }
      }

      // Step 2: check existing session
      try {
        const session = await api<{
          authenticated: boolean;
          userId?: string;
          workspaceId?: string;
          workspaces?: Workspace[];
        }>('/api/auth/session');

        if (!session.authenticated) {
          // Step 3: check if installation needs setup
          try {
            const status = await api<{ configured: boolean }>('/api/setup/status');
            if (!status.configured) {
              setPage('setup');
              return;
            }
          } catch {
            // If setup endpoint fails, just show the landing page
          }
          // S1 — a configured Installation greets visitors with the support
          // landing page, not the raw login form.
          setPage('landing');
          return;
        }

        // Session exists — restore state
        setUser({ id: session.userId!, email: '' });
        const workspaces = session.workspaces ?? [];
        setAvailableWorkspaces(workspaces);

        if (workspaces.length === 0) {
          setPage('workspace-select');
          return;
        }

        // Try to restore last-used workspace or use first
        const lastWsId = session.workspaceId;
        const targetWs = lastWsId
          ? workspaces.find((w) => w.id === lastWsId)
          : workspaces[0];

        if (targetWs) {
          setWorkspace(targetWs);
          // S5 slice 19 — an authenticated User whose pre-login intent was to
          // create a Ticket lands on the creation form; every other visit keeps
          // the normal Workspace page.
          setPage(consumePostLoginDestination() ?? workspaceHomePage(targetWs.role));
        } else {
          setPage('workspace-select');
        }
      } catch {
        // Network error — show login
        setPage('login');
      }
    })();
  }, []);

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
    setPage(consumePostLoginDestination() ?? workspaceHomePage(ws.role));
  }, []);

  const handleWorkspaceSelect = useCallback((ws: Workspace) => {
    setWorkspace(ws);
    setPage(consumePostLoginDestination() ?? workspaceHomePage(ws.role));
  }, []);

  // S1 — the landing CTA is the only way into authentication for a visitor who
  // asked for a Ticket, so it records that intent before showing the login card.
  const handleStartTicketIntake = useCallback(() => {
    rememberPostLoginDestination('create-ticket');
    setPage('login');
  }, []);

  const handleOpenTicket = useCallback(async (id: string) => {
    try {
      const ticket = await api<Ticket>(`/api/tickets/${id}`);
      setSelectedTicket(ticket);
      const tl = await api<TimelineEntry[]>(`/api/tickets/${id}/timeline`);
      setTimeline(tl);
      const files = await api<AttachmentItem[]>(`/api/tickets/${id}/attachments`);
      setAttachments(files);
      setPage('ticket-detail');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load ticket');
    }
  }, []);

  // S1: upload through the authorized endpoint, then re-read the list the
  // server reports so the sidebar never shows an Attachment it did not accept.
  const handleUploadAttachment = useCallback(
    async (file: File, visibility: 'public' | 'internal') => {
      if (!selectedTicket) return;
      await uploadAttachment(selectedTicket.id, file, visibility);
      const files = await api<AttachmentItem[]>(
        `/api/tickets/${selectedTicket.id}/attachments`,
      );
      setAttachments(files);
    },
    [selectedTicket],
  );

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

  const handleLogout = useCallback(async () => {
    try {
      await api('/api/auth/logout', { method: 'POST' });
    } catch { /* ignore */ }
    forgetPostLoginDestination();
    setUser(null);
    setWorkspace(null);
    setAvailableWorkspaces([]);
    setPage('login');
  }, []);

  const isAgent = workspace?.role === 'agent' || workspace?.role === 'workspace-admin';
  // Pre-auth states render without the authenticated shell: setup is a
  // dedicated full-page experience with no Workspace/session context, and the
  // landing page belongs to visitors who have no session yet.
  const showShell =
    page !== 'loading' && page !== 'setup' && page !== 'landing' &&
    page !== 'login' && page !== 'workspace-select';

  return (
    <div className="app" data-testid="app-root">
      {/* Sidebar (desktop) */}
      {showShell && (
        <Sidebar
          currentPage={page}
          onNavigate={(p) => setPage(p as Page)}
          workspace={workspace}
          ticketCount={tickets.length}
          onLogout={handleLogout}
        />
      )}

      <div className="main">
        {/* Topbar */}
        {showShell && page !== 'ticket-detail' && (
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
        {page === 'loading' && (
          <main className="auth-page">
            <div className="auth-card">
              <div className="auth-brand">
                <div className="logo">T</div>
                <div className="brand-name">ticket<span className="os">OS</span></div>
              </div>
              <LoadingSkeleton rows={2} />
            </div>
          </main>
        )}
        {page === 'setup' && <SetupWizard />}
        {page === 'landing' && <Landing onOpenTicket={handleStartTicketIntake} />}
        {page === 'login' && <Login onLogin={handleLogin} />}
        {page === 'workspace-select' && (
          <WorkspaceSelector
            workspaces={availableWorkspaces}
            onSelect={handleWorkspaceSelect}
          />
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
            tickets={page === 'my-tickets' ? tickets.filter((tk) => tk.assignedTo !== null && tk.assignedTo === user?.id) : tickets}
            currentUserId={user?.id ?? null}
            onOpen={handleOpenTicket}
            onClaim={handleClaim}
          />
        )}

        {page === 'ticket-detail' && selectedTicket && (
          <TicketDetail
            ticket={selectedTicket}
            timeline={timeline}
            attachments={attachments}
            currentUserId={user?.id ?? null}
            onBack={() => setPage(isAgent ? 'queue' : 'ticket-list')}
            onSendMessage={handleSendMessage}
            onAddNote={handleAddNote}
            onUploadAttachment={handleUploadAttachment}
            role={workspace?.role ?? 'requester'}
          />
        )}

        {page === 'create-ticket' && (
          <CreateTicket
            onSubmit={async (title, description, ticketTypeId, priorityId) => {
              await api('/api/tickets', {
                method: 'POST',
                body: JSON.stringify({ title, description, ticketTypeId, priorityId }),
              });
              setPage(workspaceHomePage(workspace?.role));
            }}
            onBack={() => setPage(isAgent ? 'queue' : 'ticket-list')}
          />
        )}

        {page === 'admin-organizations' && <OrganizationsPage locale={locale} />}
        {page === 'admin-queues' && <QueuesPage locale={locale} />}
        {page === 'admin-members' && <MembersPage locale={locale} />}
        {page === 'admin-statuses' && <StatusConfigurationPage locale={locale} />}
      </div>

      {/* Bottom nav (mobile) */}
      {showShell && (
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

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('ticketOS could not find the #root element');
}

createRoot(rootElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
