import type { PetState } from '../pet/model/pet';
import { isPetStateRequest, PET_MESSAGE_TYPES, type PetStateResponse } from '../messaging/messages';

export const handlePetMessage = async (
  message: unknown,
  load: () => Promise<PetState>,
): Promise<PetStateResponse | undefined> => {
  if (!isPetStateRequest(message)) return undefined;
  try {
    return { type: PET_MESSAGE_TYPES.STATE_UPDATED, state: await load() };
  } catch {
    return {
      type: PET_MESSAGE_TYPES.STATE_ERROR,
      message: 'Tab Pets could not load PetState.',
    };
  }
};
