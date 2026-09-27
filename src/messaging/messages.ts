import type { PetState } from '../pet/model/pet';

export const PET_MESSAGE_TYPES = {
  STATE_REQUEST: 'PET_STATE_REQUEST',
  STATE_UPDATED: 'PET_STATE_UPDATED',
  STATE_ERROR: 'PET_STATE_ERROR',
  INTERACTION: 'PET_INTERACTION',
  CALL_HOME: 'CALL_HOME',
  SEND_OUT: 'SEND_OUT',
} as const;

export type PetMessage =
  | { type: typeof PET_MESSAGE_TYPES.STATE_REQUEST }
  | { type: typeof PET_MESSAGE_TYPES.STATE_UPDATED; state: PetState }
  | { type: typeof PET_MESSAGE_TYPES.STATE_ERROR; message: string }
  | { type: typeof PET_MESSAGE_TYPES.INTERACTION; action: 'PET' | 'PLAY' }
  | { type: typeof PET_MESSAGE_TYPES.CALL_HOME }
  | { type: typeof PET_MESSAGE_TYPES.SEND_OUT };

export type PetStateResponse = Extract<
  PetMessage,
  { type: typeof PET_MESSAGE_TYPES.STATE_UPDATED | typeof PET_MESSAGE_TYPES.STATE_ERROR }
>;

export const isPetStateRequest = (value: unknown): boolean =>
  typeof value === 'object' &&
  value !== null &&
  'type' in value &&
  value.type === PET_MESSAGE_TYPES.STATE_REQUEST;
