/**
 * i18n — Multi-language localization
 *
 * Supported locales: en, es, fr, de, pt, it, nl, ja, zh
 * Each locale provides at minimum the portal-visible keys.
 * Missing keys fall back to English automatically via t().
 */

export type Locale = 'en' | 'es' | 'fr' | 'de' | 'pt' | 'it' | 'nl' | 'ja' | 'zh';

// All supported locales in display order for the selector
export const SUPPORTED_LOCALES: { code: Locale; label: string; nativeLabel: string }[] = [
  { code: 'en', label: 'English', nativeLabel: 'English' },
  { code: 'es', label: 'Spanish', nativeLabel: 'Español' },
  { code: 'fr', label: 'French', nativeLabel: 'Français' },
  { code: 'de', label: 'German', nativeLabel: 'Deutsch' },
  { code: 'pt', label: 'Portuguese', nativeLabel: 'Português' },
  { code: 'it', label: 'Italian', nativeLabel: 'Italiano' },
  { code: 'nl', label: 'Dutch', nativeLabel: 'Nederlands' },
  { code: 'ja', label: 'Japanese', nativeLabel: '日本語' },
  { code: 'zh', label: 'Chinese', nativeLabel: '中文' },
];

// English is the base — all keys must be present here
const en: Record<string, string> = {
  'portal.navigation': 'Navigation',
  'portal.inbox': 'Inbox',
  'portal.my_tickets': 'My Tickets',
  'portal.new_ticket': 'New Ticket',
  'portal.admin': 'Administration',
  'portal.queues': 'Queues',
  'portal.members': 'Members',
  'portal.settings': 'Settings',
  'portal.tickets': 'Tickets',

  'portal.login': 'Sign in',
  'portal.login_subtitle': "We'll send a magic link to your email to sign in without a password.",
  'portal.email_label': 'Email',
  'portal.send_magic_link': 'Send magic link',
  'portal.magic_link_sent': 'Magic link sent to {email}. Check your inbox.',
  'portal.login_failed': 'Login failed',
  'portal.select_workspace': 'Select Workspace',
  'portal.no_workspaces': 'No workspaces available. Contact your administrator.',

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

  'portal.filter.all': 'All',
  'portal.filter.open': 'Open',
  'portal.filter.resolved': 'Resolved',
  'portal.filter.closed': 'Closed',
  'portal.filter.all_status': 'All statuses',
  'portal.filter.in_progress': 'In progress',
  'portal.filter.pending': 'Pending',

  'portal.tab.all': 'All',
  'portal.tab.unassigned': 'Unassigned',
  'portal.tab.mine': 'My tickets',
  'portal.tab.urgent': 'Urgent',

  'portal.stat.total': 'Total in queue',
  'portal.stat.unassigned': 'Unassigned',
  'portal.stat.mine': 'Assigned to me',
  'portal.stat.urgent': 'Urgent',

  'portal.status.backlog': 'Backlog',
  'portal.status.todo': 'To do',
  'portal.status.in_progress': 'In progress',
  'portal.status.done': 'Resolved',
  'portal.status.cancelled': 'Cancelled',

  'portal.priority.urgent': 'Urgent',
  'portal.priority.high': 'High',
  'portal.priority.normal': 'Normal',
  'portal.priority.low': 'Low',

  'portal.type.incident': 'Incident',
  'portal.type.service-request': 'Service Request',

  'portal.visibility.private': 'Private',
  'portal.visibility.internal': 'Internal',
  'portal.visibility.public': 'Public',

  'portal.claim': 'Claim',
  'portal.unassign': 'Unassign',
  'portal.attach': 'Attach',
  'portal.send': 'Send',
  'portal.send_reply': 'Send reply',
  'portal.send_note': 'Save note',
  'portal.cancel': 'Cancel',
  'portal.create': 'Create',
  'portal.unassigned': 'Unassigned',

  'portal.ticket_detail': 'Ticket Detail',
  'portal.timeline': 'Timeline',
  'portal.reply': 'Reply',
  'portal.internal_note': 'Internal Note',
  'portal.message_placeholder': 'Type your public reply...',
  'portal.note_placeholder': 'Type an internal note...',
  'portal.properties': 'Properties',
  'portal.description': 'Description',
  'portal.no_timeline': 'No timeline entries yet.',

  'portal.new_ticket_title': 'New Ticket',
  'portal.title_label': 'Subject',
  'portal.description_label': 'Description',

  'portal.no_tickets': 'No tickets found',
  'portal.no_tickets_desc': 'Create your first ticket to get started.',
  'portal.queue_empty_desc': 'No tickets in this queue.',
  'portal.loading': 'Loading...',
  'portal.error': 'An error occurred',
  'portal.unauthorized': 'Access denied',

  'portal.setup_title': 'Set up your installation',
  'portal.setup_subtitle': 'Create the first Workspace and admin account.',
  'portal.setup_workspace_name': 'Workspace name',
  'portal.setup_admin_email': 'Admin email',
  'portal.setup_admin_name': 'Your name',
  'portal.setup_timezone': 'Timezone',
  'portal.setup_start': 'Create installation',
  'portal.setup_creating': 'Creating...',
  'portal.setup_failed': 'Setup failed',

  'portal.timeline.message': 'Message',
  'portal.timeline.internal_note': 'Internal Note',
  'portal.timeline.system_event': 'System',

  'portal.logout': 'Logout',
  'portal.member': 'Member',

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

  'portal.error_boundary_title': 'Something went wrong',
  'portal.error_boundary_desc': 'An unexpected error occurred.',
};

