import { useSocketEvent } from "./useSocket";
export function useBrain() {
  const decision = useSocketEvent("brain:decision");
  const mentalState = useSocketEvent("mental:state");
  return { decision, mentalState };
}
