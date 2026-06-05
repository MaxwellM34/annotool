import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api";

const HEARTBEAT_MS = 10_000;
const IDLE_THRESHOLD_MS = 30_000;
const ACTIVITY_EVENTS = [
  "mousemove",
  "mousedown",
  "click",
  "keydown",
  "scroll",
  "touchstart",
  "wheel",
] as const;

/**
 * Hook that drives client-side time tracking.
 *
 * Behavior:
 *  - When `enabled` is true, listens for activity events. Updates `lastActiveAt` ref on each.
 *  - Every HEARTBEAT_MS, if the user has been active within IDLE_THRESHOLD_MS, POSTs a heartbeat
 *    to the backend (with the bound image_id, if any).
 *  - If the user goes idle past IDLE_THRESHOLD_MS, heartbeats stop. They resume immediately
 *    on the next activity event.
 *
 * The backend authoritatively decides whether a heartbeat continues the open interval or starts
 * a new one based on the gap from the previous heartbeat (>30s ⇒ discard old interval, open new).
 */
export function useTimeTracker(imageId: number | null, enabled: boolean) {
  const lastActiveAt = useRef<number>(Date.now());
  const [activeNow, setActiveNow] = useState(true);

  useEffect(() => {
    if (!enabled) return;
    const onActivity = () => {
      lastActiveAt.current = Date.now();
      if (!activeNow) setActiveNow(true);
    };
    ACTIVITY_EVENTS.forEach((ev) => window.addEventListener(ev, onActivity, { passive: true }));
    return () => {
      ACTIVITY_EVENTS.forEach((ev) => window.removeEventListener(ev, onActivity));
    };
  }, [enabled, activeNow]);

  useEffect(() => {
    if (!enabled) return;
    const tick = async () => {
      const now = Date.now();
      const idleMs = now - lastActiveAt.current;
      if (idleMs > IDLE_THRESHOLD_MS) {
        setActiveNow(false);
        return;
      }
      setActiveNow(true);
      try {
        await api.heartbeat(imageId ?? null);
      } catch {
        // ignore — next tick retries
      }
    };
    // fire one heartbeat immediately so the interval opens on page entry
    void tick();
    const id = window.setInterval(tick, HEARTBEAT_MS);
    return () => window.clearInterval(id);
  }, [enabled, imageId]);

  return { activeNow };
}
