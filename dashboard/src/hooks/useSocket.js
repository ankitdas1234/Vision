import { useEffect, useState } from "react";
import { socket } from "../socket/socket";

export function useSocketEvent(eventName, initialValue = null) {
  const [data, setData] = useState(initialValue);
  useEffect(() => {
    const handler = (payload) => setData(payload);
    socket.on(eventName, handler);
    return () => socket.off(eventName, handler);
  }, [eventName]);
  return data;
}
