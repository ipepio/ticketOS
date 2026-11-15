import React, { useEffect, useMemo, useState } from 'react';
import type { Locale } from './i18n';

const API_BASE = import.meta.env.VITE_API_URL ?? '';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    credentials: 'include',
    ...options,
    headers: {
      ...(options?.body ? { 'Content-Type': 'application/json' } : {}),
      ...options?.headers,
    },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: response.statusText })) as { error?: string };
    throw new Error(body.error ?? response.statusText);
  }
  return response.json() as Promise<T>;
}

interface Organization {
  id: string;
  name: string;
  memberCount: number;
  createdAt: string;
}

interface Member {
  id: string;
  email: string;
  name: string | null;
  role: 'installation-admin' | 'workspace-admin' | 'agent' | 'requester';
  status: 'active' | 'inactive';
  organizationId: string | null;
  organizationName: string | null;
  lastSeenAt: string | null;
}

interface WorkspaceStatus {
  id: string;
  name: string;
  category: string;
  color: string;
  description: string | null;
  isActive: boolean;
  isDefault: boolean;
}

interface WorkspacePriority {
  id: string;
  name: string;
  color: string;
  description: string | null;
  isActive: boolean;
  isDefault: boolean;
  sortOrder: number;
}

interface WorkspaceTicketType {
  id: string;
  name: string;
  category: 'incident' | 'service-request';
  color: string;
  description: string | null;
  isActive: boolean;
  isDefault: boolean;
}

interface TransitionsRow {
  id: string;
  fromStatusId: string;
  toStatusId: string;
  fromName: string;
  toName: string;
}

interface Queue {
  id: string;
  name: string;
  accessMode: 'workspace-agents' | 'restricted';
  memberCount: number;
  activeTicketCount: number;
  createdAt: string;
}

interface QueueMember {
  userId: string;
  email: string;
  name: string | null;
}

interface StatusForm {
  id?: string;
  name: string;
  category: string;
  color: string;
  description: string;
}

interface PriorityForm {
  id?: string;
  name: string;
  color: string;
  description: string;
}

interface TicketTypeForm {
  id?: string;
  name: string;
  category: 'incident' | 'service-request';
  color: string;
  description: string;
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  useEffect(() => {
    const close = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    document.addEventListener('keydown', close);
    return () => document.removeEventListener('keydown', close);
  }, [onClose]);

  return (
    <div className="modal-overlay open" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="admin-modal-title">
        <div className="modal-header">
          <h2 className="card-title" id="admin-modal-title">{title}</h2>
          <button className="btn btn-icon btn-ghost" onClick={onClose} aria-label="Cerrar">×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function PageError({ message }: { message: string }) {
  return <div className="admin-alert" role="alert">{message}</div>;
}

export function OrganizationsPage({ locale }: { locale: Locale }) {
  const es = locale === 'es';
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [name, setName] = useState('');
  const [modal, setModal] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try { setOrganizations(await request('/api/admin/organizations')); setError(''); }
    catch (err) { setError(err instanceof Error ? err.message : String(err)); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);

  const create = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      await request('/api/admin/organizations', { method: 'POST', body: JSON.stringify({ name }) });
      setName(''); setModal(false); await load();
    } catch (err) { setError(err instanceof Error ? err.message : String(err)); }
  };

  return (
    <main className="content" data-testid="organizations-page">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div><h1 className="h2">{es ? 'Organizaciones' : 'Organizations'}</h1><p className="text-muted text-small mt-2">{es ? 'Agrupa Requesters y controla quién comparte contexto de soporte.' : 'Group Requesters and control who shares support context.'}</p></div>
        <button className="btn btn-primary" onClick={() => setModal(true)}>+ {es ? 'Nueva organización' : 'New organization'}</button>
      </div>
      {error && <PageError message={error} />}
      {loading ? <div className="skeleton admin-skeleton" /> : (
        <div className="table-wrap"><table className="table"><thead><tr><th>{es ? 'Nombre' : 'Name'}</th><th>{es ? 'Miembros externos' : 'External members'}</th><th className="hide-mobile">{es ? 'Creada' : 'Created'}</th></tr></thead>
          <tbody>{organizations.map((organization) => <tr key={organization.id}><td><div className="flex items-center gap-3"><div className="org-icon">{organization.name[0]?.toUpperCase()}</div><strong>{organization.name}</strong></div></td><td className="text-mono">{organization.memberCount}</td><td className="text-muted text-small hide-mobile">{new Date(organization.createdAt).toLocaleDateString(locale)}</td></tr>)}</tbody>
        </table></div>
      )}
      {!loading && organizations.length === 0 && <div className="empty-state"><h2 className="empty-state-title">{es ? 'Todavía no hay organizaciones' : 'No organizations yet'}</h2></div>}
      {modal && <Modal title={es ? 'Nueva organización' : 'New organization'} onClose={() => setModal(false)}><form onSubmit={create}><div className="modal-body"><label className="label" htmlFor="organization-name">{es ? 'Nombre' : 'Name'} <span className="required">*</span></label><input id="organization-name" className="input" value={name} onChange={(e) => setName(e.target.value)} required autoFocus /></div><div className="modal-footer"><button type="button" className="btn btn-ghost" onClick={() => setModal(false)}>{es ? 'Cancelar' : 'Cancel'}</button><button className="btn btn-primary">{es ? 'Crear organización' : 'Create organization'}</button></div></form></Modal>}
    </main>
  );
}

