// SLA module — Business Calendars, SLA Policies, and clock semantics
// No framework-specific types may leak into domain interfaces.

import type { WorkspaceId, QueueId, Timestamp, Uuid } from '@ticketos/shared';

// ---------------------------------------------------------------------------
// Business Calendar
// ---------------------------------------------------------------------------

export type DayOfWeek = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

export interface WorkingHours {
  day: DayOfWeek;
  startMinute: number; // minutes from midnight (e.g. 480 = 08:00)
  endMinute: number;   // minutes from midnight (e.g. 1020 = 17:00)
}

export interface CalendarException {
  date: string; // YYYY-MM-DD
  isWorkingDay: boolean;
  label?: string;
}

export interface BusinessCalendar {
  id: Uuid;
  workspaceId: WorkspaceId;
  name: string;
  timezone: string; // IANA timezone (e.g. 'America/Mexico_City')
  isDefault: boolean;
  workingHours: WorkingHours[];
  exceptions: CalendarException[];
  createdAt: Timestamp;
}

export interface CreateCalendarInput {
  workspaceId: WorkspaceId;
  name: string;
  timezone: string;
  isDefault?: boolean;
  workingHours?: WorkingHours[];
}

export interface UpdateCalendarInput {
  id: Uuid;
  name?: string;
  timezone?: string;
  isDefault?: boolean;
  workingHours?: WorkingHours[];
}

// ---------------------------------------------------------------------------
// SLA Policy
// ---------------------------------------------------------------------------

export type SLATargetKind = 'first-response' | 'resolution';

export interface SLAPolicy {
  id: Uuid;
  workspaceId: WorkspaceId;
  name: string;
  queueId: QueueId;
  priority: string; // matches ticket priority name
  calendarId: Uuid;
  firstResponseMinutes?: number | null;
  resolutionMinutes?: number | null;
  createdAt: Timestamp;
}

export interface CreateSLAPolicyInput {
  workspaceId: WorkspaceId;
  name: string;
  queueId: QueueId;
  priority: string;
  calendarId: Uuid;
  firstResponseMinutes?: number | null;
  resolutionMinutes?: number | null;
}

// ---------------------------------------------------------------------------
// SLA Target (computed for a specific Ticket)
// ---------------------------------------------------------------------------

export type SLATargetStatus = 'pending' | 'at-risk' | 'breached' | 'met';

export interface SLATarget {
  id: Uuid;
  ticketId: Uuid;
  policyId: Uuid;
  targetKind: SLATargetKind;
  startedAt: Timestamp;
  deadlineAt: Timestamp;
  pausedAt: Timestamp | null;
  elapsedMinutes: number; // working minutes elapsed (excludes paused)
  remainingMinutes: number; // working minutes remaining
  status: SLATargetStatus;
  completedAt: Timestamp | null;
  createdAt: Timestamp;
}

// ---------------------------------------------------------------------------
// SLA Module interface
// ---------------------------------------------------------------------------

export interface SLAModule {
  // Business Calendars
  createCalendar(input: CreateCalendarInput): Promise<BusinessCalendar>;
  updateCalendar(input: UpdateCalendarInput): Promise<BusinessCalendar>;
  deleteCalendar(id: Uuid): Promise<void>;
  getCalendar(id: Uuid): Promise<BusinessCalendar | null>;
  listCalendars(workspaceId: WorkspaceId): Promise<BusinessCalendar[]>;
  getDefaultCalendar(workspaceId: WorkspaceId): Promise<BusinessCalendar | null>;

  // SLA Policies
  createSLAPolicy(input: CreateSLAPolicyInput): Promise<SLAPolicy>;
  updateSLAPolicy(id: Uuid, input: Partial<CreateSLAPolicyInput>): Promise<SLAPolicy>;
  deleteSLAPolicy(id: Uuid): Promise<void>;
  getSLAPolicy(id: Uuid): Promise<SLAPolicy | null>;
  listSLAPolicies(workspaceId: WorkspaceId): Promise<SLAPolicy[]>;
  findMatchingPolicy(workspaceId: WorkspaceId, queueId: QueueId, priority: string): Promise<SLAPolicy | null>;

  // SLA Targets
  createSLATarget(ticketId: Uuid, policyId: Uuid, targetKind: SLATargetKind, startedAt?: Timestamp): Promise<SLATarget>;
  pauseSLATarget(targetId: Uuid, pausedAt?: Timestamp): Promise<SLATarget>;
  resumeSLATarget(targetId: Uuid, resumedAt?: Timestamp): Promise<SLATarget>;
  completeSLATarget(targetId: Uuid, completedAt?: Timestamp): Promise<SLATarget>;
  getSLATargetsForTicket(ticketId: Uuid): Promise<SLATarget[]>;
  reassessSLATargets(ticketId: Uuid): Promise<SLATarget[]>;

  // Time calculation
  calculateDeadline(calendarId: Uuid, startAt: Timestamp, workingMinutes: number): Promise<Timestamp>;
  isWorkingTime(calendarId: Uuid, timestamp: Timestamp): Promise<boolean>;
}
