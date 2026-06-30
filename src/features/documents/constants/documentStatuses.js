// @ts-check

export const DOCUMENT_STATUSES = Object.freeze({
  UPLOADED: 'uploaded',
  UPLOADING: 'uploading',
  PENDING: 'pending',
  PROCESSING: 'processing',
  ANALYZED: 'analyzed',
  ERROR: 'error',
  ARCHIVED: 'archived',
  AI_DISABLED: 'ai_disabled',
});

export const AI_DISABLED_RESPONSE_STATUSES = new Set([
  'disabled',
  DOCUMENT_STATUSES.AI_DISABLED,
]);
