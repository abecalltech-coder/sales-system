import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api } from './api';
import { loadQueue, removeFromQueue } from './offlineQueue';

export function useOfflineSync() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const sync = async () => {
      const queue = loadQueue();
      if (queue.length === 0) return;
      try {
        const res = await api.post<{ results: { idempotencyKey: string; status: string }[] }>('/offline-actions/sync', {
          actions: queue,
        });
        const succeeded = res.results.filter((r) => r.status === 'SYNCED' || r.status === 'SKIPPED').map((r) => r.idempotencyKey);
        if (succeeded.length > 0) {
          removeFromQueue(succeeded);
          queryClient.invalidateQueries({ queryKey: ['mobile'] });
          queryClient.invalidateQueries({ queryKey: ['visits'] });
        }
      } catch {
        // まだオフライン、または再送も失敗。次回接続時に再試行する。
      }
    };

    sync();
    window.addEventListener('online', sync);
    return () => window.removeEventListener('online', sync);
  }, [queryClient]);
}
