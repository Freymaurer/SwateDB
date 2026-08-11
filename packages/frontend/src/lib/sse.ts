import { useEffect, useRef } from 'react';
import type { JobSummary } from '../api';

interface UseJobEventsOptions {
  enabled: boolean;
  onJobUpdated: (job: JobSummary) => void;
}

export function useJobEvents({ enabled, onJobUpdated }: UseJobEventsOptions): void {
  const callbackRef = useRef(onJobUpdated);
  callbackRef.current = onJobUpdated;

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const source = new EventSource('/api/admin/jobs/events');

    source.addEventListener('job-updated', (event: MessageEvent) => {
      try {
        const job = JSON.parse(event.data) as JobSummary;
        callbackRef.current(job);
      } catch {
        console.warn('Failed to parse job-updated event data:', event.data);
      }
    });

    source.onerror = () => {
      // EventSource auto-reconnects — nothing to do.
    };

    return () => {
      source.close();
    };
  }, [enabled]);
}