export function MembersPage({ locale }: { locale: Locale }) {
  const es = locale === 'es';
  const [members, setMembers] = useState<Member[]>([]);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [filter, setFilter] = useState<'all' | 'internal' | 'external'>('all');
  const [modal, setModal] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ name: '', email: '', role: 'requester', organizationId: '' });

  const load = async () => {
    try {
      const [nextMembers, nextOrganizations] = await Promise.all([
        request<Member[]>('/api/admin/members'), request<Organization[]>('/api/admin/organizations'),
      ]);
      setMembers(nextMembers); setOrganizations(nextOrganizations); setError('');
    } catch (err) { setError(err instanceof Error ? err.message : String(err)); }
  };
  useEffect(() => { void load(); }, []);

  const visible = useMemo(() => members.filter((member) => filter === 'all' || (filter === 'external' ? member.role === 'requester' : member.role !== 'requester')), [members, filter]);
  const add = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      await request('/api/admin/members', { method: 'POST', body: JSON.stringify({ ...form, organizationId: form.organizationId || null }) });
      setModal(false); setForm({ name: '', email: '', role: 'requester', organizationId: '' }); await load();
    } catch (err) { setError(err instanceof Error ? err.message : String(err)); }
  };
  const update = async (member: Member, patch: Partial<Member>) => {
    try { await request(`/api/admin/members/${member.id}`, { method: 'PATCH', body: JSON.stringify(patch) }); await load(); }
    catch (err) { setError(err instanceof Error ? err.message : String(err)); }
  };

  return (
    <main className="content" data-testid="members-page">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3"><div><h1 className="h2">{es ? 'Miembros del Workspace' : 'Workspace Members'}</h1><p className="text-muted text-small mt-2">{es ? 'Gestiona el equipo interno y los Requesters externos.' : 'Manage your internal team and external Requesters.'}</p></div><button className="btn btn-primary" onClick={() => setModal(true)}>+ {es ? 'Añadir miembro' : 'Add member'}</button></div>
      <div className="filter-bar mb-4">{(['all', 'internal', 'external'] as const).map((value) => <button key={value} className={`chip${filter === value ? ' active' : ''}`} onClick={() => setFilter(value)}>{value === 'all' ? (es ? 'Todos' : 'All') : value === 'internal' ? (es ? 'Equipo interno' : 'Internal team') : (es ? 'Miembros externos' : 'External members')}</button>)}</div>
      {error && <PageError message={error} />}
      <div className="table-wrap"><table className="table"><thead><tr><th>{es ? 'Miembro' : 'Member'}</th><th>{es ? 'Rol' : 'Role'}</th><th className="hide-mobile">{es ? 'Organización' : 'Organization'}</th><th>{es ? 'Estado' : 'Status'}</th><th className="hide-mobile">{es ? 'Último acceso' : 'Last seen'}</th></tr></thead><tbody>
        {visible.map((member) => <tr key={member.id}><td><div className="flex items-center gap-3"><div className="avatar">{(member.name || member.email).slice(0, 2).toUpperCase()}</div><div><strong>{member.name || member.email.split('@')[0]}</strong><div className="text-small text-muted">{member.email}</div></div></div></td><td><select className="select table-select" value={member.role} onChange={(e) => void update(member, { role: e.target.value as Member['role'] })}><option value="requester">Requester</option><option value="agent">Agent</option><option value="workspace-admin">Admin</option></select></td><td className="hide-mobile"><select className="select table-select" value={member.organizationId ?? ''} onChange={(e) => void update(member, { organizationId: e.target.value || null })}><option value="">—</option>{organizations.map((organization) => <option key={organization.id} value={organization.id}>{organization.name}</option>)}</select></td><td><button className={`badge ${member.status === 'active' ? 'badge-success' : 'badge-neutral'} badge-button`} onClick={() => void update(member, { status: member.status === 'active' ? 'inactive' : 'active' })}>{member.status === 'active' ? (es ? 'Activo' : 'Active') : (es ? 'Inactivo' : 'Inactive')}</button></td><td className="text-small text-muted hide-mobile">{member.lastSeenAt ? new Date(member.lastSeenAt).toLocaleDateString(locale) : '—'}</td></tr>)}
      </tbody></table></div>
      {modal && <Modal title={es ? 'Añadir miembro' : 'Add member'} onClose={() => setModal(false)}><form onSubmit={add}><div className="modal-body"><div className="field"><label className="label" htmlFor="member-email">{es ? 'Correo electrónico' : 'Email'} *</label><input id="member-email" type="email" className="input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required autoFocus /></div><div className="field"><label className="label" htmlFor="member-name">{es ? 'Nombre' : 'Name'}</label><input id="member-name" className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div><div className="admin-form-grid"><div className="field"><label className="label" htmlFor="member-role">{es ? 'Rol' : 'Role'}</label><select id="member-role" className="select" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}><option value="requester">Requester ({es ? 'externo' : 'external'})</option><option value="agent">Agent</option><option value="workspace-admin">Admin</option></select></div><div className="field"><label className="label" htmlFor="member-org">{es ? 'Organización' : 'Organization'}</label><select id="member-org" className="select" value={form.organizationId} onChange={(e) => setForm({ ...form, organizationId: e.target.value })}><option value="">—</option>{organizations.map((organization) => <option key={organization.id} value={organization.id}>{organization.name}</option>)}</select></div></div></div><div className="modal-footer"><button type="button" className="btn btn-ghost" onClick={() => setModal(false)}>{es ? 'Cancelar' : 'Cancel'}</button><button className="btn btn-primary">{es ? 'Añadir y permitir acceso' : 'Add and grant access'}</button></div></form></Modal>}
    </main>
  );
}

export function StatusConfigurationPage({ locale }: { locale: Locale }) {
  return <TicketConfigPage locale={locale} />;
}

