import { useState, useEffect } from 'react';
import { useRefreshIntervalValue } from '@/lib/refresh-interval';

export function PollingCountdown() {
  const interval = useRefreshIntervalValue();
  const [remaining, setRemaining] = useState(interval / 1000);

  useEffect(() => {
    setRemaining(interval / 1000);
    const timer = window.setInterval(() => {
      setRemaining((prev) => {
        if (prev <= 1) return interval / 1000;
        return prev - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [interval]);

  return (
    <span className="text-[10px] text-muted-foreground tabular-nums">
      {remaining}s
    </span>
  );
}
