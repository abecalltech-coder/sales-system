import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';

export type ColumnWidths = Record<string, number>;

interface PreferenceResponse {
  key: string;
  value: ColumnWidths | null;
}

/**
 * 一覧テーブルの列幅をログインユーザー本人の設定として読み書きする。
 * 保存先はサーバー(UserPreference)なので端末をまたいでも復元され、
 * かつ他アカウントには影響しない。
 *
 * @param tableKey 画面ごとの識別子(例: "toss-cases")
 */
export function useTablePreference(tableKey: string) {
  const queryClient = useQueryClient();
  const prefKey = `tableWidths:${tableKey}`;
  const queryKey = ['preference', prefKey];

  const query = useQuery({
    queryKey,
    queryFn: () => api.get<PreferenceResponse>(`/me/preferences/${prefKey}`),
    staleTime: 5 * 60_000,
    enabled: Boolean(tableKey),
  });

  const mutation = useMutation({
    mutationFn: (widths: ColumnWidths) => api.put<PreferenceResponse>(`/me/preferences/${prefKey}`, { value: widths }),
    onMutate: async (widths) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<PreferenceResponse>(queryKey);
      queryClient.setQueryData<PreferenceResponse>(queryKey, { key: prefKey, value: widths });
      return { previous };
    },
    onError: (_err, _widths, context) => {
      if (context?.previous) queryClient.setQueryData(queryKey, context.previous);
    },
  });

  return {
    widths: query.data?.value ?? {},
    /** 列幅マップ全体を保存する(呼び出し側でマージ済みのものを渡す) */
    saveWidths: mutation.mutate,
  };
}
