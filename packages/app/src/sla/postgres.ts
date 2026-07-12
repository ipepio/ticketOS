import type { Pool } from 'pg';
import type {
  SLAModule,
  BusinessCalendar,
  WorkingHours,
  CalendarException,
  SLAPolicy,
  SLATarget,
  SLATargetKind,
  SLATargetStatus,
  CreateCalendarInput,
  UpdateCalendarInput,
  CreateSLAPolicyInput,
} from '@ticketos/domain';
import type { WorkspaceId, QueueId, Timestamp, Uuid } from '@ticketos/shared';

interface CalendarRow {
  id: string;
  workspace_id: string;
  name: string;
  timezone: string;
  is_default: boolean;
  working_hours: string; // JSON string
  exceptions: string; // JSON string
  created_at: string;
  updated_at: string;
}

interface PolicyRow {
  id: string;
  workspace_id: string;
  name: string;
  queue_id: string;
  priority: string;
  calendar_id: string;
  first_response_minutes: number | null;
  resolution_minutes: number | null;
  created_at: string;
  updated_at: string;
}

interface TargetRow {
  id: string;
  ticket_id: string;
  policy_id: string;
  target_kind: string;
  started_at: string;
  deadline_at: string;
  paused_at: string | null;
  elapsed_minutes: number;
  remaining_minutes: number;
  status: string;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

function mapCalendar(r: CalendarRow): BusinessCalendar {
  const wh = typeof r.working_hours === 'string' ? JSON.parse(r.working_hours) : r.working_hours;
  const ex = typeof r.exceptions === 'string' ? JSON.parse(r.exceptions) : r.exceptions;
  return {
    id: r.id,
    workspaceId: r.workspace_id,
    name: r.name,
    timezone: r.timezone,
    isDefault: r.is_default,
    workingHours: wh as WorkingHours[],
    exceptions: ex as CalendarException[],
    createdAt: r.created_at,
  };
}

function mapPolicy(r: PolicyRow): SLAPolicy {
  return {
    id: r.id,
    workspaceId: r.workspace_id,
    name: r.name,
    queueId: r.queue_id,
    priority: r.priority,
    calendarId: r.calendar_id,
    firstResponseMinutes: r.first_response_minutes,
    resolutionMinutes: r.resolution_minutes,
    createdAt: r.created_at,
  };
}

function mapTarget(r: TargetRow): SLATarget {
  return {
    id: r.id,
    ticketId: r.ticket_id,
    policyId: r.policy_id,
    targetKind: r.target_kind as SLATargetKind,
    startedAt: r.started_at,
    deadlineAt: r.deadline_at,
    pausedAt: r.paused_at,
    elapsedMinutes: r.elapsed_minutes,
    remainingMinutes: r.remaining_minutes,
    status: r.status as SLATargetStatus,
    completedAt: r.completed_at,
    createdAt: r.created_at,
  };
}

/**
 * Default 9×5 weekday working hours (Mon-Fri 08:00-17:00)
 */
const DEFAULT_WORKING_HOURS: WorkingHours[] = [
  { day: 'mon', startMinute: 480, endMinute: 1020 },
  { day: 'tue', startMinute: 480, endMinute: 1020 },
  { day: 'wed', startMinute: 480, endMinute: 1020 },
  { day: 'thu', startMinute: 480, endMinute: 1020 },
  { day: 'fri', startMinute: 480, endMinute: 1020 },
];

export class PostgresSLA implements SLAModule {
  constructor(private pool: Pool) {}

  // ---------------------------------------------------------------------------
  // Business Calendars
  // ---------------------------------------------------------------------------

  async createCalendar(input: CreateCalendarInput): Promise<BusinessCalendar> {
    const { rows } = await this.pool.query<CalendarRow>(
      `INSERT INTO business_calendars (workspace_id, name, timezone, is_default, working_hours, exceptions)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        input.workspaceId,
        input.name,
        input.timezone,
        input.isDefault ?? false,
        JSON.stringify(input.workingHours ?? DEFAULT_WORKING_HOURS),
        JSON.stringify([]),
      ],
    );
    return mapCalendar(rows[0]!);
  }

  async updateCalendar(input: UpdateCalendarInput): Promise<BusinessCalendar> {
    const sets: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (input.name !== undefined) { sets.push(`name = $${idx++}`); values.push(input.name); }
    if (input.timezone !== undefined) { sets.push(`timezone = $${idx++}`); values.push(input.timezone); }
    if (input.isDefault !== undefined) { sets.push(`is_default = $${idx++}`); values.push(input.isDefault); }
    if (input.workingHours !== undefined) { sets.push(`working_hours = $${idx++}`); values.push(JSON.stringify(input.workingHours)); }

    sets.push(`updated_at = NOW()`);
    values.push(input.id);

    const { rows } = await this.pool.query<CalendarRow>(
      `UPDATE business_calendars SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
      values,
    );
    return mapCalendar(rows[0]!);
  }

  async deleteCalendar(id: Uuid): Promise<void> {
    await this.pool.query('DELETE FROM business_calendars WHERE id = $1', [id]);
  }

