import React, { useState, useEffect, useCallback, createContext, useContext } from 'react';
import { localeLabels, t, type Locale } from './i18n';

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

export function useI18n() {
  return useContext(I18nContext);
}

function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocale] = useState<Locale>('en');
  return (
    <I18nContext.Provider value={{ locale, setLocale, t: (key, vars) => t(locale, key, vars) }}>
      {children}
    </I18nContext.Provider>
  );
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
// Error Boundary
// ---------------------------------------------------------------------------

class ErrorBoundary extends React.Component<
  { children: React.ReactNode; fallback?: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  state = { hasError: false, error: null as Error | null };

  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  override render() {
    if (this.state.hasError) {
      return (
        this.props.fallback ?? (
          <div data-testid="error-boundary" role="alert" style={{ padding: '1rem', color: 'red' }}>
            <h2>{this.props.children ? 'Error' : 'An error occurred'}</h2>
            <p>{this.state.error?.message}</p>
          </div>
        )
      );
    }
    return this.props.children;
  }
}

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------

function Loading({ message }: { message: string }) {
  return (
    <div data-testid="loading" role="status" aria-live="polite" style={{ padding: '1rem', textAlign: 'center' }}>
      {message}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Locale Switcher
// ---------------------------------------------------------------------------

function LocaleSwitcher() {
  const { locale, setLocale } = useI18n();
  return (
    <div data-testid="locale-switcher" style={{ position: 'absolute', top: '0.5rem', right: '0.5rem' }}>
      <button
        data-testid="locale-en"
        onClick={() => setLocale('en')}
        aria-pressed={locale === 'en'}
      >
        EN
      </button>
      <button
        data-testid="locale-es"
        onClick={() => setLocale('es')}
        aria-pressed={locale === 'es'}
      >
        ES
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Login
// ---------------------------------------------------------------------------

function Login({ onLogin }: { onLogin: (_user: User, workspace: Workspace) => void }) {
  const { t } = useI18n();
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');
    try {
      await api<{ token: string }>('/api/auth/magic-link', {
        method: 'POST',
        body: JSON.stringify({ email }),
      });
      setMessage(t('portal.magic_link_sent', { email }));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('portal.login_failed'));
    }
  };

  return (
    <div data-testid="login-page" style={{ maxWidth: 400, margin: '2rem auto', padding: '1rem' }}>
      <h1>{t('portal.login')}</h1>
      <form onSubmit={handleSubmit}>
        <label htmlFor="email">{t('portal.email_label')}</label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          aria-describedby="email-help"
          autoFocus
        />
        <span id="email-help" hidden>{t('portal.login_subtitle')}</span>
        <button type="submit">{t('portal.send_magic_link')}</button>
      </form>
      {message && <p data-testid="login-message" role="status">{message}</p>}
      {error && <p data-testid="login-error" role="alert" style={{ color: 'red' }}>{error}</p>}
    </div>
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
    <div data-testid="workspace-selector" style={{ maxWidth: 400, margin: '2rem auto', padding: '1rem' }}>
      <h1>{t('portal.select_workspace')}</h1>
      {workspaces.length === 0 ? (
        <p data-testid="empty-state">{t('portal.no_tickets')}</p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0 }}>
          {workspaces.map((ws) => (
            <li key={ws.id} style={{ marginBottom: '0.5rem' }}>
              <button
                data-testid={`workspace-${ws.id}`}
                onClick={() => onSelect(ws)}
                aria-label={ws.name}
              >
                {ws.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ticket List
// ---------------------------------------------------------------------------

function TicketList({
  tickets,
  onOpen,
  onCreate,
  role,
}: {
  tickets: Ticket[];
  onOpen: (id: string) => void;
  onCreate: () => void;
  role: string;
}) {
  const { t } = useI18n();

  return (
    <div data-testid="ticket-list" style={{ maxWidth: 800, margin: '2rem auto', padding: '1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1>{t('portal.tickets')}</h1>
        {role !== 'requester' && (
          <button data-testid="create-ticket-btn" onClick={onCreate}>
            {t('portal.new_ticket')}
          </button>
        )}
      </div>
      {tickets.length === 0 ? (
        <p data-testid="empty-state">{t('portal.no_tickets')}</p>
      ) : (
        <table data-testid="tickets-table" aria-label={t('portal.tickets')}>
          <thead>
            <tr>
              <th scope="col">{t('portal.title_col')}</th>
              <th scope="col">{t('portal.status_col')}</th>
              <th scope="col">{t('portal.priority_col')}</th>
              <th scope="col">{t('portal.created_col')}</th>
              <th scope="col">{t('portal.actions_col')}</th>
            </tr>
          </thead>
          <tbody>
            {tickets.map((tk) => (
              <tr key={tk.id}>
                <td>{tk.title}</td>
                <td>{tk.status}</td>
                <td>{tk.priority}</td>
                <td>{new Date(tk.createdAt).toLocaleDateString()}</td>
                <td>
                  <button
                    data-testid={`open-ticket-${tk.id}`}
                    onClick={() => onOpen(tk.id)}
                    aria-label={`Open ticket ${tk.title}`}
                  >
                    {t('portal.open')}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Agent Queue / Worklist
// ---------------------------------------------------------------------------

function AgentQueue({
  tickets,
  onOpen,
  onClaim,
  onUnassign,
}: {
  tickets: Ticket[];
  onOpen: (id: string) => void;
  onClaim: (id: string) => void;
  onUnassign: (id: string) => void;
}) {
  const { t } = useI18n();

  return (
    <div data-testid="agent-queue" style={{ maxWidth: 800, margin: '2rem auto', padding: '1rem' }}>
      <h1>{t('portal.agent_queue')}</h1>
      {tickets.length === 0 ? (
        <p data-testid="empty-state">{t('portal.no_tickets')}</p>
      ) : (
        <table data-testid="queue-table" aria-label={t('portal.agent_queue')}>
          <thead>
            <tr>
              <th scope="col">{t('portal.title_col')}</th>
              <th scope="col">{t('portal.status_col')}</th>
              <th scope="col">{t('portal.priority_col')}</th>
              <th scope="col">{t('portal.assigned')}</th>
              <th scope="col">{t('portal.actions_col')}</th>
            </tr>
          </thead>
          <tbody>
            {tickets.map((tk) => (
              <tr key={tk.id}>
                <td>{tk.title}</td>
                <td>{tk.status}</td>
                <td>{tk.priority}</td>
                <td>{tk.assignedTo ? tk.assignedTo : t('portal.unassigned')}</td>
                <td>
                  <button
                    data-testid={`open-ticket-${tk.id}`}
                    onClick={() => onOpen(tk.id)}
                    aria-label={`Open ticket ${tk.title}`}
                  >
                    {t('portal.open')}
                  </button>
                  {!tk.assignedTo && (
                    <button
                      data-testid={`claim-${tk.id}`}
                      onClick={() => onClaim(tk.id)}
                      aria-label={t('portal.claim')}
                    >
                      {t('portal.claim')}
                    </button>
                  )}
                  {tk.assignedTo && (
                    <button
                      data-testid={`unassign-${tk.id}`}
                      onClick={() => onUnassign(tk.id)}
                      aria-label={t('portal.unassign')}
                    >
                      {t('portal.unassign')}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ticket Detail
// ---------------------------------------------------------------------------

function TicketDetail({
  ticket,
  onBack,
  onAddMessage,
  onAddInternalNote,
  role,
}: {
  ticket: Ticket;
  onBack: () => void;
  onAddMessage: (content: string) => void;
  onAddInternalNote: (content: string) => void;
  role: string;
}) {
  const { t } = useI18n();
  const [message, setMessage] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');

  return (
    <div data-testid="ticket-detail" style={{ maxWidth: 800, margin: '2rem auto', padding: '1rem' }}>
      <button data-testid="back-btn" onClick={onBack} aria-label={t('portal.back')}>
        {t('portal.back')}
      </button>
      <h1>{ticket.title}</h1>
      <dl>
        <dt>{t('portal.status_col')}</dt><dd>{ticket.status}</dd>
        <dt>{t('portal.priority_col')}</dt><dd>{ticket.priority}</dd>
        <dt>{t('portal.created_col')}</dt><dd>{new Date(ticket.createdAt).toLocaleString()}</dd>
      </dl>

      <section aria-label={t('portal.timeline')}>
        <h2>{t('portal.timeline')}</h2>
        <div data-testid="timeline-entries">
          <article data-testid="timeline-entry">
            <p>{ticket.title} — initial entry</p>
          </article>
        </div>
      </section>

      {role === 'requester' && (
        <section aria-label={t('portal.reply')}>
          <h2>{t('portal.reply')}</h2>
          <textarea
            data-testid="message-input"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder={t('portal.message_placeholder')}
            aria-label={t('portal.message_placeholder')}
          />
          <button
            data-testid="send-message-btn"
            onClick={() => {
              if (!message.trim()) return;
              onAddMessage(message);
              setMessage('');
            }}
          >
            {t('portal.send')}
          </button>
        </section>
      )}

      {(role === 'agent' || role === 'workspace-admin') && (
        <section aria-label={t('portal.internal_note')}>
          <h2>{t('portal.add_internal_note')}</h2>
          <textarea
            data-testid="internal-note-input"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t('portal.note_placeholder')}
            aria-label={t('portal.note_placeholder')}
          />
          <button
            data-testid="send-note-btn"
            onClick={() => {
              if (!note.trim()) return;
              onAddInternalNote(note);
              setNote('');
            }}
          >
            {t('portal.send')}
          </button>
        </section>
      )}

      {error && <p data-testid="detail-error" role="alert" style={{ color: 'red' }}>{error}</p>}
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
    <div data-testid="create-ticket" style={{ maxWidth: 600, margin: '2rem auto', padding: '1rem' }}>
      <button data-testid="back-btn" onClick={onBack} aria-label={t('portal.back')}>
        {t('portal.back')}
      </button>
      <h1>{t('portal.new_ticket_title')}</h1>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit(title, description);
        }}
      >
        <label htmlFor="ticket-title">{t('portal.title_label')}</label>
        <input
          id="ticket-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          aria-required="true"
        />
        <label htmlFor="ticket-desc">{t('portal.description_label')}</label>
        <textarea
          id="ticket-desc"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          aria-label={t('portal.description_label')}
        />
        <button type="submit" data-testid="submit-ticket-btn">
          {t('portal.create')}
        </button>
      </form>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main App Router
// ---------------------------------------------------------------------------

type Page =
  | 'login'
  | 'workspace-select'
  | 'ticket-list'
  | 'ticket-detail'
  | 'create-ticket'
  | 'agent-queue';

export default function App() {
  const [page, setPage] = useState<Page>('login');
  const [user, setUser] = useState<User | null>(null);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [role, setRole] = useState<string>('requester');
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
    if (page === 'ticket-list' || page === 'agent-queue') loadTickets();
  }, [page, loadTickets]);

  const handleLogin = (_user: User, _workspace: Workspace) => {
    setUser(_user);
    setWorkspace(_workspace);
    setPage('ticket-list');
  };

  const handleWorkspaceSelect = (ws: Workspace) => {
    setWorkspace(ws);
    setPage('ticket-list');
  };

  // Simple mock data for demo
  useEffect(() => {
    setWorkspaces([{ id: 'ws-1', name: 'Demo Workspace' }]);
  }, []);

  return (
    <I18nProvider>
      <ErrorBoundary>
        <div data-testid="app-root" style={{ position: 'relative', minHeight: '100vh' }}>
          <LocaleSwitcher />

          {page === 'login' && <Login onLogin={handleLogin} />}
          {page === 'workspace-select' && (
            <WorkspaceSelector workspaces={workspaces} onSelect={handleWorkspaceSelect} />
          )}
          {page === 'ticket-list' && (
            <>
              {loading && <Loading message="Loading..." />}
              {error && <p data-testid="list-error" role="alert" style={{ color: 'red' }}>{error}</p>}
              {!loading && !error && (
                <TicketList
                  tickets={tickets}
                  onOpen={(id) => {
                    setSelectedTicket({
                      id,
                      title: 'Ticket',
                      status: 'backlog',
                      priority: 'normal',
                      createdAt: new Date().toISOString(),
                      updatedAt: new Date().toISOString(),
                      description: null,
                      ticketTypeId: null,
                      createdBy: 'user-1',
                      assignedTo: null,
                      visibility: 'public',
                    });
                    setPage('ticket-detail');
                  }}
                  onCreate={() => setPage('create-ticket')}
                  role={role}
                />
              )}
            </>
          )}
          {page === 'agent-queue' && (
            <>
              {loading && <Loading message="Loading..." />}
              {error && <p data-testid="queue-error" role="alert" style={{ color: 'red' }}>{error}</p>}
              {!loading && !error && (
                <AgentQueue
                  tickets={tickets}
                  onOpen={(id) => {
                    setSelectedTicket({
                      id,
                      title: 'Ticket',
                      status: 'backlog',
                      priority: 'normal',
                      createdAt: new Date().toISOString(),
                      updatedAt: new Date().toISOString(),
                      description: null,
                      ticketTypeId: null,
                      createdBy: 'user-1',
                      assignedTo: null,
                      visibility: 'public',
                    });
                    setPage('ticket-detail');
                  }}
                  onClaim={() => {}}
                  onUnassign={() => {}}
                />
              )}
            </>
          )}
          {page === 'ticket-detail' && selectedTicket && (
            <TicketDetail
              ticket={selectedTicket}
              onBack={() => setPage('ticket-list')}
              onAddMessage={() => {}}
              onAddInternalNote={() => {}}
              role={role}
            />
          )}
          {page === 'create-ticket' && (
            <CreateTicket
              onSubmit={async (title, description) => {
                try {
                  await api<Ticket>('/api/tickets', {
                    method: 'POST',
                    body: JSON.stringify({ title, description }),
                  });
                  setPage('ticket-list');
                } catch {
                  setError('Failed to create ticket');
                }
              }}
              onBack={() => setPage('ticket-list')}
            />
          )}
        </div>
      </ErrorBoundary>
    </I18nProvider>
  );
}
