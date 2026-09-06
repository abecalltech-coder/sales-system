# 画面一覧

## PC版(権限に応じ表示/非表示)

1. トス登録(アポインター用フォーム) `/toss/new`
2. トス実績管理 一覧/詳細 `/toss-cases`
3. アポ実績管理 一覧/詳細 `/appointments`
4. CLカレンダー `/cl-calendar`
5. エントリー管理 一覧/詳細 `/contracts`
6. サマリー `/summary` — 3タブ: 実績(部署別×月の31列実績管理表、実績列は自動集計) / シフト(月別の日別稼働時間表) / フリーシート(従来の自由編集表)
6b. 最終報告 `/final-report` — 全ユーザーが日々の数値を入力(列=日付+曜日、行=管理者設定の項目、1行目=アカウント名)。19:00にシフト上の出勤日で未入力なら責任者・管理者へ通知。
7. ユーザー管理 `/admin/users`
8. 組織管理(部署/チーム) `/admin/organizations`
9. マスタ管理(ステータス/商材/流入元) `/admin/masters`
10. トスフォーム設定 `/admin/toss-form`
10b. 最終報告 項目設定 `/admin/final-report-fields`
11. カスタム項目管理 `/admin/custom-fields`
12. 連携設定(Googleカレンダー・Meet) `/admin/integrations`
13. 操作ログ `/admin/audit-logs`
14. システム設定 `/admin/system-settings`
15. ログイン `/login`

※ 「営業」グループ以外(管理グループ)は ADMIN/SUPER_ADMIN のみ表示。
   ログイン後・ルート `/` は `/toss-cases` へ遷移する。

## 月単位運用
トス実績/アポ実績/エントリー管理/サマリーは「対象月(periodMonth)」単位。各画面ヘッダーの月セレクタ(`‹ 2026年9月 ›`、
既定=当月、`?month=`とlocalStorageで全画面共有)で月を切り替える。過去月はロックせず編集可。
一覧の「前月の未完了も表示」で前月からの繰越を合流表示、右クリック「当月へ移動」で対象月を書き換える。

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
