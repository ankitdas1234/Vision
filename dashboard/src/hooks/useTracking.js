import { useSocketEvent } from "./useSocket";
export function useTracking() { return useSocketEvent("person:tracking", { state: "IDLE" }); }
