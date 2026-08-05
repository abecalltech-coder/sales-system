import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useComments } from '../hooks/useApi';
import { api, ApiError } from '../lib/api';

interface CommentsPanelProps {
  entityType: 'TOSS_CASE' | 'APPOINTMENT' | 'VISIT' | 'CONTRACT' | 'ENTRY' | 'CUSTOMER';
  entityId: string;
}

export function CommentsPanel({ entityType, entityId }: CommentsPanelProps) {
  const { data: comments, isLoading } = useComments(entityType, entityId);
  const queryClient = useQueryClient();
  const [body, setBody] = useState('');
  const [error, setError] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: () => api.post('/comments', { entityType, entityId, body }),
    onSuccess: () => {
      setError(null);
      setBody('');
      queryClient.invalidateQueries({ queryKey: ['comments', entityType, entityId] });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'コメントの投稿に失敗しました'),
  });

  return (
    <div style={{ marginTop: 24, borderTop: '1px solid #e5e7eb', paddingTop: 16 }}>
      <h2 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>コメント</h2>

      {isLoading && <p style={{ fontSize: 13, color: '#9ca3af' }}>読み込み中...</p>}
      {!isLoading && comments?.length === 0 && <p style={{ fontSize: 13, color: '#9ca3af' }}>まだコメントはありません</p>}

      <div style={{ marginBottom: 12 }}>
        {comments?.map((c) => (
          <div key={c.id} style={{ padding: '8px 0', borderBottom: '1px solid #f3f4f6', fontSize: 13 }}>
            <div style={{ color: '#9ca3af', fontSize: 11, marginBottom: 2 }}>
              {new Date(c.createdAt).toLocaleString('ja-JP')}
            </div>
            <div style={{ whiteSpace: 'pre-wrap' }}>{c.body}</div>
          </div>
        ))}
      </div>

      {error && <p style={{ color: 'crimson', fontSize: 13 }}>{error}</p>}

      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="コメントを入力"
        style={{ display: 'block', width: '100%', minHeight: 60, padding: 8, fontSize: 13, marginBottom: 8 }}
      />
      <button onClick={() => createMutation.mutate()} disabled={!body.trim() || createMutation.isPending}>
        コメントを投稿
      </button>
    </div>
  );
}
