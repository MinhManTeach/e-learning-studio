import { useSyncExternalStore } from "react";
import { speakingNow, subscribeSpeech } from "./speech";

/** Whether the reading with this id is playing now. */
export function useSpeaking(id: string) {
  return useSyncExternalStore(
    subscribeSpeech,
    () => speakingNow() === id,
    () => false,
  );
}