// Spanish
const es: Record<string, string> = {
  'portal.navigation': 'Navegación',
  'portal.inbox': 'Inbox',
  'portal.my_tickets': 'Mis Tickets',
  'portal.new_ticket': 'Nuevo Ticket',
  'portal.admin': 'Administración',
  'portal.queues': 'Colas',
  'portal.members': 'Miembros',
  'portal.settings': 'Ajustes',
  'portal.tickets': 'Tickets',

  'portal.login': 'Iniciar sesión',
  'portal.login_subtitle': 'Te enviaremos un enlace mágico a tu correo para acceder sin contraseña.',
  'portal.email_label': 'Correo electrónico',
  'portal.send_magic_link': 'Enviar enlace mágico',
  'portal.magic_link_sent': 'Enlace mágico enviado a {email}. Revise su bandeja de entrada.',
  'portal.login_failed': 'Error al iniciar sesión',
  'portal.select_workspace': 'Seleccionar Espacio de trabajo',
  'portal.no_workspaces': 'No hay espacios de trabajo disponibles. Contacte a su administrador.',

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

  'portal.filter.all': 'Todos',
  'portal.filter.open': 'Abiertos',
  'portal.filter.resolved': 'Resueltos',
  'portal.filter.closed': 'Cerrados',
  'portal.filter.all_status': 'Todos los estados',
  'portal.filter.in_progress': 'En progreso',
  'portal.filter.pending': 'Pendiente',

  'portal.tab.all': 'Todos',
  'portal.tab.unassigned': 'Sin asignar',
  'portal.tab.mine': 'Mis tickets',
  'portal.tab.urgent': 'Urgentes',

  'portal.stat.total': 'Total en cola',
  'portal.stat.unassigned': 'Sin asignar',
  'portal.stat.mine': 'Asignados a mí',
  'portal.stat.urgent': 'Urgentes',

  'portal.status.backlog': 'Pendiente',
  'portal.status.todo': 'Por hacer',
  'portal.status.in_progress': 'En progreso',
  'portal.status.done': 'Resuelto',
  'portal.status.cancelled': 'Cancelado',

  'portal.priority.urgent': 'Urgente',
  'portal.priority.high': 'Alta',
  'portal.priority.normal': 'Normal',
  'portal.priority.low': 'Baja',

  'portal.type.incident': 'Incidente',
  'portal.type.service-request': 'Petición de servicio',

  'portal.visibility.private': 'Privado',
  'portal.visibility.internal': 'Interno',
  'portal.visibility.public': 'Público',

  'portal.claim': 'Reclamar',
  'portal.unassign': 'Desasignar',
  'portal.attach': 'Adjuntar',
  'portal.send': 'Enviar',
  'portal.send_reply': 'Enviar respuesta',
  'portal.send_note': 'Guardar nota',
  'portal.cancel': 'Cancelar',
  'portal.create': 'Crear',
  'portal.unassigned': 'Sin asignar',

  'portal.ticket_detail': 'Detalle del Ticket',
  'portal.timeline': 'Historial',
  'portal.reply': 'Responder',
  'portal.internal_note': 'Nota interna',
  'portal.message_placeholder': 'Escribe tu respuesta pública...',
  'portal.note_placeholder': 'Escribe una nota interna...',
  'portal.properties': 'Propiedades',
  'portal.description': 'Descripción',
  'portal.no_timeline': 'Sin entradas en el historial.',

  'portal.new_ticket_title': 'Nuevo Ticket',
  'portal.title_label': 'Asunto',
  'portal.description_label': 'Descripción',

  'portal.no_tickets': 'No hay tickets',
  'portal.no_tickets_desc': 'Crea tu primer ticket para comenzar.',
  'portal.queue_empty_desc': 'No hay tickets en esta cola.',
  'portal.loading': 'Cargando...',
  'portal.error': 'Ocurrió un error',
  'portal.unauthorized': 'Acceso denegado',

  'portal.setup_title': 'Configura tu instalación',
  'portal.setup_subtitle': 'Crea el primer Espacio de Trabajo y cuenta de administrador.',
  'portal.setup_workspace_name': 'Nombre del espacio de trabajo',
  'portal.setup_admin_email': 'Correo del administrador',
  'portal.setup_admin_name': 'Tu nombre',
  'portal.setup_timezone': 'Zona horaria',
  'portal.setup_start': 'Crear instalación',
  'portal.setup_creating': 'Creando...',
  'portal.setup_failed': 'Error al configurar',

  'portal.timeline.message': 'Mensaje',
  'portal.timeline.internal_note': 'Nota interna',
  'portal.timeline.system_event': 'Sistema',

  'portal.logout': 'Cerrar sesión',
  'portal.member': 'Miembro',

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

  'portal.error_boundary_title': 'Algo salió mal',
  'portal.error_boundary_desc': 'Ocurrió un error inesperado.',
};