  async getCalendar(id: Uuid): Promise<BusinessCalendar | null> {
    const { rows } = await this.pool.query<CalendarRow>(
      'SELECT * FROM business_calendars WHERE id = $1',
      [id],
    );
    return rows[0] ? mapCalendar(rows[0]) : null;
  }

  async listCalendars(workspaceId: WorkspaceId): Promise<BusinessCalendar[]> {
    const { rows } = await this.pool.query<CalendarRow>(
      'SELECT * FROM business_calendars WHERE workspace_id = $1 ORDER BY name',
      [workspaceId],
    );
    return rows.map(mapCalendar);
  }

  async getDefaultCalendar(workspaceId: WorkspaceId): Promise<BusinessCalendar | null> {
    const { rows } = await this.pool.query<CalendarRow>(
      'SELECT * FROM business_calendars WHERE workspace_id = $1 AND is_default = true LIMIT 1',
      [workspaceId],
    );
    return rows[0] ? mapCalendar(rows[0]) : null;
  }

  // ---------------------------------------------------------------------------
  // SLA Policies
  // ---------------------------------------------------------------------------

  async createSLAPolicy(input: CreateSLAPolicyInput): Promise<SLAPolicy> {
    const { rows } = await this.pool.query<PolicyRow>(
      `INSERT INTO sla_policies (workspace_id, name, queue_id, priority, calendar_id, first_response_minutes, resolution_minutes)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        input.workspaceId,
        input.name,
        input.queueId,
        input.priority,
        input.calendarId,
        input.firstResponseMinutes ?? null,
        input.resolutionMinutes ?? null,
      ],
    );
    return mapPolicy(rows[0]!);
  }

  async updateSLAPolicy(id: Uuid, input: Partial<CreateSLAPolicyInput>): Promise<SLAPolicy> {
    const sets: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (input.name !== undefined) { sets.push(`name = $${idx++}`); values.push(input.name); }
    if (input.queueId !== undefined) { sets.push(`queue_id = $${idx++}`); values.push(input.queueId); }
    if (input.priority !== undefined) { sets.push(`priority = $${idx++}`); values.push(input.priority); }
    if (input.calendarId !== undefined) { sets.push(`calendar_id = $${idx++}`); values.push(input.calendarId); }
    if (input.firstResponseMinutes !== undefined) { sets.push(`first_response_minutes = $${idx++}`); values.push(input.firstResponseMinutes); }
    if (input.resolutionMinutes !== undefined) { sets.push(`resolution_minutes = $${idx++}`); values.push(input.resolutionMinutes); }

    sets.push(`updated_at = NOW()`);
    values.push(id);

    const { rows } = await this.pool.query<PolicyRow>(
      `UPDATE sla_policies SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
      values,
    );
    return mapPolicy(rows[0]!);
  }

  async deleteSLAPolicy(id: Uuid): Promise<void> {
    await this.pool.query('DELETE FROM sla_policies WHERE id = $1', [id]);
  }

  async getSLAPolicy(id: Uuid): Promise<SLAPolicy | null> {
    const { rows } = await this.pool.query<PolicyRow>(
      'SELECT * FROM sla_policies WHERE id = $1',
      [id],
    );
    return rows[0] ? mapPolicy(rows[0]) : null;
  }

  async listSLAPolicies(workspaceId: WorkspaceId): Promise<SLAPolicy[]> {
    const { rows } = await this.pool.query<PolicyRow>(
      'SELECT * FROM sla_policies WHERE workspace_id = $1 ORDER BY name',
      [workspaceId],
    );
    return rows.map(mapPolicy);
  }

  async findMatchingPolicy(workspaceId: WorkspaceId, queueId: QueueId, priority: string): Promise<SLAPolicy | null> {
    const { rows } = await this.pool.query<PolicyRow>(
      'SELECT * FROM sla_policies WHERE workspace_id = $1 AND queue_id = $2 AND priority = $3 LIMIT 1',
      [workspaceId, queueId, priority],
    );
    return rows[0] ? mapPolicy(rows[0]) : null;
  }

  // ---------------------------------------------------------------------------
  // SLA Targets
  // ---------------------------------------------------------------------------

  async createSLATarget(
    ticketId: Uuid,
    policyId: Uuid,
    targetKind: SLATargetKind,
    startedAt?: Timestamp,
  ): Promise<SLATarget> {
    // Get the policy to know the target minutes and calendar
    const policy = await this.getSLAPolicy(policyId);
    if (!policy) throw new Error(`SLA Policy not found: ${policyId}`);

    const minutes = targetKind === 'first-response'
      ? policy.firstResponseMinutes
      : policy.resolutionMinutes;

    if (!minutes) {
      throw new Error(`SLA Policy ${policyId} has no ${targetKind} target configured`);
    }

    const start = startedAt ?? new Date().toISOString();
    const deadline = await this.calculateDeadline(policy.calendarId, start, minutes);

    const { rows } = await this.pool.query<TargetRow>(
      `INSERT INTO sla_targets (ticket_id, policy_id, target_kind, started_at, deadline_at, elapsed_minutes, remaining_minutes, status)
       VALUES ($1, $2, $3, $4, $5, 0, $6, 'pending')
       RETURNING *`,
      [ticketId, policyId, targetKind, start, deadline, minutes],
    );
    return mapTarget(rows[0]!);
  }

