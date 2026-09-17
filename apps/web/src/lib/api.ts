export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

// 複数のリクエストが同時に401を受けても/auth/refreshは1回だけ呼ぶ(要望対応の根本原因)。
// refresh_tokenはローテーション式(使うたびに失効→再発行)のため、同時に2回呼ぶと2回目は
// 「失効済みトークンの再利用」とみなされ、不正利用対策でセッション全体が失効してしまい
// (案件管理で担当者を選ぶと出ていた「Unauthorized」の原因)、以後ログインし直すまで
// 何をしても401になっていた。in-flightのPromiseを共有して呼び出しを1回にまとめる。
let refreshPromise: Promise<boolean> | null = null;
function refreshAccessToken(): Promise<boolean> {
  if (!refreshPromise) {
    refreshPromise = fetch('/api/auth/refresh', { method: 'POST', credentials: 'include' })
      .then((r) => r.ok)
      .catch(() => false)
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...options,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...options.headers },
  });

  if (res.status === 401) {
    // Access Token期限切れの可能性 -> リフレッシュを1回試みてから元のリクエストをリトライ
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      const retry = await fetch(`/api${path}`, {
        ...options,
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', ...options.headers },
      });
      if (!retry.ok) {
        const body = await retry.json().catch(() => ({ message: retry.statusText }));
        throw new ApiError(retry.status, body.message ?? retry.statusText);
      }
      return retry.json();
    }
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({ message: res.statusText }));
    throw new ApiError(res.status, body.message ?? res.statusText);
  }
  return res.json();
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PATCH', body: body ? JSON.stringify(body) : undefined }),
  put: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PUT', body: body ? JSON.stringify(body) : undefined }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};