export function TicketConfigPage({ locale }: { locale: Locale }) {
  const es = locale === 'es';
  const [tab, setTab] = useState<'statuses' | 'priorities' | 'types' | 'transitions'>('statuses');
  const [transitions, setTransitions] = useState<TransitionsRow[]>([]);
  const [fromId, setFromId] = useState('');
  const [toId, setToId] = useState('');
  const [statuses, setStatuses] = useState<WorkspaceStatus[]>([]);
  const [priorities, setPriorities] = useState<WorkspacePriority[]>([]);
  const [ticketTypes, setTicketTypes] = useState<WorkspaceTicketType[]>([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [createRes, setCreateRes] = useState<'statuses' | 'priorities' | 'types' | null>(null);
  const [editRes, setEditRes] = useState<string | null>(null);
  const [statusForm, setStatusForm] = useState<StatusForm>({ name: '', category: 'new', color: '#6366f1', description: '' });
  const [priorityForm, setPriorityForm] = useState<PriorityForm>({ name: '', color: '#6366f1', description: '' });
  const [ticketTypeForm, setTicketTypeForm] = useState<TicketTypeForm>({ name: '', category: 'incident', color: '#6366f1', description: '' });
  const [busy, setBusy] = useState(false);

  const loadAll = async () => {
    try {
      const [s, p, t] = await Promise.all([
        request<WorkspaceStatus[]>('/api/admin/statuses'),
        request<WorkspacePriority[]>('/api/admin/priorities'),
        request<WorkspaceTicketType[]>('/api/admin/ticket-types'),
      ]);
      setStatuses(s); setPriorities(p); setTicketTypes(t); setError('');
      try { const tr = await request<TransitionsRow[]>('/api/admin/transitions'); setTransitions(tr); } catch { /* transitions not yet available */ }
    } catch (err) { setError(err instanceof Error ? err.message : String(err)); }
  };
  useEffect(() => { void loadAll(); }, []);

  const codeToMessage = (code: string): string => {
    const msgs: Record<string, string> = es ? {
      'no-name': 'El nombre no puede estar vacío',
      'conflict': 'Ya existe otro registro con ese nombre',
      'not-found': 'Recurso no encontrado',
      'invalid': 'Entrada no válida',
      'forbidden': 'Sin permiso para realizar este cambio',
      'error': 'Ocurrió un error',
      'server-error': 'Error del servidor',
      'transition-invalid': 'Una transición no puede ir de un estado a sí mismo',
      'transition-duplicate': 'Esta transición ya existe',
    } : {
      'no-name': 'Name cannot be empty',
      'conflict': 'Another record already uses that name',
      'not-found': 'Resource not found',
      'invalid': 'Invalid input',
      'forbidden': 'Permission denied',
      'error': 'An error occurred',
      'server-error': 'Server error',
      'transition-invalid': 'A transition cannot go from a status to itself',
      'transition-duplicate': 'This transition already exists',
    };
    return msgs[code] ?? (es ? 'Ocurrió un error' : 'An error occurred');
  };

  const handleServerErr = (err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err);
    try {
      const parsed = JSON.parse(msg);
      if (parsed?.code) { setError(codeToMessage(parsed.code)); return; }
    } catch { /* plain text */ }
    if (msg.includes('403')) setError(codeToMessage('forbidden'));
    else if (msg.includes('404')) setError(codeToMessage('not-found'));
    else setError(codeToMessage('error'));
  };

  const onKeyDownTab = (e: React.KeyboardEvent) => {
    const tabs: ('statuses' | 'priorities' | 'types' | 'transitions')[] = ['statuses', 'priorities', 'types', 'transitions'];
    const idx = tabs.indexOf(tab);
    // ARIA authoring practice: arrow keys wrap around the tab ring.
    if (e.key === 'ArrowRight') {
      e.preventDefault(); setTab(tabs[(idx + 1) % tabs.length]!);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault(); setTab(tabs[(idx - 1 + tabs.length) % tabs.length]!);
    }
  };

  const reorder = async (resource: 'statuses' | 'priorities' | 'ticket-types', ids: string[]) => {
    setBusy(true);
    try {
      await request(`/api/admin/${resource}/order`, { method: 'PUT', body: JSON.stringify({ ids }) });
      await loadAll();
      setSuccess(es ? 'Orden actualizado' : 'Order updated');
    } catch (err) { handleServerErr(err); }
    finally { setBusy(false); }
  };

  const toggleActive = async (resource: 'statuses' | 'priorities' | 'ticket-types', id: string, cur: boolean) => {
    try {
      await request(`/api/admin/${resource}/${id}`, { method: 'PATCH', body: JSON.stringify({ isActive: !cur }) });
      await loadAll();
    } catch (err) { handleServerErr(err); }
  };

  const setDefaultAction = async (resource: 'priorities' | 'ticket-types', id: string) => {
    setBusy(true);
    try {
      await request(`/api/admin/${resource}/${id}/default`, { method: 'POST', body: JSON.stringify({}) });
      await loadAll();
      setSuccess(es ? 'Predeterminado actualizado' : 'Default updated');
    } catch (err) { handleServerErr(err); }
    finally { setBusy(false); }
  };

  const renderCellActions = (id: string, resource: 'statuses' | 'priorities' | 'ticket-types', index: number, total: number, row: WorkspaceStatus | WorkspacePriority | WorkspaceTicketType) => {
    return (
      <div className="flex items-center gap-1 flex-wrap">
        <button className="btn btn-ghost btn-sm" onClick={() => {
          if (resource === 'statuses') { const s = row as WorkspaceStatus; setStatusForm({ id: s.id, name: s.name, category: s.category, color: s.color, description: s.description ?? '' }); setEditRes('statuses'); }
          else if (resource === 'priorities') { const p = row as WorkspacePriority; setPriorityForm({ id: p.id, name: p.name, color: p.color, description: p.description ?? '' }); setEditRes('priorities'); }
          else { const t = row as WorkspaceTicketType; setTicketTypeForm({ id: t.id, name: t.name, category: t.category, color: t.color, description: t.description ?? '' }); setEditRes('types'); }
        }}>{es ? 'Editar' : 'Edit'}</button>
        <button className="btn btn-ghost btn-sm" disabled={busy || index === 0} onClick={() => {
          const list = resource === 'statuses' ? statuses : resource === 'priorities' ? priorities : ticketTypes;
          const copy = [...list.map((x) => x.id)];
          [copy[index - 1]!, copy[index]!] = [copy[index]!, copy[index - 1]!];
          reorder(resource as 'statuses' | 'priorities' | 'ticket-types', copy);
        }} aria-label={es ? 'Subir' : 'Move up'}>↑</button>
        <button className="btn btn-ghost btn-sm" disabled={busy || index === total - 1} onClick={() => {
          const list = resource === 'statuses' ? statuses : resource === 'priorities' ? priorities : ticketTypes;
          const copy = [...list.map((x) => x.id)];
          [copy[index]!, copy[index + 1]!] = [copy[index + 1]!, copy[index]!];
          reorder(resource as 'statuses' | 'priorities' | 'ticket-types', copy);
        }} aria-label={es ? 'Bajar' : 'Move down'}>↓</button>
        {resource === 'statuses' && <button role="switch" aria-checked={(row as WorkspaceStatus).isActive} className={`toggle${(row as WorkspaceStatus).isActive ? ' active' : ''}`} onClick={() => toggleActive('statuses', id, (row as WorkspaceStatus).isActive)} aria-label={es ? 'Cambiar estado activo' : 'Toggle active status'} />
        }
        {(resource === 'priorities' || resource === 'ticket-types') && <button role="radio" aria-checked={(row as WorkspacePriority | WorkspaceTicketType).isDefault} className={`btn btn-sm ${(row as WorkspacePriority | WorkspaceTicketType).isDefault ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setDefaultAction(resource as 'priorities' | 'ticket-types', id)}>{es ? 'Predet.' : 'Default'}</button>}
      </div>
    );
  };

  const renderStatusRow = (s: WorkspaceStatus, i: number) => (
    <tr key={s.id}>
      <td><div className="flex items-center gap-2"><span className="status-dot status-dot-lg" style={{ background: s.color }} /><strong>{s.name}</strong>{s.isDefault && <span className="badge badge-neutral">{es ? 'Predet.' : 'Default'}</span>}</div></td>
      <td><span className="badge badge-info">{s.category}</span></td>
      <td className="text-muted text-small hide-mobile">{s.description || '—'}</td>
      <td className="action-row">{renderCellActions(s.id, 'statuses', i, statuses.length, s)}</td>
    </tr>
  );

  const renderPriorityRow = (p: WorkspacePriority, i: number) => (
    <tr key={p.id}>
      <td><div className="flex items-center gap-2"><span className="status-dot status-dot-lg" style={{ background: p.color }} /><strong>{p.name}</strong>{p.isDefault && <span className="badge badge-accent">{es ? 'Predet.' : 'Default'}</span>}</div></td>
      <td className="text-muted text-small">#{p.sortOrder}</td>
      <td className="text-muted text-small hide-mobile">{p.description || '—'}</td>
      <td className="action-row">{renderCellActions(p.id, 'priorities', i, priorities.length, p)}</td>
    </tr>
  );

  const renderTypeRow = (tt: WorkspaceTicketType, i: number) => (
    <tr key={tt.id}>
      <td><div className="flex items-center gap-2"><span className="status-dot status-dot-lg" style={{ background: tt.color }} /><strong>{tt.name}</strong>{tt.isDefault && <span className="badge badge-accent">{es ? 'Predet.' : 'Default'}</span>}</div></td>
      <td><span className="badge badge-neutral">{tt.category === 'incident' ? (es ? 'Incidente' : 'Incident') : (es ? 'Petición de servicio' : 'Service Request')}</span></td>
      <td className="text-muted text-small hide-mobile">{tt.description || '—'}</td>
      <td className="action-row">{renderCellActions(tt.id, 'ticket-types', i, ticketTypes.length, tt)}</td>
    </tr>
  );

  const sortedTransitions = useMemo(() =>
    [...transitions].sort((a, b) => a.fromName.localeCompare(b.fromName) || a.toName.localeCompare(b.toName)),
    [transitions]);

  const addTransition = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      await request('/api/admin/transitions', { method: 'POST', body: JSON.stringify({ fromStatusId: fromId, toStatusId: toId }) });
      setFromId(''); setToId(''); await loadAll(); setSuccess(es ? 'Transición creada' : 'Transition created');
    } catch (err) { handleServerErr(err); }
  };

  const deleteTransition = async (f: string, t: string) => {
    try {
      await request('/api/admin/transitions', { method: 'DELETE', body: JSON.stringify({ fromStatusId: f, toStatusId: t }) });
      await loadAll();
    } catch (err) { handleServerErr(err); }
  };

  const renderFormFields = (form: 'status' | 'priority' | 'type') => {
    const fields: React.ReactElement[] = [];
    if (form === 'status') {
      fields.push(
        <div className="field" key="n"><label className="label" htmlFor="cfg-status-name">{es ? 'Nombre' : 'Name'} <span className="required">*</span></label>
          <input id="cfg-status-name" className="input" value={statusForm.name} onChange={(e) => setStatusForm({ ...statusForm, name: e.target.value })} required autoFocus />
        </div>,
        <div className="field" key="c"><label className="label" htmlFor="cfg-status-category">{es ? 'Categoría' : 'Category'}</label>
          <select id="cfg-status-category" className="select" value={statusForm.category} onChange={(e) => setStatusForm({ ...statusForm, category: e.target.value })}>
            {['new','open','pending','resolved','closed'].map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>,
      );
    } else if (form === 'priority') {
      fields.push(
        <div className="field" key="n"><label className="label" htmlFor="cfg-priority-name">{es ? 'Nombre' : 'Name'} <span className="required">*</span></label>
          <input id="cfg-priority-name" className="input" value={priorityForm.name} onChange={(e) => setPriorityForm({ ...priorityForm, name: e.target.value })} required autoFocus />
        </div>,
      );
    } else {
      fields.push(
        <div className="field" key="n"><label className="label" htmlFor="cfg-type-name">{es ? 'Nombre' : 'Name'} <span className="required">*</span></label>
          <input id="cfg-type-name" className="input" value={ticketTypeForm.name} onChange={(e) => setTicketTypeForm({ ...ticketTypeForm, name: e.target.value })} required autoFocus />
        </div>,
        <div className="field" key="tc"><label className="label" htmlFor="cfg-type-category">{es ? 'Categoría' : 'Category'}</label>
          <select id="cfg-type-category" className="select" value={ticketTypeForm.category} onChange={(e) => setTicketTypeForm({ ...ticketTypeForm, category: e.target.value as 'incident' | 'service-request' })}>
            <option value="incident">{es ? 'Incidente' : 'Incident'}</option>
            <option value="service-request">{es ? 'Petición de servicio' : 'Service Request'}</option>
          </select>
        </div>,
      );
    }
    fields.push(
      <div className="field" key="col"><label className="label" htmlFor={`cfg-${form}-color`}>{es ? 'Color' : 'Colour'}</label>
        <input id={`cfg-${form}-color`} className="input color-input" type="color" value={form === 'status' ? statusForm.color : form === 'priority' ? priorityForm.color : ticketTypeForm.color}
          onChange={(e) => { if (form === 'status') setStatusForm({ ...statusForm, color: e.target.value }); else if (form === 'priority') setPriorityForm({ ...priorityForm, color: e.target.value }); else setTicketTypeForm({ ...ticketTypeForm, color: e.target.value }); }} />
      </div>,
    );
    fields.push(
      <div className="field" key="d"><label className="label" htmlFor={`cfg-${form}-desc`}>{es ? 'Descripción' : 'Description'}</label>
        <textarea id={`cfg-${form}-desc`} className="textarea" value={form === 'status' ? statusForm.description : form === 'priority' ? priorityForm.description : ticketTypeForm.description}
          onChange={(e) => { if (form === 'status') setStatusForm({ ...statusForm, description: e.target.value }); else if (form === 'priority') setPriorityForm({ ...priorityForm, description: e.target.value }); else setTicketTypeForm({ ...ticketTypeForm, description: e.target.value }); }} rows={3} />
      </div>,
    );
    return fields;
  };

  const createDialog = createRes ? (
    <Modal title={`${es ? 'Añadir ' : 'Add '}${createRes === 'statuses' ? (es ? 'estado' : 'status') : createRes === 'priorities' ? (es ? 'prioridad' : 'priority') : (es ? 'tipo de ticket' : 'ticket type')}`}
      onClose={() => { setCreateRes(null); setStatusForm({ name: '', category: 'new', color: '#6366f1', description: '' }); setPriorityForm({ name: '', color: '#6366f1', description: '' }); setTicketTypeForm({ name: '', category: 'incident', color: '#6366f1', description: '' }); setError(''); }}>
      {createRes === 'statuses' && <form onSubmit={async (e) => { e.preventDefault(); if (!statusForm.name.trim()) { setError(codeToMessage('no-name')); return; } setBusy(true); try { await request('/api/admin/statuses', { method: 'POST', body: JSON.stringify(statusForm) }); setCreateRes(null); setStatusForm({ name: '', category: 'new', color: '#6366f1', description: '' }); await loadAll(); setSuccess(es ? 'Estado creado' : 'Status created'); } catch (err) { handleServerErr(err); } finally { setBusy(false); } }}>
        <div className="modal-body">{renderFormFields('status')}</div>
        <div className="modal-footer"><button type="button" className="btn btn-ghost" onClick={() => { setCreateRes(null); setError(''); }}>{es ? 'Cancelar' : 'Cancel'}</button><button className="btn btn-primary" type="submit" disabled={busy}>{es ? 'Crear' : 'Create'}</button></div>
      </form>}
      {createRes === 'priorities' && <form onSubmit={async (e) => { e.preventDefault(); if (!priorityForm.name.trim()) { setError(codeToMessage('no-name')); return; } setBusy(true); try { await request('/api/admin/priorities', { method: 'POST', body: JSON.stringify(priorityForm) }); setCreateRes(null); setPriorityForm({ name: '', color: '#6366f1', description: '' }); await loadAll(); setSuccess(es ? 'Prioridad creada' : 'Priority created'); } catch (err) { handleServerErr(err); } finally { setBusy(false); } }}>
        <div className="modal-body">{renderFormFields('priority')}</div>
        <div className="modal-footer"><button type="button" className="btn btn-ghost" onClick={() => { setCreateRes(null); setError(''); }}>{es ? 'Cancelar' : 'Cancel'}</button><button className="btn btn-primary" type="submit" disabled={busy}>{es ? 'Crear' : 'Create'}</button></div>
      </form>}
      {createRes === 'types' && <form onSubmit={async (e) => { e.preventDefault(); if (!ticketTypeForm.name.trim()) { setError(codeToMessage('no-name')); return; } setBusy(true); try { await request('/api/admin/ticket-types', { method: 'POST', body: JSON.stringify(ticketTypeForm) }); setCreateRes(null); setTicketTypeForm({ name: '', category: 'incident', color: '#6366f1', description: '' }); await loadAll(); setSuccess(es ? 'Tipo creado' : 'Type created'); } catch (err) { handleServerErr(err); } finally { setBusy(false); } }}>
        <div className="modal-body">{renderFormFields('type')}</div>
        <div className="modal-footer"><button type="button" className="btn btn-ghost" onClick={() => { setCreateRes(null); setError(''); }}>{es ? 'Cancelar' : 'Cancel'}</button><button className="btn btn-primary" type="submit" disabled={busy}>{es ? 'Crear' : 'Create'}</button></div>
      </form>}
    </Modal>
  ) : null;

  const editDialog = editRes ? (
    <Modal title={`${es ? 'Editar ' : 'Edit '}${editRes === 'statuses' ? (es ? 'estado' : 'status') : editRes === 'priorities' ? (es ? 'prioridad' : 'priority') : (es ? 'tipo de ticket' : 'ticket type')}`}
      onClose={() => { setEditRes(null); setError(''); }}>
      {editRes === 'statuses' && <form onSubmit={async (e) => { e.preventDefault(); if (!statusForm.name.trim()) { setError(codeToMessage('no-name')); return; } setBusy(true); try { await request(`/api/admin/statuses/${statusForm.id}`, { method: 'PATCH', body: JSON.stringify({ name: statusForm.name, category: statusForm.category, color: statusForm.color, description: statusForm.description }) }); setEditRes(null); setStatusForm({ name: '', category: 'new', color: '#6366f1', description: '' }); await loadAll(); setSuccess(es ? 'Estado actualizado' : 'Status updated'); } catch (err) { handleServerErr(err); } finally { setBusy(false); } }}>
        <div className="modal-body">{renderFormFields('status')}</div>
        <div className="modal-footer"><button type="button" className="btn btn-ghost" onClick={() => { setEditRes(null); setError(''); }}>{es ? 'Cancelar' : 'Cancel'}</button><button className="btn btn-primary" type="submit" disabled={busy}>{es ? 'Guardar' : 'Save'}</button></div>
      </form>}
      {editRes === 'priorities' && <form onSubmit={async (e) => { e.preventDefault(); if (!priorityForm.name.trim()) { setError(codeToMessage('no-name')); return; } setBusy(true); try { await request(`/api/admin/priorities/${priorityForm.id}`, { method: 'PATCH', body: JSON.stringify({ name: priorityForm.name, color: priorityForm.color, description: priorityForm.description }) }); setEditRes(null); setPriorityForm({ name: '', color: '#6366f1', description: '' }); await loadAll(); setSuccess(es ? 'Prioridad actualizada' : 'Priority updated'); } catch (err) { handleServerErr(err); } finally { setBusy(false); } }}>
        <div className="modal-body">{renderFormFields('priority')}</div>
        <div className="modal-footer"><button type="button" className="btn btn-ghost" onClick={() => { setEditRes(null); setError(''); }}>{es ? 'Cancelar' : 'Cancel'}</button><button className="btn btn-primary" type="submit" disabled={busy}>{es ? 'Guardar' : 'Save'}</button></div>
      </form>}
      {editRes === 'types' && <form onSubmit={async (e) => { e.preventDefault(); if (!ticketTypeForm.name.trim()) { setError(codeToMessage('no-name')); return; } setBusy(true); try { await request(`/api/admin/ticket-types/${ticketTypeForm.id}`, { method: 'PATCH', body: JSON.stringify({ name: ticketTypeForm.name, category: ticketTypeForm.category, color: ticketTypeForm.color, description: ticketTypeForm.description }) }); setEditRes(null); setTicketTypeForm({ name: '', category: 'incident', color: '#6366f1', description: '' }); await loadAll(); setSuccess(es ? 'Tipo actualizado' : 'Type updated'); } catch (err) { handleServerErr(err); } finally { setBusy(false); } }}>
        <div className="modal-body">{renderFormFields('type')}</div>
        <div className="modal-footer"><button type="button" className="btn btn-ghost" onClick={() => { setEditRes(null); setError(''); }}>{es ? 'Cancelar' : 'Cancel'}</button><button className="btn btn-primary" type="submit" disabled={busy}>{es ? 'Guardar' : 'Save'}</button></div>
      </form>}
    </Modal>
  ) : null;

  return (
    <main className="content" data-testid="ticket-config-page" onKeyDown={onKeyDownTab}>
      <div className="flex items-center justify-between mb-2 flex-wrap gap-3">
        <div><h1 className="h2">{es ? 'Configuración de Tickets' : 'Ticket Configuration'}</h1>
          <p className="text-muted text-small mt-2">{es ? 'Define los estados, prioridades y tipos disponibles en este workspace.' : 'Define available statuses, priorities, and types for this workspace.'}</p></div>
        <button className="btn btn-primary" onClick={() => { setCreateRes('statuses'); setStatusForm({ name: '', category: 'new', color: '#6366f1', description: '' }); setError(''); }}>{es ? '+ Nuevo estado' : '+ New status'}</button>
      </div>

      {error && <div className="admin-alert" role="alert">{error}</div>}
      {success && <div className="admin-alert" role="status" style={{ color: 'var(--success)', background: 'var(--success-light)', borderColor: 'color-mix(in oklch, var(--success), transparent 65%)' }}>{success}</div>}

      <div className="tabs" role="tablist" aria-label={es ? 'Configuración' : 'Configuration'}>
        <button role="tab" className={`tab${tab === 'statuses' ? ' active' : ''}`} aria-selected={tab === 'statuses'} aria-controls={"panel-statuses"} tabIndex={tab === 'statuses' ? 0 : -1} onClick={() => setTab('statuses')}>{es ? 'Estados' : 'Statuses'}</button>
        <button role="tab" className={`tab${tab === 'priorities' ? ' active' : ''}`} aria-selected={tab === 'priorities'} aria-controls={"panel-priorities"} tabIndex={tab === 'priorities' ? 0 : -1} onClick={() => setTab('priorities')}>{es ? 'Prioridades' : 'Priorities'}</button>
        <button role="tab" className={`tab${tab === 'types' ? ' active' : ''}`} aria-selected={tab === 'types'} aria-controls={"panel-types"} tabIndex={tab === 'types' ? 0 : -1} onClick={() => setTab('types')}>{es ? 'Tipos de Ticket' : 'Ticket Types'}</button>
        <button role="tab" className={`tab${tab === 'transitions' ? ' active' : ''}`} aria-selected={tab === 'transitions'} aria-controls={"panel-transitions"} tabIndex={tab === 'transitions' ? 0 : -1} onClick={() => setTab('transitions')}>{es ? 'Transiciones' : 'Transitions'}</button>
      </div>

      {tab === 'statuses' && (
        <div role="tabpanel" id="panel-statuses">
          <div className="card"><div className="card-header"><span className="card-title">{es ? 'Estados disponibles' : 'Available statuses'}</span>
            <button className="btn btn-primary btn-sm" onClick={() => { setCreateRes('statuses'); setStatusForm({ name: '', category: 'new', color: '#6366f1', description: '' }); setError(''); }}>{es ? '+ Añadir' : '+ Add'}</button>
          </div>
          <div className="card-body-flush"><table className="table"><thead><tr><th>{es ? 'Estado' : 'Status'}</th><th>{es ? 'Categoría' : 'Category'}</th><th className="hide-mobile">{es ? 'Descripción' : 'Description'}</th><th className="hide-mobile">{es ? 'Acciones' : 'Actions'}</th></tr></thead>
            <tbody>{statuses.map(renderStatusRow)}</tbody>
          </table></div></div>
        </div>
      )}

      {tab === 'priorities' && (
        <div role="tabpanel" id="panel-priorities">
          <div className="card"><div className="card-header"><span className="card-title">{es ? 'Niveles de prioridad' : 'Priority levels'}</span>
            <button className="btn btn-primary btn-sm" onClick={() => { setCreateRes('priorities'); setPriorityForm({ name: '', color: '#6366f1', description: '' }); setError(''); }}>{es ? '+ Añadir' : '+ Add'}</button>
          </div>
          <div className="card-body-flush"><table className="table"><thead><tr><th>{es ? 'Prioridad' : 'Priority'}</th><th className="hide-mobile">{es ? 'Orden' : 'Order'}</th><th className="hide-mobile">{es ? 'Descripción' : 'Description'}</th><th className="hide-mobile">{es ? 'Acciones' : 'Actions'}</th></tr></thead>
            <tbody>{priorities.map(renderPriorityRow)}</tbody>
          </table></div></div>
        </div>
      )}

      {tab === 'types' && (
        <div role="tabpanel" id="panel-types">
          <div className="card"><div className="card-header"><span className="card-title">{es ? 'Tipos de ticket' : 'Ticket types'}</span>
            <button className="btn btn-primary btn-sm" onClick={() => { setCreateRes('types'); setTicketTypeForm({ name: '', category: 'incident', color: '#6366f1', description: '' }); setError(''); }}>{es ? '+ Añadir' : '+ Add'}</button>
          </div>
          <div className="card-body-flush"><table className="table"><thead><tr><th>{es ? 'Tipo' : 'Type'}</th><th>{es ? 'Categoría' : 'Category'}</th><th className="hide-mobile">{es ? 'Descripción' : 'Description'}</th><th className="hide-mobile">{es ? 'Acciones' : 'Actions'}</th></tr></thead>
            <tbody>{ticketTypes.map(renderTypeRow)}</tbody>
          </table></div></div>
        </div>
      )}

      {tab === 'transitions' && (
        <div role="tabpanel" id="panel-transitions">
          <div className="card">
            <div className="card-header"><span className="card-title">{es ? 'Transiciones' : 'Transitions'}</span></div>
            <form onSubmit={addTransition} style={{ padding: 'var(--sp-3)', display: 'flex', gap: 'var(--sp-3)', alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-1)' }}>
                <label className="label" htmlFor="from-status">{es ? 'Desde' : 'From'}</label>
                <select id="from-status" className="select" value={fromId} onChange={(e) => setFromId(e.target.value)}>
                  <option value="">—</option>
                  {statuses.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-1)' }}>
                <label className="label" htmlFor="to-status">{es ? 'Hacia' : 'To'}</label>
                <select id="to-status" className="select" value={toId} onChange={(e) => setToId(e.target.value)}>
                  <option value="">—</option>
                  {statuses.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <button className="btn btn-primary btn-sm" type="submit" disabled={busy || !fromId || !toId}>{es ? 'Añadir' : 'Add'}</button>
            </form>
            {transitions.length === 0 ? (
              <div className="card-body" style={{ textAlign: 'center', padding: 'var(--sp-6)' }}><p className="text-muted">{es ? 'No hay transiciones configuradas todavía.' : 'No transitions configured yet.'}</p></div>
            ) : (
              <div className="card-body-flush"><table className="table"><thead><tr><th>{es ? 'Transiciones' : 'Transitions'}</th><th className="hide-mobile">{es ? 'Acciones' : 'Actions'}</th></tr></thead>
                <tbody>{sortedTransitions.map((tr) => (
                  <tr key={tr.id}>
                    <td><strong>{tr.fromName}</strong> <span style={{ color: 'var(--accent)' }}>→</span> <strong>{tr.toName}</strong></td>
                    <td className="action-row"><button className="btn btn-ghost btn-sm" onClick={() => deleteTransition(tr.fromStatusId, tr.toStatusId)} aria-label={es ? `Eliminar transición de ${tr.fromName} a ${tr.toName}` : `Delete transition from ${tr.fromName} to ${tr.toName}`}>×</button></td>
                  </tr>
                ))}</tbody>
              </table></div>
            )}
          </div>
        </div>
      )}

      {createDialog}
      {editDialog}
    </main>
  );
}

export function QueuesPage({ locale }: { locale: Locale }) {
  const es = locale === 'es';
  const [queues, setQueues] = useState<Queue[]>([]);
  const [members, setMembers] = useState<QueueMember[]>([]);
  const [allMembers, setAllMembers] = useState<{ id: string; email: string; name: string | null }[]>([]);
  const [selectedQueue, setSelectedQueue] = useState<string | null>(null);
  const [modal, setModal] = useState(false);
  const [editQueue, setEditQueue] = useState<Queue | null>(null);
  const [editName, setEditName] = useState('');
  const [editMode, setEditMode] = useState<'workspace-agents' | 'restricted'>('workspace-agents');
  const [editConfirm, setEditConfirm] = useState<'pending' | 'confirmed'>('pending');
  const [createName, setCreateName] = useState('');
  const [createMode, setCreateMode] = useState<'workspace-agents' | 'restricted'>('workspace-agents');
  const [createError, setCreateError] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [busy, setBusy] = useState(false);

  const loadQueues = async () => {
    try { setQueues(await request<Queue[]>('/api/admin/queues')); setError(''); }
    catch (err) { setError(err instanceof Error ? err.message : String(err)); }
  };
  const loadMembers = async (queueId: string) => {
    try {
      const [qm, am] = await Promise.all([
        request<QueueMember[]>(`/api/admin/queues/${queueId}/members`),
        request<{ id: string; email: string; name: string | null }[]>('/api/admin/members'),
      ]);
      setMembers(qm); setAllMembers(am); setSelectedQueue(queueId);
    } catch (err) { setError(err instanceof Error ? err.message : String(err)); }
  };
  useEffect(() => { void loadQueues(); }, []);

  const codeToMessage = (code: string): string => {
    const msgs: Record<string, string> = es ? {
      'no-name': 'El nombre de la cola no puede estar vacío',
      'conflict': 'Ya existe otra cola con ese nombre',
      'not-found': 'Cola no encontrada',
      'invalid': 'Entrada no válida — revise sus valores',
      'forbidden': 'No tiene permiso para restringir el acceso a la cola',
      'error': 'Ocurrió un error',
      'server-error': 'Error del servidor — intente de nuevo más tarde',
    } : {
      'no-name': 'Queue name cannot be empty',
      'conflict': 'A queue with that name already exists',
      'not-found': 'Queue not found',
      'invalid': 'Invalid input — please check your values',
      'forbidden': 'You do not have permission to restrict queue access',
      'error': 'An error occurred',
      'server-error': 'Server error — try again later',
    };
    return msgs[code] ?? (es ? 'Ocurrió un error' : 'An error occurred');
  };

  const handleServerErr = (err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err);
    try {
      const parsed = JSON.parse(msg);
      if (parsed?.code) { setError(codeToMessage(parsed.code)); return; }
    } catch { /* plain text */ }
    if (msg.includes('403')) setError(codeToMessage('forbidden'));
    else if (msg.includes('404')) setError(codeToMessage('not-found'));
    else setError(codeToMessage('error'));
  };

  const accessLabel = (mode: string): string =>
    mode === 'restricted' ? (es ? 'Restringida' : 'Restricted') : (es ? 'Todos los agentes' : 'All agents');

  const createQueue = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!createName.trim()) { setError(codeToMessage('no-name')); return; }
    setBusy(true);
    try {
      await request('/api/admin/queues', { method: 'POST', body: JSON.stringify({ name: createName, accessMode: createMode }) });
      setCreateName(''); setCreateError(''); setModal(false);
      await loadQueues();
      setSuccess(es ? 'Cola creada' : 'Queue created');
    } catch (err) { handleServerErr(err); }
    finally { setBusy(false); }
  };

  const openEdit = (q: Queue) => {
    setEditQueue(q);
    setEditName(q.name);
    setEditMode(q.accessMode);
    setEditConfirm('pending');
  };

  const editQueueAction = async (event: React.FormEvent) => {
    if (!editQueue) return;
    event.preventDefault();
    if (!editName.trim()) { setError(codeToMessage('no-name')); return; }
    const hasAccessModeChange = editMode !== editQueue.accessMode;
    const hasNameChange = editName !== editQueue.name;
    if (!hasAccessModeChange && !hasNameChange) { setEditQueue(null); return; }
    setBusy(true);
    try {
      const body: { name?: string; accessMode?: string } = {};
      if (hasNameChange) body.name = editName;
      if (hasAccessModeChange) body.accessMode = editMode;
      await request(`/api/admin/queues/${editQueue.id}`, { method: 'PATCH', body: JSON.stringify(body) });
      setEditQueue(null); setCreateError('');
      await loadQueues();
      setSuccess(es ? 'Cola actualizada' : 'Queue updated');
    } catch (err) { handleServerErr(err); }
    finally { setBusy(false); }
  };

  const addMember = async (userId: string) => {
    if (!selectedQueue) return;
    try {
      await request(`/api/admin/queues/${selectedQueue}/members`, { method: 'POST', body: JSON.stringify({ userId }) });
      await loadMembers(selectedQueue);
      setSuccess(es ? 'Miembro añadido a la cola' : 'Member added to queue');
    } catch (err) { handleServerErr(err); }
  };

  const removeMember = async (userId: string) => {
    if (!selectedQueue) return;
    try {
      await request(`/api/admin/queues/${selectedQueue}/members/${userId}`, { method: 'DELETE' });
      await loadMembers(selectedQueue);
      setSuccess(es ? 'Miembro eliminado de la cola' : 'Member removed from queue');
    } catch (err) { handleServerErr(err); }
  };

  const eligibleMembers = useMemo(
    () => allMembers.filter((m) => !members.some((qm) => qm.userId === m.id)),
    [allMembers, members],
  );

  const createDialog = modal ? (
    <Modal title={es ? 'Nueva cola' : 'New queue'} onClose={() => { setModal(false); setCreateError(''); }}>
      <form onSubmit={createQueue}>
        <div className="modal-body">
          {createError ? <p className="form-error" role="alert">{createError}</p> : null}
          <div className="field">
            <label className="label" htmlFor="queue-name">{es ? 'Nombre' : 'Name'} <span className="required">*</span></label>
            <input id="queue-name" className="input" value={createName} onChange={(e) => setCreateName(e.target.value)} required autoFocus />
          </div>
          <div className="field">
            <fieldset>
              <legend className="label">{es ? 'Acceso' : 'Access mode'}</legend>
              <div role="radiogroup" aria-label={es ? '¿Quién puede ver los tickets en esta cola?' : 'Who can see tickets in this queue?'}>
                <label className="radio"><input type="radio" name="create-mode" checked={createMode === 'workspace-agents'} onChange={() => setCreateMode('workspace-agents')} /> {es ? 'Todos los agentes' : 'All workspace agents'}</label>
                <label className="radio"><input type="radio" name="create-mode" checked={createMode === 'restricted'} onChange={() => setCreateMode('restricted')} /> {es ? 'Restringida' : 'Restricted access'}</label>
              </div>
            </fieldset>
          </div>
        </div>
        <div className="modal-footer">
          <button type="button" className="btn btn-ghost" onClick={() => { setModal(false); setCreateError(''); }}>{es ? 'Cancelar' : 'Cancel'}</button>
          <button className="btn btn-primary" type="submit" disabled={busy}>{es ? 'Crear cola' : 'Create queue'}</button>
        </div>
      </form>
    </Modal>
  ) : null;

  const editDialog = editQueue ? (
    <Modal title={es ? 'Editar cola' : 'Edit queue'} onClose={() => { setEditQueue(null); setError(''); }}>
      <form onSubmit={editQueueAction}>
        <div className="modal-body">
          <div className="field">
            <label className="label" htmlFor="edit-queue-name">{es ? 'Nombre' : 'Name'} <span className="required">*</span></label>
            <input id="edit-queue-name" className="input" value={editName} onChange={(e) => setEditName(e.target.value)} required />
          </div>
          <div className="field">
            <fieldset>
              <legend className="label">{es ? 'Acceso' : 'Access mode'}</legend>
              <div role="radiogroup" aria-label={es ? '¿Quién puede ver los tickets en esta cola?' : 'Who can see tickets in this queue?'}>
                <label className="radio"><input type="radio" name="edit-mode" value="workspace-agents" checked={editMode === 'workspace-agents'} onChange={() => { setEditMode('workspace-agents'); setEditConfirm('pending'); }} /> {es ? 'Todos los agentes' : 'All workspace agents'}</label>
                <label className="radio"><input type="radio" name="edit-mode" value="restricted" checked={editMode === 'restricted'} onChange={() => { setEditMode('restricted'); setEditConfirm('pending'); }} /> {es ? 'Restringida' : 'Restricted access'}</label>
              </div>
            </fieldset>
            {editMode === 'restricted' && editConfirm === 'pending' && (
              <div className="admin-alert" style={{ marginTop: 'var(--sp-3)' }} role="status">
                <p style={{ margin: 0 }}>{es ? 'Cambiar a acceso restringido limitará la visibilidad. Solo los Miembros de la Cola y los Administradores del Workspace podrán ver los tickets en esta cola.' : 'Switching to restricted access will limit visibility. Only Queue Members and Workspace Admins will be able to see tickets in this queue.'}</p>
                <button type="button" className="btn btn-sm btn-primary" style={{ marginTop: 'var(--sp-2)' }} onClick={() => setEditConfirm('confirmed')}>{es ? 'Confirmar' : 'Confirm'}</button>
              </div>
            )}
          </div>
        </div>
        <div className="modal-footer">
          <button type="button" className="btn btn-ghost" onClick={() => { setEditQueue(null); setError(''); }}>{es ? 'Cancelar' : 'Cancel'}</button>
          <button className="btn btn-primary" type="submit" disabled={busy || (editMode === 'restricted' && editConfirm === 'pending')}>{es ? 'Guardar' : 'Save'}</button>
        </div>
      </form>
    </Modal>
  ) : null;

  return (
    <main className="content" data-testid="queues-page">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div><h1 className="h2">{es ? 'Colas' : 'Queues'}</h1>
          <p className="text-muted text-small mt-2">{es ? 'Gestiona las colas de tickets y sus miembros.' : 'Manage ticket queues, access modes, and members.'}</p></div>
        <button className="btn btn-primary" onClick={() => setModal(true)}>+ {es ? 'Nueva cola' : 'New queue'}</button>
      </div>

      {error && <PageError message={error} />}
      {success && <div className="admin-alert" role="status" style={{ color: 'var(--success)', background: 'var(--success-light)', borderColor: 'color-mix(in oklch, var(--success), transparent 65%)' }}>{success}</div>}

      <div className="flex gap-4 queue-layout" style={{ alignItems: 'flex-start' }}>
        <div className="flex-1 queue-list">
          {queues.length === 0 && <div className="empty-state"><p className="text-muted">{es ? 'No hay colas todavía.' : 'No queues yet.'}</p></div>}
          {queues.map((q) => (
            <button key={q.id} className={`queue-card${selectedQueue === q.id ? ' active' : ''}`} onClick={() => void loadMembers(q.id)}>
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3" style={{ minWidth: 0 }}>
                  <strong style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{q.name}</strong>
                  <span className="badge badge-info">{accessLabel(q.accessMode)}</span>
                </div>
                <div className="flex items-center gap-4 text-small text-muted hide-mobile">
                  <span>{q.activeTicketCount} {es ? 'activos' : 'active'}</span>
                  <span>{q.memberCount} {es ? 'miembros' : 'members'}</span>
                </div>
              </div>
            </button>
          ))}
        </div>
        {selectedQueue && (
          <div className="card queue-member-panel">
            <div className="card-header"><span className="card-title">{es ? 'Miembros' : 'Members'}</span>
              <button className="btn btn-ghost btn-sm" onClick={() => openEdit(queues.find((q) => q.id === selectedQueue) || null!)} aria-label={es ? 'Editar cola' : 'Edit queue'}>⚙</button>
            </div>
            <div className="card-body queue-member-body">
              <div className="flex flex-col gap-2">
                {members.length === 0 && <p className="text-small text-muted">{es ? 'Sin miembros' : 'No members'}</p>}
                {members.map((m) => (
                  <div key={m.userId} className="flex items-center justify-between" style={{ padding: 'var(--sp-2) 0', borderBottom: '1px solid var(--border)' }}>
                    <div><strong>{m.name || m.email.split('@')[0]}</strong><div className="text-small text-muted">{m.email}</div></div>
                    <button className="btn btn-ghost btn-sm" onClick={() => void removeMember(m.userId)} aria-label={es ? `Eliminar ${m.name || m.email}` : `Remove ${m.name || m.email}`}>×</button>
                  </div>
                ))}
              </div>
              <div className="divider" />
              <select className="select" value="" onChange={(e) => {
                if (e.target.value) { void addMember(e.target.value); e.target.value = ''; }
              }}>
                <option value="" disabled>{es ? 'Añadir miembro…' : 'Add member…'}</option>
                {eligibleMembers.map((m) => (
                  <option key={m.id} value={m.id}>{m.name || m.email}</option>
                ))}
              </select>
            </div>
          </div>
        )}
      </div>
      {createDialog}
      {editDialog}
    </main>
  );
}
