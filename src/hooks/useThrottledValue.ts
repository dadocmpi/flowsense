// ============================================
// THROTTLED VALUE
// ============================================
// Keeps a fast-moving value from re-rendering more than a fixed number of times
// per second. The order-flow strength bar uses it so a burst of venue updates
// cannot make the bar flicker: the bar slides at most ~2 times a second, which
// is smooth, and always settles on the newest value.
//
// It is a leading-edge throttle with a trailing flush: the first change applies
// immediately, later changes within the window collapse to the last one.

import { useEffect, useRef, useState } from 'react';

export function useThrottledValue<T>(value: T, intervalMs = 500): T {
  const [throttled, setThrottled] = useState(value);
  const lastRunRef = useRef(0);
  const trailingRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestRef = useRef(value);
  latestRef.current = value;

  useEffect(() => {
    const now = Date.now();
    const elapsed = now - lastRunRef.current;

    if (elapsed >= intervalMs) {
      lastRunRef.current = now;
      setThrottled(value);
      return;
    }

    if (trailingRef.current) clearTimeout(trailingRef.current);
    trailingRef.current = setTimeout(() => {
      lastRunRef.current = Date.now();
      setThrottled(latestRef.current);
    }, intervalMs - elapsed);

    return () => {
      if (trailingRef.current) clearTimeout(trailingRef.current);
    };
  }, [value, intervalMs]);

  return throttled;
}
