# API一覧

Base: `/api`。認証はHttpOnly CookieのAccess Token(JWT)。Swagger UIを`/api/docs`で提供。
一覧系は必ずクエリパラメータ`page,pageSize,sort,filter[...]`を要求し、全件取得エンドポイントは提供しない。

## 認証
| Method | Path | 備考 |
|---|---|---|
| POST | /auth/login | Rate limit対象, ログイン失敗記録 |
| POST | /auth/logout | Refresh Token失効 |
| POST | /auth/refresh | Refresh Tokenローテーション |
| GET | /auth/me | ログインユーザー情報+権限一覧 |
| POST | /auth/change-password | 初回ログイン時強制含む |

## トス `/toss-cases`
GET(一覧,検索/フィルター/ページング) / POST(作成) / GET :id / PATCH :id(version必須,楽観ロック) /
DELETE :id(論理削除) / POST bulk-update / POST import(CSVストリーミング) / GET export

## アポ `/appointments`
GET / POST / GET :id / PATCH :id / POST :id/retry-calendar(カレンダー連携再実行)

## 訪問・モバイル
GET /mobile/home, /mobile/today-visits, /mobile/upcoming-visits,
GET /visits/:id, POST /visits/:id/depart|arrive|start-meeting|end-meeting|report-delay|reschedule,
GET /visits/:id/history, POST /offline-actions/sync(冪等性キーで重複無視)

## 成約 `/contracts`, エントリー `/entries`
GET / POST / GET :id / PATCH :id (成約はmatchingStatus変更時の自動日付処理をサーバー側で実施)

## サマリー `/summary`
GET kpi / by-department / by-team / by-user / timeseries / funnel / visits
(すべてクエリで期間・部署・チーム・担当者・商材・流入元を指定可能)

## Google連携
POST /integrations/google-forms/webhook (署名検証必須、認証はSecretベース)
GET /integrations/google-calendar/auth-url, GET .../callback,
POST .../test, POST .../disconnect

## 共通仕様
- すべて Zod DTO 検証、失敗時 400 + フィールド単位エラー
- 更新系は `If-Match: version` 相当を body の `version` で受け、不一致は 409 Conflict + 最新データ返却
- 監査ログは Interceptor で自動記録(actor, action, target, before/after, success)
- Rate Limit: 認証系は厳しめ(例: 5回/分)、通常APIは緩め(例: 120回/分/ユーザー)
