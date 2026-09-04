# CH partners実績管理

CH partners 向け、トス→アポ→訪問→成約→エントリーを一元管理するシステム。詳細設計は `docs/` 配下。

- [architecture.md](docs/architecture.md) — 全体構成/Railwayサービス/技術スタック
- [repo-structure.md](docs/repo-structure.md) — ディレクトリ構成
- [database-design.md](docs/database-design.md) — ER図・Prismaモデル
- [status-flow.md](docs/status-flow.md) — ステータス遷移・自動処理
- [permission-matrix.md](docs/permission-matrix.md) — 権限マトリクス
- [screens.md](docs/screens.md) — PC/モバイル画面一覧
- [api.md](docs/api.md) — API一覧
- [google-integration-flow.md](docs/google-integration-flow.md) — Googleフォーム/カレンダー/Meet連携
- [mobile-visit-flow.md](docs/mobile-visit-flow.md) — 訪問到着/商談開始/終了・オフライン
- [realtime-and-concurrency.md](docs/realtime-and-concurrency.md) — Socket.IO・楽観的ロック
- [security-and-performance.md](docs/security-and-performance.md) — セキュリティ・性能設計

## 実装Phase(要件セクション49準拠)

- [x] **Phase 1: 設計** — 本ドキュメント一式(完了)
- [ ] **Phase 2: 基盤** — monorepo, Docker, Postgres, Prisma初期スキーマ, 認証(JWT), 権限, ユーザー/組織管理
- [ ] **Phase 3: 案件管理** — 顧客/トス/アポ/訪問/成約/エントリー CRUD, コメント/履歴, 一覧検索, CSV
- [ ] **Phase 4: 設定機能** — ステータスマスタ, カスタム項目, 自動処理ルール, フォームマッピングUI, カレンダー設定UI
- [ ] **Phase 5: 外部連携** — GoogleフォームWebhook, Googleカレンダー/Meet, 自動移行処理, 再試行, Apps Script
- [ ] **Phase 6: モバイル** — 表示切替, PWA, 本日の訪問, 到着/商談開始/終了ボタン, GPS, オフライン再送
- [ ] **Phase 7: リアルタイム** — Socket.IO, ルーム, 同時編集, プレゼンス, Redis Adapter
- [ ] **Phase 8: サマリー** — KPI, 部署/チーム/個人別, 訪問営業実績, グラフ, CSV
- [ ] **Phase 9: 品質・公開** — テスト, 負荷試験, セキュリティ確認, GitHub Actions, Railwayデプロイ, ドキュメント最終化

各Phase完了時: lint / typecheck / test / build / 動作確認 / commit を必須とする。

## 完了までにユーザー側で必要な作業(私では代行不可)

1. GitHubリポジトリ作成(空リポジトリでOK、Phase2完了時にpushします)
2. Railwayプロジェクト作成 + PostgreSQL/Redisプラグイン追加(Phase2完了後にご案内します)
3. Google Cloud ConsoleでOAuthクライアント作成(Calendar API有効化、リダイレクトURI設定) — Phase5の前にご案内します
4. 実際のGoogleフォーム作成(項目未確定のままでもシステムは動くため、Phase5以降いつでも可)

## 次のステップ

このままPhase 2(モノレポ基盤・Docker・Prisma初期スキーマ・認証・権限・ユーザー/組織管理)に着手します。
