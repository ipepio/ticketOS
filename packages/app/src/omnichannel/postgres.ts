import type { Pool } from 'pg';
import type {
  OmnichannelModule,
  Channel,
  ChannelMessage,
  CreateChannelInput,
  SendMessageInput,
  ChannelType,
  ChannelStatus,
  ChannelMessageDirection,
  ChannelMessageStatus,
} from '@ticketos/domain';
import type { WorkspaceId, Uuid } from '@ticketos/shared';

interface ChannelRow {
  id: string;
  workspace_id: string;
  name: string;
  type: string;
  status: string;
  config: string; // JSON
  created_at: string;
  updated_at: string;
}

interface MessageRow {
  id: string;
  channel_id: string;
  ticket_id: string | null;
  direction: string;
  content: string;
  external_id: string | null;
  status: string;
  metadata: string; // JSON
  created_at: string;
}

function mapChannel(r: ChannelRow): Channel {
  const cfg = typeof r.config === 'string' ? JSON.parse(r.config) : r.config;
  return {
    id: r.id,
    workspaceId: r.workspace_id,
    name: r.name,
    type: r.type as ChannelType,
    status: r.status as ChannelStatus,
    config: cfg as Record<string, string>,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function mapMessage(r: MessageRow): ChannelMessage {
  const meta = typeof r.metadata === 'string' ? JSON.parse(r.metadata) : r.metadata;
  return {
    id: r.id,
    channelId: r.channel_id,
    ticketId: r.ticket_id,
    direction: r.direction as ChannelMessageDirection,
    content: r.content,
    externalId: r.external_id,
    status: r.status as ChannelMessageStatus,
    metadata: meta as Record<string, string>,
    createdAt: r.created_at,
  };
}

export class PostgresOmnichannel implements OmnichannelModule {
  constructor(private pool: Pool) {}

  // ---------------------------------------------------------------------------
  // Channels
  // ---------------------------------------------------------------------------

  async createChannel(input: CreateChannelInput): Promise<Channel> {
    const { rows } = await this.pool.query<ChannelRow>(
      `INSERT INTO channels (workspace_id, name, type, config)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [input.workspaceId, input.name, input.type, JSON.stringify(input.config ?? {})],
    );
    return mapChannel(rows[0]!);
  }

  async updateChannel(id: Uuid, input: Partial<CreateChannelInput>): Promise<Channel> {
    const sets: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (input.name !== undefined) { sets.push(`name = $${idx++}`); values.push(input.name); }
    if (input.type !== undefined) { sets.push(`type = $${idx++}`); values.push(input.type); }
    if (input.config !== undefined) { sets.push(`config = $${idx++}`); values.push(JSON.stringify(input.config)); }
    sets.push('updated_at = NOW()');
    values.push(id);

    const { rows } = await this.pool.query<ChannelRow>(
      `UPDATE channels SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
      values,
    );
    if (!rows[0]) throw new Error(`Channel not found: ${id}`);
    return mapChannel(rows[0]);
  }

  async deleteChannel(id: Uuid): Promise<void> {
    await this.pool.query('DELETE FROM channels WHERE id = $1', [id]);
  }

  async getChannel(id: Uuid): Promise<Channel | null> {
    const { rows } = await this.pool.query<ChannelRow>(
      'SELECT * FROM channels WHERE id = $1',
      [id],
    );
    return rows[0] ? mapChannel(rows[0]) : null;
  }

  async listChannels(workspaceId: WorkspaceId, options?: { type?: ChannelType }): Promise<Channel[]> {
    let sql = 'SELECT * FROM channels WHERE workspace_id = $1';
    const values: unknown[] = [workspaceId];
    let idx = 2;
    if (options?.type) { sql += ` AND type = $${idx++}`; values.push(options.type); }
    sql += ' ORDER BY name';
    const { rows } = await this.pool.query<ChannelRow>(sql, values);
    return rows.map(mapChannel);
  }

  // ---------------------------------------------------------------------------
  // Messages
  // ---------------------------------------------------------------------------

  async receiveMessage(
    channelId: Uuid,
    externalId: string,
    content: string,
    metadata: Record<string, string> = {},
  ): Promise<ChannelMessage> {
    // Idempotency: check if external_id already exists
    const { rows: existing } = await this.pool.query<MessageRow>(
      'SELECT * FROM channel_messages WHERE external_id = $1',
      [externalId],
    );
    if (existing[0]) return mapMessage(existing[0]);

    const { rows } = await this.pool.query<MessageRow>(
      `INSERT INTO channel_messages (channel_id, direction, content, external_id, status, metadata)
       VALUES ($1, 'inbound', $2, $3, 'delivered', $4) RETURNING *`,
      [channelId, content, externalId, JSON.stringify(metadata)],
    );
    return mapMessage(rows[0]!);
  }

  async sendMessage(input: SendMessageInput): Promise<ChannelMessage> {
    const { rows } = await this.pool.query<MessageRow>(
      `INSERT INTO channel_messages (channel_id, ticket_id, direction, content, status, metadata)
       VALUES ($1, $2, 'outbound', $3, 'pending', $4) RETURNING *`,
      [input.channelId, input.ticketId ?? null, input.content, JSON.stringify(input.metadata ?? {})],
    );
    return mapMessage(rows[0]!);
  }

  async getMessage(id: Uuid): Promise<ChannelMessage | null> {
    const { rows } = await this.pool.query<MessageRow>(
      'SELECT * FROM channel_messages WHERE id = $1',
      [id],
    );
    return rows[0] ? mapMessage(rows[0]) : null;
  }

  async getMessagesForTicket(ticketId: Uuid): Promise<ChannelMessage[]> {
    const { rows } = await this.pool.query<MessageRow>(
      'SELECT * FROM channel_messages WHERE ticket_id = $1 ORDER BY created_at',
      [ticketId],
    );
    return rows.map(mapMessage);
  }

  async getMessagesForChannel(channelId: Uuid, options?: { limit?: number }): Promise<ChannelMessage[]> {
    let sql = 'SELECT * FROM channel_messages WHERE channel_id = $1 ORDER BY created_at DESC';
    const values: unknown[] = [channelId];
    if (options?.limit) { sql += ` LIMIT $2`; values.push(options.limit); }
    const { rows } = await this.pool.query<MessageRow>(sql, values);
    return rows.map(mapMessage);
  }

  // ---------------------------------------------------------------------------
  // Routing (simplified)
  // ---------------------------------------------------------------------------

  async routeMessage(_channelId: Uuid, _content: string): Promise<{ ticketId: Uuid; action: 'created' | 'appended' }> {
    // TODO: implement proper routing logic (match existing ticket by thread, create new, etc.)
    // For now, return a placeholder
    return { ticketId: '00000000-0000-0000-0000-000000000000', action: 'created' };
  }
}