// French
const fr: Record<string, string> = {
  'portal.navigation': 'Navigation',
  'portal.inbox': 'Boîte de réception',
  'portal.my_tickets': 'Mes tickets',
  'portal.new_ticket': 'Nouveau ticket',
  'portal.admin': 'Administration',
  'portal.queues': 'Files',
  'portal.members': 'Membres',
  'portal.settings': 'Paramètres',
  'portal.tickets': 'Tickets',

  'portal.login': 'Connexion',
  'portal.login_subtitle': 'Nous enverrons un lien magique à votre adresse e-mail pour vous connecter sans mot de passe.',
  'portal.email_label': 'E-mail',
  'portal.send_magic_link': 'Envoyer le lien magique',
  'portal.magic_link_sent': 'Lien magique envoyé à {email}. Vérifiez votre boîte de réception.',
  'portal.login_failed': 'Échec de connexion',
  'portal.select_workspace': "Sélectionner l'espace de travail",
  'portal.no_workspaces': "Aucun espace de travail disponible. Contactez votre administrateur.",

  'portal.title_col': 'Sujet',
  'portal.status_col': 'Statut',
  'portal.priority_col': 'Priorité',
  'portal.type_col': 'Type',
  'portal.updated_col': 'Mis à jour',
  'portal.created_col': 'Créé',
  'portal.agent_col': 'Agent',
  'portal.requester_col': 'Demandeur',
  'portal.open': 'Ouvrir',
  'portal.back': '← Retour',
  'portal.search': 'Rechercher...',
  'portal.showing': '{count} tickets affichés',
  'portal.showing_queue': '{count} sur {total} tickets',

  'portal.filter.all': 'Tous',
  'portal.filter.open': 'Ouverts',
  'portal.filter.resolved': 'Résolus',
  'portal.filter.closed': 'Fermés',
  'portal.filter.all_status': 'Tous les statuts',
  'portal.filter.in_progress': 'En cours',
  'portal.filter.pending': 'En attente',

  'portal.tab.all': 'Tous',
  'portal.tab.unassigned': 'Non assignés',
  'portal.tab.mine': 'Mes tickets',
  'portal.tab.urgent': 'Urgents',

  'portal.stat.total': 'Total en file',
  'portal.stat.unassigned': 'Non assignés',
  'portal.stat.mine': 'Assignés à moi',
  'portal.stat.urgent': 'Urgents',

  'portal.status.backlog': 'Backlog',
  'portal.status.todo': 'À faire',
  'portal.status.in_progress': 'En cours',
  'portal.status.done': 'Résolu',
  'portal.status.cancelled': 'Annulé',

  'portal.priority.urgent': 'Urgent',
  'portal.priority.high': 'Haute',
  'portal.priority.normal': 'Normale',
  'portal.priority.low': 'Basse',

  'portal.type.incident': 'Incident',
  'portal.type.service-request': 'Demande de service',

  'portal.visibility.private': 'Privé',
  'portal.visibility.internal': 'Interne',
  'portal.visibility.public': 'Public',

  'portal.claim': 'Prendre',
  'portal.unassign': 'Désassigner',
  'portal.attach': 'Joindre',
  'portal.send_reply': 'Envoyer la réponse',
  'portal.send_note': 'Enregistrer la note',
  'portal.cancel': 'Annuler',
  'portal.create': 'Créer',

  'portal.ticket_detail': 'Détail du ticket',
  'portal.timeline': 'Chronologie',
  'portal.reply': 'Répondre',
  'portal.internal_note': 'Note interne',
  'portal.message_placeholder': 'Tapez votre réponse publique...',
  'portal.note_placeholder': 'Tapez une note interne...',
  'portal.properties': 'Propriétés',
  'portal.description': 'Description',
  'portal.no_timeline': 'Aucune entrée dans la chronologie.',

  'portal.new_ticket_title': 'Nouveau ticket',
  'portal.title_label': 'Sujet',
  'portal.description_label': 'Description',

  'portal.no_tickets': 'Aucun ticket trouvé',
  'portal.no_tickets_desc': 'Créez votre premier ticket pour commencer.',
  'portal.queue_empty_desc': 'Aucun ticket dans cette file.',
  'portal.loading': 'Chargement...',
  'portal.error': "Une erreur s'est produite",
  'portal.unauthorized': 'Accès refusé',

  'portal.setup_title': 'Configurer votre installation',
  'portal.setup_subtitle': 'Créez le premier espace de travail et le compte administrateur.',
  'portal.setup_workspace_name': "Nom de l'espace de travail",
  'portal.setup_admin_email': 'E-mail administrateur',
  'portal.setup_admin_name': 'Votre nom',
  'portal.setup_timezone': 'Fuseau horaire',
  'portal.setup_start': "Créer l'installation",
  'portal.setup_creating': 'Création...',
  'portal.setup_failed': 'Échec de la configuration',

  'portal.timeline.message': 'Message',
  'portal.timeline.internal_note': 'Note interne',
  'portal.timeline.system_event': 'Système',

  'portal.logout': 'Déconnexion',
  'portal.member': 'Membre',

  'portal.page.login': 'Connexion',
  'portal.page.workspace-select': "Sélectionner l'espace",
  'portal.page.ticket-list': 'Mes tickets',
  'portal.page.ticket-detail': 'Détail du ticket',
  'portal.page.create-ticket': 'Nouveau ticket',
  'portal.page.queue': 'File des agents',
  'portal.page.my-tickets': 'Mes tickets',
  'portal.page.admin-queues': 'Gérer les files',
  'portal.page.admin-members': 'Gérer les membres',
  'portal.page.loading': 'Chargement...',
  'portal.page.setup': 'Installation',

  'portal.error_boundary_title': 'Une erreur est survenue',
  'portal.error_boundary_desc': 'Une erreur inattendue s est produite.',
};

