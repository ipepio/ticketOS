/**
 * i18n — Spanish/English localization
 */

export type Locale = 'es' | 'en';

export const localeLabels: Record<Locale, Record<string, string>> = {
  en: {
    // Navigation
    'portal.navigation': 'Navigation',
    'portal.inbox': 'Inbox',
    'portal.my_tickets': 'My Tickets',
    'portal.new_ticket': 'New Ticket',
    'portal.admin': 'Administration',
    'portal.queues': 'Queues',
    'portal.members': 'Members',
    'portal.settings': 'Settings',
    'portal.tickets': 'Tickets',

    // Auth
    'portal.login': 'Sign in',
    'portal.login_subtitle': "We'll send a magic link to your email to sign in without a password.",
    'portal.email_label': 'Email',
    'portal.send_magic_link': 'Send magic link',
    'portal.magic_link_sent': 'Magic link sent to {email}. Check your inbox.',
    'portal.login_failed': 'Login failed',
    'portal.select_workspace': 'Select Workspace',
    'portal.no_workspaces': 'No workspaces available. Contact your administrator.',

    // Ticket List
    'portal.title_col': 'Subject',
    'portal.status_col': 'Status',
    'portal.priority_col': 'Priority',
    'portal.type_col': 'Type',
    'portal.updated_col': 'Updated',
    'portal.created_col': 'Created',
    'portal.agent_col': 'Agent',
    'portal.requester_col': 'Requester',
    'portal.actions_col': 'Actions',
    'portal.open': 'Open',
    'portal.back': '← Back',
    'portal.search': 'Search...',
    'portal.select_all': 'Select all',
    'portal.select_ticket': 'Select ticket',
    'portal.showing': 'Showing {count} tickets',
    'portal.showing_queue': '{count} of {total} tickets',

    // Filters
    'portal.filter.all': 'All',
    'portal.filter.open': 'Open',
    'portal.filter.resolved': 'Resolved',
    'portal.filter.closed': 'Closed',
    'portal.filter.all_status': 'All statuses',
    'portal.filter.in_progress': 'In progress',
    'portal.filter.pending': 'Pending',

    // Tabs
    'portal.tab.all': 'All',
    'portal.tab.unassigned': 'Unassigned',
    'portal.tab.mine': 'My tickets',
    'portal.tab.urgent': 'Urgent',

    // Stats
    'portal.stat.total': 'Total in queue',
    'portal.stat.unassigned': 'Unassigned',
    'portal.stat.mine': 'Assigned to me',
    'portal.stat.urgent': 'Urgent',

    // Status
    'portal.status.backlog': 'Backlog',
    'portal.status.todo': 'To do',
    'portal.status.in_progress': 'In progress',
    'portal.status.done': 'Resolved',
    'portal.status.cancelled': 'Cancelled',

    // Priority
    'portal.priority.urgent': 'Urgent',
    'portal.priority.high': 'High',
    'portal.priority.normal': 'Normal',
    'portal.priority.low': 'Low',

    // Type
    'portal.type.incident': 'Incident',
    'portal.type.service-request': 'Service Request',

    // Visibility
    'portal.visibility.private': 'Private',
    'portal.visibility.internal': 'Internal',
    'portal.visibility.public': 'Public',

    // Actions
    'portal.claim': 'Claim',
    'portal.unassign': 'Unassign',
    'portal.attach': 'Attach',
    'portal.send': 'Send',
    'portal.send_reply': 'Send reply',
    'portal.send_note': 'Save note',
    'portal.cancel': 'Cancel',
    'portal.create': 'Create',
    'portal.unassigned': 'Unassigned',

    // Ticket Detail
    'portal.ticket_detail': 'Ticket Detail',
    'portal.timeline': 'Timeline',
    'portal.reply': 'Reply',
    'portal.internal_note': 'Internal Note',
    'portal.message_placeholder': 'Type your public reply...',
    'portal.note_placeholder': 'Type an internal note...',
    'portal.properties': 'Properties',
    'portal.description': 'Description',
    'portal.no_timeline': 'No timeline entries yet.',

    // Create Ticket
    'portal.new_ticket_title': 'New Ticket',
    'portal.title_label': 'Subject',
    'portal.description_label': 'Description',

    // Empty/Error states
    'portal.no_tickets': 'No tickets found',
    'portal.no_tickets_desc': 'Create your first ticket to get started.',
    'portal.queue_empty_desc': 'No tickets in this queue.',
    'portal.loading': 'Loading...',
    'portal.error': 'An error occurred',
    'portal.unauthorized': 'Access denied',

    // Setup wizard
    'portal.setup_title': 'Set up your installation',
    'portal.setup_subtitle': 'Create the first Workspace and admin account.',
    'portal.setup_workspace_name': 'Workspace name',
    'portal.setup_admin_email': 'Admin email',
    'portal.setup_admin_name': 'Your name',
    'portal.setup_timezone': 'Timezone',
    'portal.setup_start': 'Create installation',
    'portal.setup_creating': 'Creating...',
    'portal.setup_failed': 'Setup failed',

    // Timeline badges
    'portal.timeline.message': 'Message',
    'portal.timeline.internal_note': 'Internal Note',
    'portal.timeline.system_event': 'System',

    // Sidebar / User
    'portal.logout': 'Logout',
    'portal.member': 'Member',

    // Page titles
    'portal.page.login': 'Sign In',
    'portal.page.workspace-select': 'Select Workspace',
    'portal.page.ticket-list': 'My Tickets',
    'portal.page.ticket-detail': 'Ticket Detail',
    'portal.page.create-ticket': 'New Ticket',
    'portal.page.queue': 'Agent Queue',
    'portal.page.my-tickets': 'My Tickets',
    'portal.page.admin-queues': 'Manage Queues',
    'portal.page.admin-members': 'Manage Members',
    'portal.page.loading': 'Loading...',
    'portal.page.setup': 'Installation',

    // Error boundary
    'portal.error_boundary_title': 'Something went wrong',
    'portal.error_boundary_desc': 'An unexpected error occurred.',
  },
  es: {
    // Navigation
    'portal.navigation': 'Navegación',
    'portal.inbox': 'Inbox',
    'portal.my_tickets': 'Mis Tickets',
    'portal.new_ticket': 'Nuevo Ticket',
    'portal.admin': 'Administración',
    'portal.queues': 'Colas',
    'portal.members': 'Miembros',
    'portal.settings': 'Ajustes',
    'portal.tickets': 'Tickets',

    // Auth
    'portal.login': 'Iniciar sesión',
    'portal.login_subtitle': 'Te enviaremos un enlace mágico a tu correo para acceder sin contraseña.',
    'portal.email_label': 'Correo electrónico',
    'portal.send_magic_link': 'Enviar enlace mágico',
    'portal.magic_link_sent': 'Enlace mágico enviado a {email}. Revise su bandeja de entrada.',
    'portal.login_failed': 'Error al iniciar sesión',
    'portal.select_workspace': 'Seleccionar Espacio de trabajo',
    'portal.no_workspaces': 'No hay espacios de trabajo disponibles. Contacte a su administrador.',

    // Ticket List
    'portal.title_col': 'Asunto',
    'portal.status_col': 'Estado',
    'portal.priority_col': 'Prioridad',
    'portal.type_col': 'Tipo',
    'portal.updated_col': 'Actualizado',
    'portal.created_col': 'Creado',
    'portal.agent_col': 'Agente',
    'portal.requester_col': 'Solicitante',
    'portal.actions_col': 'Acciones',
    'portal.open': 'Abrir',
    'portal.back': '← Volver',
    'portal.search': 'Buscar...',
    'portal.select_all': 'Seleccionar todos',
    'portal.select_ticket': 'Seleccionar ticket',
    'portal.showing': 'Mostrando {count} tickets',
    'portal.showing_queue': '{count} de {total} tickets',

    // Filters
    'portal.filter.all': 'Todos',
    'portal.filter.open': 'Abiertos',
    'portal.filter.resolved': 'Resueltos',
    'portal.filter.closed': 'Cerrados',
    'portal.filter.all_status': 'Todos los estados',
    'portal.filter.in_progress': 'En progreso',
    'portal.filter.pending': 'Pendiente',

    // Tabs
    'portal.tab.all': 'Todos',
    'portal.tab.unassigned': 'Sin asignar',
    'portal.tab.mine': 'Mis tickets',
    'portal.tab.urgent': 'Urgentes',

    // Stats
    'portal.stat.total': 'Total en cola',
    'portal.stat.unassigned': 'Sin asignar',
    'portal.stat.mine': 'Asignados a mí',
    'portal.stat.urgent': 'Urgentes',

    // Status
    'portal.status.backlog': 'Pendiente',
    'portal.status.todo': 'Por hacer',
    'portal.status.in_progress': 'En progreso',
    'portal.status.done': 'Resuelto',
    'portal.status.cancelled': 'Cancelado',

    // Priority
    'portal.priority.urgent': 'Urgente',
    'portal.priority.high': 'Alta',
    'portal.priority.normal': 'Normal',
    'portal.priority.low': 'Baja',

    // Type
    'portal.type.incident': 'Incidente',
    'portal.type.service-request': 'Petición de servicio',

    // Visibility
    'portal.visibility.private': 'Privado',
    'portal.visibility.internal': 'Interno',
    'portal.visibility.public': 'Público',

    // Actions
    'portal.claim': 'Reclamar',
    'portal.unassign': 'Desasignar',
    'portal.attach': 'Adjuntar',
    'portal.send': 'Enviar',
    'portal.send_reply': 'Enviar respuesta',
    'portal.send_note': 'Guardar nota',
    'portal.cancel': 'Cancelar',
    'portal.create': 'Crear',
    'portal.unassigned': 'Sin asignar',

    // Ticket Detail
    'portal.ticket_detail': 'Detalle del Ticket',
    'portal.timeline': 'Historial',
    'portal.reply': 'Responder',
    'portal.internal_note': 'Nota interna',
    'portal.message_placeholder': 'Escribe tu respuesta pública...',
    'portal.note_placeholder': 'Escribe una nota interna...',
    'portal.properties': 'Propiedades',
    'portal.description': 'Descripción',
    'portal.no_timeline': 'Sin entradas en el historial.',

    // Create Ticket
    'portal.new_ticket_title': 'Nuevo Ticket',
    'portal.title_label': 'Asunto',
    'portal.description_label': 'Descripción',

    // Empty/Error states
    'portal.no_tickets': 'No hay tickets',
    'portal.no_tickets_desc': 'Crea tu primer ticket para comenzar.',
    'portal.queue_empty_desc': 'No hay tickets en esta cola.',
    'portal.loading': 'Cargando...',
    'portal.error': 'Ocurrió un error',
    'portal.unauthorized': 'Acceso denegado',

    // Setup wizard
    'portal.setup_title': 'Configura tu instalación',
    'portal.setup_subtitle': 'Crea el primer Espacio de Trabajo y cuenta de administrador.',
    'portal.setup_workspace_name': 'Nombre del espacio de trabajo',
    'portal.setup_admin_email': 'Correo del administrador',
    'portal.setup_admin_name': 'Tu nombre',
    'portal.setup_timezone': 'Zona horaria',
    'portal.setup_start': 'Crear instalación',
    'portal.setup_creating': 'Creando...',
    'portal.setup_failed': 'Error al configurar',

    // Timeline badges
    'portal.timeline.message': 'Mensaje',
    'portal.timeline.internal_note': 'Nota interna',
    'portal.timeline.system_event': 'Sistema',

    // Sidebar / User
    'portal.logout': 'Cerrar sesión',
    'portal.member': 'Miembro',

    // Page titles
    'portal.page.login': 'Iniciar sesión',
    'portal.page.workspace-select': 'Seleccionar espacio',
    'portal.page.ticket-list': 'Mis Tickets',
    'portal.page.ticket-detail': 'Detalle del Ticket',
    'portal.page.create-ticket': 'Nuevo Ticket',
    'portal.page.queue': 'Cola de Agentes',
    'portal.page.my-tickets': 'Mis Tickets',
    'portal.page.admin-queues': 'Administrar Colas',
    'portal.page.admin-members': 'Administrar Miembros',
    'portal.page.loading': 'Cargando...',
    'portal.page.setup': 'Instalación',

    // Error boundary
    'portal.error_boundary_title': 'Algo salió mal',
    'portal.error_boundary_desc': 'Ocurrió un error inesperado.',
  },
};

export function t(locale: Locale, key: string, vars?: Record<string, string>): string {
  const template = localeLabels[locale]?.[key] ?? localeLabels.en[key] ?? key;
  if (!vars) return template;
  return Object.entries(vars).reduce(
    (str, [k, v]) => str.replace(`{${k}}`, v),
    template,
  );
}
