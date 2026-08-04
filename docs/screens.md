# 画面一覧

## PC版(権限に応じ表示/非表示)

1. ダッシュボード `/dashboard`
2. トス実績管理 一覧/詳細 `/toss` `/toss/:id`
3. アポ実績管理 一覧/詳細 `/appointments` `/appointments/:id`
4. 訪問管理 一覧/詳細 `/visits` `/visits/:id`
5. 成約管理 一覧/詳細 `/contracts` `/contracts/:id`
6. エントリー管理 一覧/詳細 `/entries` `/entries/:id`
7. サマリー `/summary`
8. カレンダー `/calendar`
9. 顧客管理 一覧/詳細 `/customers` `/customers/:id`
10. ユーザー管理 `/admin/users`
11. 組織管理(部署/チーム) `/admin/organization`
12. マスタ管理(ステータス/商材/流入元) `/admin/masters`
13. カスタム項目管理 `/admin/custom-fields`
14. 連携設定(Googleフォーム/カレンダー) `/admin/integrations`
15. 操作ログ `/admin/audit-logs`
16. システム設定 `/admin/settings`
17. ログイン `/login`

## モバイル版(訪問営業)

1. モバイルホーム(本日の訪問一覧) `/m`
2. 訪問詳細(電話/地図/到着/商談開始/終了ボタン) `/m/visits/:id`
3. 商談結果入力 `/m/visits/:id/result`
4. 未送信データ(オフラインキュー)確認 `/m/sync-status`
5. プロフィール/表示モード切替 `/m/profile`

## 共通コンポーネント方針

一覧画面は `DataTable`(検索/フィルター/列カスタム/ページネーション/一括操作/CSV)を共通化し、
`toss/appointments/visits/contracts/entries/customers` すべてが同一基盤を使う
(セクション31の共通機能を1回実装して使い回す)。