// German
const de: Record<string, string> = {
  'portal.navigation': 'Navigation',
  'portal.inbox': 'Posteingang',
  'portal.my_tickets': 'Meine Tickets',
  'portal.new_ticket': 'Neues Ticket',
  'portal.admin': 'Verwaltung',
  'portal.queues': 'Warteschlangen',
  'portal.members': 'Mitglieder',
  'portal.settings': 'Einstellungen',
  'portal.tickets': 'Tickets',

  'portal.login': 'Anmelden',
  'portal.login_subtitle': 'Wir senden Ihnen einen magischen Link an Ihre E-Mail-Adresse, um sich ohne Passwort anzumelden.',
  'portal.email_label': 'E-Mail',
  'portal.send_magic_link': 'Magischen Link senden',
  'portal.magic_link_sent': 'Magischer Link an {email} gesendet. Überprüfen Sie Ihren Posteingang.',
  'portal.login_failed': 'Anmeldung fehlgeschlagen',
  'portal.select_workspace': 'Arbeitsbereich auswählen',
  'portal.no_workspaces': 'Keine Arbeitsbereiche verfügbar. Kontaktieren Sie Ihren Administrator.',

  'portal.title_col': 'Betreff',
  'portal.status_col': 'Status',
  'portal.priority_col': 'Priorität',
  'portal.type_col': 'Typ',
  'portal.updated_col': 'Aktualisiert',
  'portal.created_col': 'Erstellt',
  'portal.agent_col': 'Agent',
  'portal.requester_col': 'Anforderer',
  'portal.open': 'Öffnen',
  'portal.back': '← Zurück',
  'portal.search': 'Suchen...',
  'portal.showing': '{count} Tickets angezeigt',
  'portal.showing_queue': '{count} von {total} Tickets',

  'portal.filter.all': 'Alle',
  'portal.filter.open': 'Offen',
  'portal.filter.resolved': 'Gelöst',
  'portal.filter.closed': 'Geschlossen',
  'portal.filter.all_status': 'Alle Status',
  'portal.filter.in_progress': 'In Bearbeitung',
  'portal.filter.pending': 'Ausstehend',

  'portal.tab.all': 'Alle',
  'portal.tab.unassigned': 'Nicht zugewiesen',
  'portal.tab.mine': 'Meine Tickets',
  'portal.tab.urgent': 'Dringend',

  'portal.stat.total': 'Gesamt in Warteschlange',
  'portal.stat.unassigned': 'Nicht zugewiesen',
  'portal.stat.mine': 'Mir zugewiesen',
  'portal.stat.urgent': 'Dringend',

  'portal.status.backlog': 'Backlog',
  'portal.status.todo': 'Zu erledigen',
  'portal.status.in_progress': 'In Bearbeitung',
  'portal.status.done': 'Gelöst',
  'portal.status.cancelled': 'Abgebrochen',

  'portal.priority.urgent': 'Dringend',
  'portal.priority.high': 'Hoch',
  'portal.priority.normal': 'Normal',
  'portal.priority.low': 'Niedrig',

  'portal.type.incident': 'Vorfall',
  'portal.type.service-request': 'Serviceanfrage',

  'portal.visibility.private': 'Privat',
  'portal.visibility.internal': 'Intern',
  'portal.visibility.public': 'Öffentlich',

  'portal.claim': 'Übernehmen',
  'portal.unassign': 'Entfernen',
  'portal.attach': 'Anhängen',
  'portal.send_reply': 'Antwort senden',
  'portal.send_note': 'Notiz speichern',
  'portal.cancel': 'Abbrechen',
  'portal.create': 'Erstellen',

  'portal.ticket_detail': 'Ticket-Details',
  'portal.timeline': 'Zeitleiste',
  'portal.reply': 'Antworten',
  'portal.internal_note': 'Interne Notiz',
  'portal.message_placeholder': 'Öffentliche Antwort eingeben...',
  'portal.note_placeholder': 'Interne Notiz eingeben...',
  'portal.properties': 'Eigenschaften',
  'portal.description': 'Beschreibung',
  'portal.no_timeline': 'Noch keine Einträge in der Zeitleiste.',

  'portal.new_ticket_title': 'Neues Ticket',
  'portal.title_label': 'Betreff',
  'portal.description_label': 'Beschreibung',

  'portal.no_tickets': 'Keine Tickets gefunden',
  'portal.no_tickets_desc': 'Erstellen Sie Ihr erstes Ticket um loszulegen.',
  'portal.queue_empty_desc': 'Keine Tickets in dieser Warteschlange.',
  'portal.loading': 'Laden...',
  'portal.error': 'Ein Fehler ist aufgetreten',
  'portal.unauthorized': 'Zugriff verweigert',

  'portal.setup_title': 'Installation einrichten',
  'portal.setup_subtitle': 'Erstellen Sie den ersten Arbeitsbereich und das Admin-Konto.',
  'portal.setup_workspace_name': 'Arbeitsbereich-Name',
  'portal.setup_admin_email': 'Admin-E-Mail',
  'portal.setup_admin_name': 'Ihr Name',
  'portal.setup_timezone': 'Zeitzone',
  'portal.setup_start': 'Installation erstellen',
  'portal.setup_creating': 'Erstellen...',
  'portal.setup_failed': 'Einrichtung fehlgeschlagen',

  'portal.timeline.message': 'Nachricht',
  'portal.timeline.internal_note': 'Interne Notiz',
  'portal.timeline.system_event': 'System',

  'portal.logout': 'Abmelden',
  'portal.member': 'Mitglied',

  'portal.page.login': 'Anmelden',
  'portal.page.workspace-select': 'Arbeitsbereich wählen',
  'portal.page.ticket-list': 'Meine Tickets',
  'portal.page.ticket-detail': 'Ticket-Details',
  'portal.page.create-ticket': 'Neues Ticket',
  'portal.page.queue': 'Agent-Warteschlange',
  'portal.page.my-tickets': 'Meine Tickets',
  'portal.page.loading': 'Laden...',
  'portal.page.setup': 'Installation',

  'portal.error_boundary_title': 'Etwas ist schiefgelaufen',
  'portal.error_boundary_desc': 'Ein unerwarteter Fehler ist aufgetreten.',
};

