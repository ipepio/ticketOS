// Omnichannel module — Channel adapters for chat, social, etc.
// No framework-specific types may leak into domain interfaces.

import type { WorkspaceId, Uuid, Timestamp } from '@ticketos/shared';

// ---------------------------------------------------------------------------
// Channel types
// ---------------------------------------------------------------------------

export type ChannelType = 'email' | 'chat' | 'whatsapp' | 'sms' | 'social';

export type ChannelStatus = 'active' | 'paused' | 'disabled';

export interface Channel {
  id: Uuid;
  workspaceId: WorkspaceId;
  name: string;
  type: ChannelType;
  status: ChannelStatus;
  config: Record<string, string>;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// ---------------------------------------------------------------------------
// Channel Message
// ---------------------------------------------------------------------------

export type ChannelMessageDirection = 'inbound' | 'outbound';
export type ChannelMessageStatus = 'pending' | 'delivered' | 'failed' | 'read';

export interface ChannelMessage {
  id: Uuid;
  channelId: Uuid;
  ticketId: Uuid | null;
  direction: ChannelMessageDirection;
  content: string;
  externalId: string | null;
  status: ChannelMessageStatus;
  metadata: Record<string, string>;
  createdAt: Timestamp;
}

// ---------------------------------------------------------------------------
// Input types
// ---------------------------------------------------------------------------

export interface CreateChannelInput {
  workspaceId: WorkspaceId;
  name: string;
  type: ChannelType;
  config?: Record<string, string>;
}

export interface SendMessageInput {
  channelId: Uuid;
  ticketId?: Uuid | null;
  content: string;
  metadata?: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Omnichannel Module interface
// ---------------------------------------------------------------------------

export interface OmnichannelModule {
  // Channels
  createChannel(input: CreateChannelInput): Promise<Channel>;
  updateChannel(id: Uuid, input: Partial<CreateChannelInput>): Promise<Channel>;
  deleteChannel(id: Uuid): Promise<void>;
  getChannel(id: Uuid): Promise<Channel | null>;
  listChannels(workspaceId: WorkspaceId, options?: { type?: ChannelType }): Promise<Channel[]>;

  // Messages
  receiveMessage(channelId: Uuid, externalId: string, content: string, metadata?: Record<string, string>): Promise<ChannelMessage>;
  sendMessage(input: SendMessageInput): Promise<ChannelMessage>;
  getMessage(id: Uuid): Promise<ChannelMessage | null>;
  getMessagesForTicket(ticketId: Uuid): Promise<ChannelMessage[]>;
  getMessagesForChannel(channelId: Uuid, options?: { limit?: number }): Promise<ChannelMessage[]>;

  // Routing
  routeMessage(channelId: Uuid, content: string): Promise<{ ticketId: Uuid; action: 'created' | 'appended' }>;
}
