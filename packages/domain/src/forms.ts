// Forms module — Versioned Ticket Forms and configurable Fields
// No framework-specific types may leak into domain interfaces.

import type { WorkspaceId, Timestamp, Uuid } from '@ticketos/shared';

// ---------------------------------------------------------------------------
// Field types
// ---------------------------------------------------------------------------

export type FieldType =
  | 'text'
  | 'textarea'
  | 'number'
  | 'email'
  | 'phone'
  | 'select'
  | 'multi-select'
  | 'date'
  | 'datetime'
  | 'checkbox'
  | 'url';

export interface FieldOption {
  label: string;
  value: string;
}

export interface FormField {
  id: Uuid;
  formVersionId: Uuid;
  name: string;
  label: string;
  fieldType: FieldType;
  required: boolean;
  options: FieldOption[]; // for select/multi-select
  defaultValue: string | null;
  placeholder: string | null;
  helpText: string | null;
  sortOrder: number;
  createdAt: Timestamp;
}

// ---------------------------------------------------------------------------
// Form and Form Version
// ---------------------------------------------------------------------------

export type FormVersionStatus = 'draft' | 'published' | 'archived';

export interface FormVersion {
  id: Uuid;
  formId: Uuid;
  version: number;
  status: FormVersionStatus;
  title: string;
  description: string | null;
  fields: FormField[];
  createdAt: Timestamp;
  publishedAt: Timestamp | null;
}

export interface Form {
  id: Uuid;
  workspaceId: WorkspaceId;
  name: string;
  description: string | null;
  currentVersionId: Uuid | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// ---------------------------------------------------------------------------
// Ticket Form Association and Answers
// ---------------------------------------------------------------------------

export interface TicketFormAssociation {
  ticketId: Uuid;
  formVersionId: Uuid;
  createdAt: Timestamp;
}

export interface FieldAnswer {
  id: Uuid;
  ticketId: Uuid;
  fieldId: Uuid;
  formVersionId: Uuid;
  value: string; // JSON-encoded value
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// ---------------------------------------------------------------------------
// Input types
// ---------------------------------------------------------------------------

export interface CreateFieldInput {
  name: string;
  label: string;
  fieldType: FieldType;
  required?: boolean;
  options?: FieldOption[];
  defaultValue?: string | null;
  placeholder?: string | null;
  helpText?: string | null;
  sortOrder?: number;
}

export interface CreateFormInput {
  workspaceId: WorkspaceId;
  name: string;
  description?: string | null;
  fields: CreateFieldInput[];
}

export interface UpdateFormInput {
  name?: string;
  description?: string | null;
  fields?: CreateFieldInput[];
}

export interface SetFieldAnswerInput {
  ticketId: Uuid;
  fieldId: Uuid;
  value: string;
}

// ---------------------------------------------------------------------------
// Forms Module interface
// ---------------------------------------------------------------------------

export interface FormsModule {
  // Forms
  createForm(input: CreateFormInput): Promise<Form>;
  updateForm(id: Uuid, input: UpdateFormInput): Promise<Form>;
  deleteForm(id: Uuid): Promise<void>;
  getForm(id: Uuid): Promise<Form | null>;
  listForms(workspaceId: WorkspaceId): Promise<Form[]>;

  // Form Versions
  getFormVersion(id: Uuid): Promise<FormVersion | null>;
  getFormVersionByForm(formId: Uuid, version: number): Promise<FormVersion | null>;
  listFormVersions(formId: Uuid): Promise<FormVersion[]>;
  publishFormVersion(versionId: Uuid): Promise<FormVersion>;
  archiveFormVersion(versionId: Uuid): Promise<FormVersion>;

  // Ticket Form Association
  associateFormToTicket(ticketId: Uuid, formVersionId: Uuid): Promise<TicketFormAssociation>;
  getTicketFormVersion(ticketId: Uuid): Promise<FormVersion | null>;

  // Field Answers
  setFieldAnswer(input: SetFieldAnswerInput): Promise<FieldAnswer>;
  getFieldAnswers(ticketId: Uuid): Promise<FieldAnswer[]>;
  validateAnswer(fieldId: Uuid, value: string): Promise<{ valid: boolean; error?: string }>;
}