// Portuguese
const pt: Record<string, string> = {
  'portal.navigation': 'Navegação',
  'portal.inbox': 'Caixa de entrada',
  'portal.my_tickets': 'Meus tickets',
  'portal.new_ticket': 'Novo ticket',
  'portal.admin': 'Administração',
  'portal.queues': 'Filas',
  'portal.members': 'Membros',
  'portal.settings': 'Configurações',
  'portal.tickets': 'Tickets',

  'portal.login': 'Entrar',
  'portal.login_subtitle': 'Enviaremos um link mágico para seu e-mail para entrar sem senha.',
  'portal.email_label': 'E-mail',
  'portal.send_magic_link': 'Enviar link mágico',
  'portal.magic_link_sent': 'Link mágico enviado para {email}. Verifique sua caixa de entrada.',
  'portal.login_failed': 'Falha ao entrar',
  'portal.select_workspace': 'Selecionar espaço de trabalho',
  'portal.no_workspaces': 'Nenhum espaço de trabalho disponível. Entre em contato com seu administrador.',

  'portal.title_col': 'Assunto',
  'portal.status_col': 'Status',
  'portal.priority_col': 'Prioridade',
  'portal.type_col': 'Tipo',
  'portal.updated_col': 'Atualizado',
  'portal.created_col': 'Criado',
  'portal.agent_col': 'Agente',
  'portal.requester_col': 'Solicitante',
  'portal.open': 'Abrir',
  'portal.back': '← Voltar',
  'portal.search': 'Pesquisar...',
  'portal.filter.all': 'Todos',
  'portal.filter.open': 'Abertos',
  'portal.filter.resolved': 'Resolvidos',
  'portal.filter.closed': 'Fechados',
  'portal.filter.all_status': 'Todos os status',
  'portal.filter.in_progress': 'Em andamento',
  'portal.filter.pending': 'Pendente',

  'portal.tab.all': 'Todos',
  'portal.tab.unassigned': 'Não atribuídos',
  'portal.tab.mine': 'Meus tickets',
  'portal.tab.urgent': 'Urgentes',

  'portal.stat.total': 'Total na fila',
  'portal.stat.unassigned': 'Não atribuídos',
  'portal.stat.mine': 'Atribuídos a mim',
  'portal.stat.urgent': 'Urgentes',

  'portal.status.backlog': 'Backlog',
  'portal.status.todo': 'A fazer',
  'portal.status.in_progress': 'Em andamento',
  'portal.status.done': 'Resolvido',
  'portal.status.cancelled': 'Cancelado',

  'portal.priority.urgent': 'Urgente',
  'portal.priority.high': 'Alta',
  'portal.priority.normal': 'Normal',
  'portal.priority.low': 'Baixa',

  'portal.type.incident': 'Incidente',
  'portal.type.service-request': 'Solicitação de serviço',

  'portal.claim': 'Assumir',
  'portal.unassign': 'Desatribuir',
  'portal.attach': 'Anexar',
  'portal.send_reply': 'Enviar resposta',
  'portal.send_note': 'Salvar nota',
  'portal.cancel': 'Cancelar',
  'portal.create': 'Criar',

  'portal.ticket_detail': 'Detalhes do Ticket',
  'portal.timeline': 'Linha do tempo',
  'portal.reply': 'Responder',
  'portal.internal_note': 'Nota interna',
  'portal.message_placeholder': 'Digite sua resposta pública...',
  'portal.note_placeholder': 'Digite uma nota interna...',
  'portal.properties': 'Propriedades',
  'portal.description': 'Descrição',
  'portal.no_timeline': 'Nenhuma entrada na linha do tempo.',

  'portal.new_ticket_title': 'Novo Ticket',
  'portal.title_label': 'Assunto',
  'portal.description_label': 'Descrição',

  'portal.no_tickets': 'Nenhum ticket encontrado',
  'portal.no_tickets_desc': 'Crie seu primeiro ticket para começar.',
  'portal.loading': 'Carregando...',
  'portal.error': 'Ocorreu um erro',
  'portal.unauthorized': 'Acesso negado',

  'portal.setup_title': 'Configure sua instalação',
  'portal.setup_subtitle': 'Crie o primeiro espaço de trabalho e conta de administrador.',
  'portal.setup_workspace_name': 'Nome do espaço de trabalho',
  'portal.setup_admin_email': 'E-mail do administrador',
  'portal.setup_admin_name': 'Seu nome',
  'portal.setup_timezone': 'Fuso horário',
  'portal.setup_start': 'Criar instalação',
  'portal.setup_creating': 'Criando...',
  'portal.setup_failed': 'Falha na configuração',

  'portal.timeline.message': 'Mensagem',
  'portal.timeline.internal_note': 'Nota interna',
  'portal.timeline.system_event': 'Sistema',

  'portal.logout': 'Sair',
  'portal.member': 'Membro',

  'portal.page.login': 'Entrar',
  'portal.page.ticket-list': 'Meus tickets',
  'portal.page.ticket-detail': 'Detalhes do Ticket',
  'portal.page.create-ticket': 'Novo Ticket',
  'portal.page.queue': 'Fila de Agentes',
  'portal.page.my-tickets': 'Meus tickets',
  'portal.page.loading': 'Carregando...',
  'portal.page.setup': 'Instalação',

  'portal.error_boundary_title': 'Algo deu errado',
  'portal.error_boundary_desc': 'Ocorreu um erro inesperado.',
};