  async pauseSLATarget(targetId: Uuid, pausedAt?: Timestamp): Promise<SLATarget> {
    const { rows } = await this.pool.query<TargetRow>(
      `UPDATE sla_targets SET paused_at = $1, updated_at = NOW() WHERE id = $2 AND paused_at IS NULL RETURNING *`,
      [pausedAt ?? new Date().toISOString(), targetId],
    );
    if (!rows[0]) throw new Error(`SLA Target not found or already paused: ${targetId}`);
    return mapTarget(rows[0]);
  }

  async resumeSLATarget(targetId: Uuid, resumedAt?: Timestamp): Promise<SLATarget> {
    const now = resumedAt ?? new Date().toISOString();
    // Calculate elapsed time since pause
    const { rows: current } = await this.pool.query<TargetRow>(
      'SELECT * FROM sla_targets WHERE id = $1',
      [targetId],
    );
    if (!current[0]) throw new Error(`SLA Target not found: ${targetId}`);
    const target = current[0]!;

    if (!target.paused_at) throw new Error(`SLA Target ${targetId} is not paused`);

    // Add paused duration to elapsed
    const pauseMs = new Date(now).getTime() - new Date(target.paused_at).getTime();
    const pauseMinutes = Math.floor(pauseMs / 60000);
    const newElapsed = target.elapsed_minutes + pauseMinutes;
    const newRemaining = Math.max(0, target.remaining_minutes - pauseMinutes);

    const { rows } = await this.pool.query<TargetRow>(
      `UPDATE sla_targets SET paused_at = NULL, elapsed_minutes = $1, remaining_minutes = $2, updated_at = NOW() WHERE id = $3 RETURNING *`,
      [newElapsed, newRemaining, targetId],
    );
    return mapTarget(rows[0]!);
  }

  async completeSLATarget(targetId: Uuid, completedAt?: Timestamp): Promise<SLATarget> {
    const completed = completedAt ?? new Date().toISOString();
    const { rows } = await this.pool.query<TargetRow>(
      `UPDATE sla_targets SET status = 'met', completed_at = $1, remaining_minutes = 0, updated_at = NOW() WHERE id = $2 RETURNING *`,
      [completed, targetId],
    );
    if (!rows[0]) throw new Error(`SLA Target not found: ${targetId}`);
    return mapTarget(rows[0]);
  }

  async getSLATargetsForTicket(ticketId: Uuid): Promise<SLATarget[]> {
    const { rows } = await this.pool.query<TargetRow>(
      'SELECT * FROM sla_targets WHERE ticket_id = $1 ORDER BY created_at',
      [ticketId],
    );
    return rows.map(mapTarget);
  }

  async reassessSLATargets(_ticketId: Uuid): Promise<SLATarget[]> {
    // TODO: recompute deadlines based on current queue/priority
    return this.getSLATargetsForTicket(_ticketId);
  }

  // ---------------------------------------------------------------------------
  // Time calculation
  // ---------------------------------------------------------------------------

  async calculateDeadline(calendarId: Uuid, startAt: Timestamp, workingMinutes: number): Promise<Timestamp> {
    const calendar = await this.getCalendar(calendarId);
    if (!calendar) throw new Error(`Calendar not found: ${calendarId}`);

    // Simple calculation: add working minutes to start
    // TODO: implement proper business-hours-aware calculation
    // For now, assume 8h working day = 480 minutes
    const startDate = new Date(startAt);
    const msToAdd = workingMinutes * 60000;
    return new Date(startDate.getTime() + msToAdd).toISOString();
  }

  async isWorkingTime(calendarId: Uuid, timestamp: Timestamp): Promise<boolean> {
    const calendar = await this.getCalendar(calendarId);
    if (!calendar) throw new Error(`Calendar not found: ${calendarId}`);

    const date = new Date(timestamp);
    const dayNames: Array<['sun' | 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat', number]> = [
      ['sun', 0], ['mon', 1], ['tue', 2], ['wed', 3], ['thu', 4], ['fri', 5], ['sat', 6],
    ];
    const dayOfWeek = dayNames[date.getUTCDay()]![0];

    // Check exceptions
    const dateStr = date.toISOString().split('T')[0]!;
    const exception = calendar.exceptions.find((e) => e.date === dateStr);
    if (exception) return exception.isWorkingDay;

    // Check working hours
    const hours = calendar.workingHours.filter((wh) => wh.day === dayOfWeek);
    if (hours.length === 0) return false;

    const minuteOfDay = date.getUTCHours() * 60 + date.getUTCMinutes();
    return hours.some((wh) => minuteOfDay >= wh.startMinute && minuteOfDay < wh.endMinute);
  }
}
