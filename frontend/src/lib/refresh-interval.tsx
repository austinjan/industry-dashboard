import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';

const DEFAULT_INTERVAL = 30000; // 30s
const STORAGE_KEY = 'dashboard-refresh-interval';

interface RefreshIntervalContextType {
  interval: number;
  setInterval: (ms: number) => void;
}

const RefreshIntervalContext = createContext<RefreshIntervalContextType>({
  interval: DEFAULT_INTERVAL,
  setInterval: () => {},
});

function loadInterval(): number {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const val = parseInt(stored, 10);
      if (val >= 5000) return val; // minimum 5s
    }
  } catch {}
  return DEFAULT_INTERVAL;
}

export function RefreshIntervalProvider({ children }: { children: ReactNode }) {
  const [interval, setIntervalState] = useState(loadInterval);

  const setInterval = useCallback((ms: number) => {
    const val = Math.max(ms, 5000); // minimum 5s
    setIntervalState(val);
    localStorage.setItem(STORAGE_KEY, String(val));
  }, []);

  return (
    <RefreshIntervalContext.Provider value={{ interval, setInterval }}>
      {children}
    </RefreshIntervalContext.Provider>
  );
}

export function useRefreshInterval() {
  return useContext(RefreshIntervalContext);
}

/** Read interval outside of React (fallback for non-component usage) */
export function getRefreshInterval(): number {
  return loadInterval();
}

/**
 * Hook that returns the current interval as a reactive value.
 * Use this in query hooks so refetchInterval updates immediately.
 */
export function useRefreshIntervalValue(): number {
  const { interval } = useContext(RefreshIntervalContext);
  return interval;
}