// Italian
const it: Record<string, string> = {
  'portal.navigation': 'Navigazione',
  'portal.inbox': 'Casella di posta',
  'portal.my_tickets': 'I miei ticket',
  'portal.new_ticket': 'Nuovo ticket',
  'portal.admin': 'Amministrazione',
  'portal.queues': 'Code',
  'portal.members': 'Membri',
  'portal.settings': 'Impostazioni',
  'portal.tickets': 'Ticket',

  'portal.login': 'Accedi',
  'portal.login_subtitle': 'Invieremo un link magico alla tua email per accedere senza password.',
  'portal.email_label': 'Email',
  'portal.send_magic_link': 'Invia link magico',
  'portal.magic_link_sent': 'Link magico inviato a {email}. Controlla la tua casella di posta.',
  'portal.login_failed': 'Accesso fallito',
  'portal.select_workspace': 'Seleziona spazio di lavoro',
  'portal.no_workspaces': 'Nessuno spazio di lavoro disponibile. Contatta il tuo amministratore.',

  'portal.title_col': 'Oggetto',
  'portal.status_col': 'Stato',
  'portal.priority_col': 'Priorità',
  'portal.type_col': 'Tipo',
  'portal.updated_col': 'Aggiornato',
  'portal.created_col': 'Creato',
  'portal.agent_col': 'Agente',
  'portal.requester_col': 'Richiedente',
  'portal.open': 'Apri',
  'portal.back': '← Indietro',
  'portal.search': 'Cerca...',
  'portal.filter.all': 'Tutti',
  'portal.filter.open': 'Aperti',
  'portal.filter.resolved': 'Risolti',
  'portal.filter.closed': 'Chiusi',

  'portal.status.backlog': 'Backlog',
  'portal.status.todo': 'Da fare',
  'portal.status.in_progress': 'In corso',
  'portal.status.done': 'Risolto',
  'portal.status.cancelled': 'Annullato',

  'portal.priority.urgent': 'Urgente',
  'portal.priority.high': 'Alta',
  'portal.priority.normal': 'Normale',
  'portal.priority.low': 'Bassa',

  'portal.type.incident': 'Incidente',
  'portal.type.service-request': 'Richiesta di servizio',

  'portal.claim': 'Assegna a me',
  'portal.attach': 'Allega',
  'portal.send_reply': 'Invia risposta',
  'portal.send_note': 'Salva nota',
  'portal.cancel': 'Annulla',
  'portal.create': 'Crea',

  'portal.ticket_detail': 'Dettaglio ticket',
  'portal.timeline': 'Cronologia',
  'portal.reply': 'Rispondi',
  'portal.internal_note': 'Nota interna',
  'portal.message_placeholder': 'Scrivi la tua risposta pubblica...',
  'portal.note_placeholder': 'Scrivi una nota interna...',
  'portal.properties': 'Proprietà',
  'portal.description': 'Descrizione',
  'portal.no_timeline': 'Nessuna voce nella cronologia.',

  'portal.no_tickets': 'Nessun ticket trovato',
  'portal.loading': 'Caricamento...',
  'portal.error': 'Si è verificato un errore',
  'portal.unauthorized': 'Accesso negato',

  'portal.setup_title': 'Configura la tua installazione',
  'portal.setup_subtitle': 'Crea il primo spazio di lavoro e account amministratore.',
  'portal.setup_workspace_name': 'Nome spazio di lavoro',
  'portal.setup_admin_email': 'Email amministratore',
  'portal.setup_admin_name': 'Il tuo nome',
  'portal.setup_timezone': 'Fuso orario',
  'portal.setup_start': 'Crea installazione',
  'portal.setup_creating': 'Creazione...',
  'portal.setup_failed': 'Configurazione fallita',

  'portal.timeline.message': 'Messaggio',
  'portal.timeline.internal_note': 'Nota interna',
  'portal.timeline.system_event': 'Sistema',

  'portal.logout': 'Esci',
  'portal.member': 'Membro',

  'portal.page.login': 'Accedi',
  'portal.page.ticket-list': 'I miei ticket',
  'portal.page.ticket-detail': 'Dettaglio ticket',
  'portal.page.create-ticket': 'Nuovo ticket',
  'portal.page.queue': 'Coda agenti',
  'portal.page.loading': 'Caricamento...',
  'portal.page.setup': 'Installazione',

  'portal.error_boundary_title': 'Qualcosa è andato storto',
  'portal.error_boundary_desc': 'Si è verificato un errore imprevisto.',
};

// Dutch
const nl: Record<string, string> = {
  'portal.navigation': 'Navigatie',
  'portal.inbox': 'Postvak IN',
  'portal.my_tickets': 'Mijn tickets',
  'portal.new_ticket': 'Nieuw ticket',
  'portal.admin': 'Beheer',
  'portal.queues': 'Wachtrijen',
  'portal.members': 'Leden',
  'portal.settings': 'Instellingen',
  'portal.tickets': 'Tickets',

  'portal.login': 'Inloggen',
  'portal.login_subtitle': 'We sturen een magische link naar je e-mail om in te loggen zonder wachtwoord.',
  'portal.email_label': 'E-mail',
  'portal.send_magic_link': 'Magische link versturen',
  'portal.magic_link_sent': 'Magische link verstuurd naar {email}. Controleer je inbox.',
  'portal.login_failed': 'Inloggen mislukt',
  'portal.select_workspace': 'Werkruimte selecteren',
  'portal.no_workspaces': 'Geen werkruimtes beschikbaar. Neem contact op met je beheerder.',

  'portal.title_col': 'Onderwerp',
  'portal.status_col': 'Status',
  'portal.priority_col': 'Prioriteit',
  'portal.type_col': 'Type',
  'portal.updated_col': 'Bijgewerkt',
  'portal.created_col': 'Aangemaakt',
  'portal.agent_col': 'Agent',
  'portal.requester_col': 'Verzoeker',
  'portal.open': 'Openen',
  'portal.back': '← Terug',
  'portal.search': 'Zoeken...',

  'portal.filter.all': 'Alle',
  'portal.filter.open': 'Open',
  'portal.filter.resolved': 'Opgelost',
  'portal.filter.closed': 'Gesloten',

  'portal.status.backlog': 'Backlog',
  'portal.status.todo': 'Te doen',
  'portal.status.in_progress': 'Bezig',
  'portal.status.done': 'Opgelost',
  'portal.status.cancelled': 'Geannuleerd',

  'portal.priority.urgent': 'Urgent',
  'portal.priority.high': 'Hoog',
  'portal.priority.normal': 'Normaal',
  'portal.priority.low': 'Laag',

  'portal.type.incident': 'Incident',
  'portal.type.service-request': 'Serviceverzoek',

  'portal.claim': 'Ophalen',
  'portal.attach': 'Bijvoegen',
  'portal.send_reply': 'Antwoord versturen',
  'portal.send_note': 'Notitie opslaan',
  'portal.cancel': 'Annuleren',
  'portal.create': 'Aanmaken',

  'portal.ticket_detail': 'Ticketdetails',
  'portal.timeline': 'Tijdlijn',
  'portal.reply': 'Antwoorden',
  'portal.internal_note': 'Interne notitie',
  'portal.message_placeholder': 'Typ je openbare antwoord...',
  'portal.note_placeholder': 'Typ een interne notitie...',
  'portal.properties': 'Eigenschappen',
  'portal.description': 'Beschrijving',
  'portal.no_timeline': 'Nog geen tijdlijnvermeldingen.',

  'portal.no_tickets': 'Geen tickets gevonden',
  'portal.loading': 'Laden...',
  'portal.error': 'Er is een fout opgetreden',
  'portal.unauthorized': 'Toegang geweigerd',

  'portal.setup_title': 'Installeer je omgeving',
  'portal.setup_subtitle': 'Maak de eerste werkruimte en beheerdersaccount aan.',
  'portal.setup_workspace_name': 'Naam werkruimte',
  'portal.setup_admin_email': 'E-mail beheerder',
  'portal.setup_admin_name': 'Jouw naam',
  'portal.setup_timezone': 'Tijdzone',
  'portal.setup_start': 'Installatie aanmaken',
  'portal.setup_creating': 'Aanmaken...',
  'portal.setup_failed': 'Installatie mislukt',

  'portal.logout': 'Uitloggen',
  'portal.member': 'Lid',

  'portal.page.login': 'Inloggen',
  'portal.page.ticket-list': 'Mijn tickets',
  'portal.page.ticket-detail': 'Ticketdetails',
  'portal.page.create-ticket': 'Nieuw ticket',
  'portal.page.queue': 'Agent wachtrij',
  'portal.page.loading': 'Laden...',
  'portal.page.setup': 'Installatie',

  'portal.error_boundary_title': 'Er is iets misgegaan',
  'portal.error_boundary_desc': 'Er is een onverwachte fout opgetreden.',
};

