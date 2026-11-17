import { storage } from "wxt/utils/storage";
import { EMPTY_SPEED_STATE, parseSpeedState, type SpeedState } from "./speed";

export const speedStateItem = storage.defineItem<SpeedState>("local:speed-state", {
  fallback: EMPTY_SPEED_STATE,
  version: 1,
});

export async function getSpeedState(): Promise<SpeedState> {
  return parseSpeedState(await speedStateItem.getValue());
}

export async function saveSpeedState(state: SpeedState): Promise<void> {
  await speedStateItem.setValue(parseSpeedState(state));
}
