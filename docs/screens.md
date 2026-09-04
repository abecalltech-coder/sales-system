# 画面一覧

## PC版(権限に応じ表示/非表示)

1. トス登録(アポインター用フォーム) `/toss/new`
2. トス実績管理 一覧/詳細 `/toss-cases`
3. アポ実績管理 一覧/詳細 `/appointments`
4. CLカレンダー `/cl-calendar`
5. エントリー管理 一覧/詳細 `/contracts`
6. サマリー(自由編集表) `/summary`
7. ユーザー管理 `/admin/users`
8. 組織管理(部署/チーム) `/admin/organizations`
9. マスタ管理(ステータス/商材/流入元) `/admin/masters`
10. トスフォーム設定 `/admin/toss-form`
11. カスタム項目管理 `/admin/custom-fields`
12. 連携設定(Googleカレンダー・Meet) `/admin/integrations`
13. 操作ログ `/admin/audit-logs`
14. システム設定 `/admin/system-settings`
15. ログイン `/login`

※ 「営業」グループ以外(管理グループ)は ADMIN/SUPER_ADMIN のみ表示。
   ログイン後・ルート `/` は `/toss-cases` へ遷移する。

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