// Japanese
const ja: Record<string, string> = {
  'portal.navigation': 'ナビゲーション',
  'portal.inbox': '受信箱',
  'portal.my_tickets': 'マイチケット',
  'portal.new_ticket': '新規チケット',
  'portal.admin': '管理',
  'portal.queues': 'キュー',
  'portal.members': 'メンバー',
  'portal.settings': '設定',
  'portal.tickets': 'チケット',

  'portal.login': 'ログイン',
  'portal.login_subtitle': 'パスワードなしでメールにマジックリンクを送信します。',
  'portal.email_label': 'メールアドレス',
  'portal.send_magic_link': 'マジックリンクを送信',
  'portal.magic_link_sent': 'マジックリンクを {email} に送信しました。受信箱を確認してください。',
  'portal.login_failed': 'ログイン失敗',
  'portal.select_workspace': 'ワークスペースを選択',
  'portal.no_workspaces': '利用可能なワークスペースがありません。管理者にお問い合わせください。',

  'portal.title_col': '件名',
  'portal.status_col': 'ステータス',
  'portal.priority_col': '優先度',
  'portal.type_col': '種類',
  'portal.updated_col': '更新日',
  'portal.created_col': '作成日',
  'portal.agent_col': '担当者',
  'portal.requester_col': '依頼者',
  'portal.open': '開く',
  'portal.back': '← 戻る',
  'portal.search': '検索...',
  'portal.filter.all': 'すべて',
  'portal.filter.open': '未解決',
  'portal.filter.resolved': '解決済み',
  'portal.filter.closed': 'クローズ',

  'portal.status.backlog': 'バックログ',
  'portal.status.todo': 'TODO',
  'portal.status.in_progress': '進行中',
  'portal.status.done': '解決済み',
  'portal.status.cancelled': 'キャンセル済み',

  'portal.priority.urgent': '緊急',
  'portal.priority.high': '高',
  'portal.priority.normal': '通常',
  'portal.priority.low': '低',

  'portal.type.incident': 'インシデント',
  'portal.type.service-request': 'サービスリクエスト',

  'portal.claim': '受取る',
  'portal.attach': '添付',
  'portal.send_reply': '返信を送信',
  'portal.send_note': 'メモを保存',
  'portal.cancel': 'キャンセル',
  'portal.create': '作成',

  'portal.ticket_detail': 'チケット詳細',
  'portal.timeline': 'タイムライン',
  'portal.reply': '返信',
  'portal.internal_note': '社内メモ',
  'portal.message_placeholder': '公開返信を入力...',
  'portal.note_placeholder': '社内メモを入力...',
  'portal.properties': 'プロパティ',
  'portal.description': '説明',
  'portal.no_timeline': 'タイムラインエントリがありません。',

  'portal.no_tickets': 'チケットが見つかりません',
  'portal.loading': '読み込み中...',
  'portal.error': 'エラーが発生しました',
  'portal.unauthorized': 'アクセスが拒否されました',

  'portal.setup_title': 'インストールを設定',
  'portal.setup_subtitle': '最初のワークスペースと管理者アカウントを作成します。',
  'portal.setup_workspace_name': 'ワークスペース名',
  'portal.setup_admin_email': '管理者メール',
  'portal.setup_admin_name': 'お名前',
  'portal.setup_timezone': 'タイムゾーン',
  'portal.setup_start': 'インストール作成',
  'portal.setup_creating': '作成中...',
  'portal.setup_failed': '設定に失敗しました',

  'portal.timeline.message': 'メッセージ',
  'portal.timeline.internal_note': '社内メモ',
  'portal.timeline.system_event': 'システム',

  'portal.logout': 'ログアウト',
  'portal.member': 'メンバー',

  'portal.page.login': 'ログイン',
  'portal.page.ticket-list': 'マイチケット',
  'portal.page.ticket-detail': 'チケット詳細',
  'portal.page.create-ticket': '新規チケット',
  'portal.page.queue': 'エージェントキュー',
  'portal.page.loading': '読み込み中...',
  'portal.page.setup': 'インストール',

  'portal.error_boundary_title': '問題が発生しました',
  'portal.error_boundary_desc': '予期しないエラーが発生しました。',
};

