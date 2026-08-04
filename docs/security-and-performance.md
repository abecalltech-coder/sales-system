# セキュリティ方針

- Cookie: HttpOnly + Secure + SameSite=Lax(クロスサイトPOSTが必要な箇所は個別にCSRFトークン付与)
- CSRF: Cookie認証APIに対しdouble-submit tokenを要求
- 入力検証: 全DTOをZodスキーマで検証(`packages/validation`をフロント/バック共有)
- Helmet + CORS許可オリジンをFRONTEND_URLのみに制限
- Rate Limit: `@nestjs/throttler`、ログインは失敗5回で15分ロック(段階的バックオフ)
- パスワードポリシー: 8文字以上、大小英数記号のうち3種以上、bcrypt(cost12)でハッシュ
- Refresh Tokenはハッシュ化してDB保存、使用のたびローテーション、旧トークン再利用検知でユーザー全セッション失効
- Webhook: HMAC-SHA256署名 + タイムスタンプ許容誤差5分 + responseIdでの冪等性
- OAuthトークン: AES-256-GCMで暗号化しDB保存、鍵は`GOOGLE_TOKEN_ENCRYPTION_KEY`(Railway Variables)
- 位置情報: 到着/商談開始/商談終了の操作時のみ取得、常時追跡は行わない。閲覧権限と保存期間(初期365日、設定可)を`SystemSetting`で管理
- 権限チェックはAPI側で必須(フロントの非表示はUXのみ)、リソース単位でscope(OWN/TEAM/DEPT/ALL)を評価
- エラーレスポンスはスタックトレース等の内部情報を含めない(本番環境)

# 性能・拡張性設計

## 初期実装で必須にするもの
- 全一覧APIはサーバーサイドpage/sort/filter、全件SELECT禁止
- Prismaクエリは`select`で必要列のみ取得、リレーションのN+1は`include`最適化 or DataLoader的バッチ化
- 複合インデックス(database-design.md参照)、`EXPLAIN ANALYZE`で定期確認
- CSV入出力はストリーミング(`csv-stringify`/`csv-parse`のstream API)、大量データをメモリに載せない

## 段階的拡張ポイント(設計だけ用意し、初期実装は必須にしない)
- 日別/月別集計テーブル + Materialized View (サマリー高速化、`scripts/rebuild-aggregates.ts`で再構築)
- Redisキャッシュ(サマリー集計結果、TTL数分)
- PostgreSQLパーティショニング(TossCase等、receivedAt月次パーティション)
- Worker/APIの水平分割、Socket.IO Redis Adapterでのスケールアウト

## 負荷試験計画

k6シナリオ(`tests/load/`)で以下を用意:
10人/30人同時ログイン、10人同時検索、15人同時案件更新、Googleフォーム連続POST、
Socket.IO同時接続、サマリー同時閲覧、CSV出力中の通常操作、同一案件同時更新(競合発生確認)、
モバイル到着操作同時実行。結果は`docs/performance-test.md`(Phase9で実測値を記録)。

10万件テストデータは`scripts/generate-test-data.ts`(faker.js的な生成、部署/チーム/商材はマスタから参照)で投入する。
