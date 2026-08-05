export interface QueuedAction {
  idempotencyKey: string;
  actionType: 'ARRIVE' | 'START_MEETING' | 'END_MEETING';
  targetEntityId: string;
  payload: Record<string, unknown>;
  capturedAt: string;
}

const STORAGE_KEY = 'sales-system:offline-queue';

export function enqueueAction(action: QueuedAction) {
  const queue = loadQueue();
  queue.push(action);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
}

export function loadQueue(): QueuedAction[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as QueuedAction[]) : [];
  } catch {
    return [];
  }
}

export function clearQueue() {
  localStorage.removeItem(STORAGE_KEY);
}

export function removeFromQueue(idempotencyKeys: string[]) {
  const remaining = loadQueue().filter((a) => !idempotencyKeys.includes(a.idempotencyKey));
  localStorage.setItem(STORAGE_KEY, JSON.stringify(remaining));
}