// Chinese Simplified
const zh: Record<string, string> = {
  'portal.navigation': '导航',
  'portal.inbox': '收件箱',
  'portal.my_tickets': '我的工单',
  'portal.new_ticket': '新建工单',
  'portal.admin': '管理',
  'portal.queues': '队列',
  'portal.members': '成员',
  'portal.settings': '设置',
  'portal.tickets': '工单',

  'portal.login': '登录',
  'portal.login_subtitle': '我们将向您的邮箱发送一个免密登录链接。',
  'portal.email_label': '邮箱',
  'portal.send_magic_link': '发送登录链接',
  'portal.magic_link_sent': '登录链接已发送到 {email}，请查收。',
  'portal.login_failed': '登录失败',
  'portal.select_workspace': '选择工作区',
  'portal.no_workspaces': '没有可用的工作区，请联系管理员。',

  'portal.title_col': '主题',
  'portal.status_col': '状态',
  'portal.priority_col': '优先级',
  'portal.type_col': '类型',
  'portal.updated_col': '更新时间',
  'portal.created_col': '创建时间',
  'portal.agent_col': '客服',
  'portal.requester_col': '提交人',
  'portal.open': '打开',
  'portal.back': '← 返回',
  'portal.search': '搜索...',
  'portal.filter.all': '全部',
  'portal.filter.open': '未解决',
  'portal.filter.resolved': '已解决',
  'portal.filter.closed': '已关闭',

  'portal.status.backlog': '待办',
  'portal.status.todo': '待处理',
  'portal.status.in_progress': '处理中',
  'portal.status.done': '已解决',
  'portal.status.cancelled': '已取消',

  'portal.priority.urgent': '紧急',
  'portal.priority.high': '高',
  'portal.priority.normal': '普通',
  'portal.priority.low': '低',

  'portal.type.incident': '事件',
  'portal.type.service-request': '服务请求',

  'portal.claim': '领取',
  'portal.attach': '附件',
  'portal.send_reply': '发送回复',
  'portal.send_note': '保存备注',
  'portal.cancel': '取消',
  'portal.create': '创建',

  'portal.ticket_detail': '工单详情',
  'portal.timeline': '时间线',
  'portal.reply': '回复',
  'portal.internal_note': '内部备注',
  'portal.message_placeholder': '输入公开回复...',
  'portal.note_placeholder': '输入内部备注...',
  'portal.properties': '属性',
  'portal.description': '描述',
  'portal.no_timeline': '暂无时间线记录。',

  'portal.no_tickets': '未找到工单',
  'portal.loading': '加载中...',
  'portal.error': '发生错误',
  'portal.unauthorized': '访问被拒绝',

  'portal.setup_title': '设置安装',
  'portal.setup_subtitle': '创建第一个工作区和管理员账户。',
  'portal.setup_workspace_name': '工作区名称',
  'portal.setup_admin_email': '管理员邮箱',
  'portal.setup_admin_name': '您的姓名',
  'portal.setup_timezone': '时区',
  'portal.setup_start': '创建安装',
  'portal.setup_creating': '创建中...',
  'portal.setup_failed': '设置失败',

  'portal.timeline.message': '消息',
  'portal.timeline.internal_note': '内部备注',
  'portal.timeline.system_event': '系统',

  'portal.logout': '退出登录',
  'portal.member': '成员',

  'portal.page.login': '登录',
  'portal.page.ticket-list': '我的工单',
  'portal.page.ticket-detail': '工单详情',
  'portal.page.create-ticket': '新建工单',
  'portal.page.queue': '客服队列',
  'portal.page.loading': '加载中...',
  'portal.page.setup': '安装',

  'portal.error_boundary_title': '出现了一些问题',
  'portal.error_boundary_desc': '发生了意外错误。',
};

// All locales
const localeLabels: Record<Locale, Record<string, string>> = {
  en,
  es,
  fr,
  de,
  pt,
  it,
  nl,
  ja,
  zh,
};
export { localeLabels };

// ---------------------------------------------------------------------------
// Locale resolver
// ---------------------------------------------------------------------------

/**
 * Resolve the initial locale from available sources.
 * Priority: stored value > browser languages > English.
 */
export function resolveInitialLocale(
  storedValue: string | null,
  browserLanguages: readonly string[],
): Locale {
  if (storedValue === 'en' || storedValue === 'es' || storedValue === 'fr' ||
      storedValue === 'de' || storedValue === 'pt' || storedValue === 'it' ||
      storedValue === 'nl' || storedValue === 'ja' || storedValue === 'zh') {
    return storedValue as Locale;
  }

  for (const lang of browserLanguages) {
    const prefix = lang.toLowerCase().split('-')[0];
    if (prefix === 'en') return 'en';
    if (prefix === 'es') return 'es';
    if (prefix === 'fr') return 'fr';
    if (prefix === 'de') return 'de';
    if (prefix === 'pt') return 'pt';
    if (prefix === 'it') return 'it';
    if (prefix === 'nl') return 'nl';
    if (prefix === 'ja') return 'ja';
    if (prefix === 'zh') return 'zh';
  }

  return 'en';
}

// ---------------------------------------------------------------------------
// Translation function
// ---------------------------------------------------------------------------

export function t(locale: Locale, key: string, vars?: Record<string, string>): string {
  const template = localeLabels[locale]?.[key] ?? localeLabels.en[key] ?? key;
  if (!vars) return template;
  return Object.entries(vars).reduce(
    (str, [k, v]) => str.replace(`{${k}}`, v),
    template,
  );
}
