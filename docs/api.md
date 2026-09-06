# API一覧

Base: `/api`。認証はHttpOnly CookieのAccess Token(JWT)。Swagger UIを`/api/docs`で提供。
一覧系は必ずクエリパラメータ`page,pageSize,sort,filter[...]`を要求し、全件取得エンドポイントは提供しない。

## 対象月(月単位運用)
- トス/アポ/エントリーは `periodMonth`("YYYY-MM"、JST暦月)を持つ。作成時に主要日付から確定し、以後は period-move でのみ変更。
- 一覧の共通クエリに `periodMonth`(その月のみ) / `includePrevMonth=true`(前月の未完了を合流)を追加。
- `POST /toss-cases|/appointments|/contracts/period-move` body `{ ids:[], periodMonth }` — 選択レコードの対象月を移動(監査ログ記録、`*.period_move`)。

## 認証
| Method | Path | 備考 |
|---|---|---|
| POST | /auth/login | Rate limit対象, ログイン失敗記録 |
| POST | /auth/logout | Refresh Token失効 |
| POST | /auth/refresh | Refresh Tokenローテーション |
| GET | /auth/me | ログインユーザー情報+権限一覧 |

アカウント作成・パスワード変更は管理者のみ(`/users`配下)が行う。自己登録・本人によるパスワード変更エンドポイントは提供しない。

## トス `/toss-cases`
GET(一覧,検索/フィルター/ページング) / POST(作成) / GET :id / PATCH :id(version必須,楽観ロック) /
DELETE :id(論理削除) / POST bulk-delete(body {ids:[]}で複数を論理削除) /
POST bulk-update / POST reorder(body {ids:[]}で手動並び順=manualOrderを更新) /
POST import(CSVストリーミング) / GET export

## アポ `/appointments`
GET / POST / GET :id / PATCH :id / POST :id/retry-calendar(カレンダー連携再実行) /
POST reorder(body {ids:[]}で手動並び順=manualOrderを更新) / POST bulk-delete(body {ids:[]})

## 訪問・モバイル
GET /mobile/home, /mobile/today-visits, /mobile/upcoming-visits,
GET /visits/:id, POST /visits/:id/depart|arrive|start-meeting|end-meeting|report-delay|reschedule,
GET /visits/:id/history, POST /offline-actions/sync(冪等性キーで重複無視)

## 成約 `/contracts`, エントリー `/entries`
GET / POST / GET :id / PATCH :id (成約はmatchingStatus変更時の自動日付処理をサーバー側で実施) /
POST reorder(body {ids:[]}で手動並び順=manualOrderを更新) / POST bulk-delete(body {ids:[]})

## サマリー `/summary`(画面)= 3タブ

### 実績表 `/monthly-summary`
GET `?period=YYYY-MM&departmentId=<DEPARTMENT_BRANCH id>` — 対象月×部署のシート(無ければ遅延生成・前月から行引き継ぎ)。各行に自動集計値 `auto` を同梱。
GET departments(部署選択肢) / POST rows(body {period,departmentId,userId?,role?}) / PATCH rows/:id(body {valuesPatch?,role?,userId?,order?}) /
POST rows/reorder(body {ids:[]}) / POST rows/bulk-delete(body {ids:[]})
- 31列。自動集計= トスアップ/アポ/商談実施数/成約拠点数/ET数/リスケ(`monthly-summary/aggregation.constants.ts`)。セルに数値=上書き、空=自動値へ復帰。比率・合計・DPH・残訪問はフロントで計算。予算・コール数・稼働時間・前確OK・直転送トス・前連失注は手入力。

### シフト表 `/monthly-shift`
GET `?period=YYYY-MM`(遅延生成・前月から属性引き継ぎ) / POST rows(body {period,userId?}) / PATCH rows/:id(body {attributesPatch?,daysPatch?,userId?,order?}) /
POST rows/reorder / POST rows/bulk-delete
- 日別セル= 稼働時間数。稼働人数(稼働>0の日数)・実稼働時間(日別合計)は自動。日数・曜日は対象月から動的生成。

### フリーシート(従来の自由編集表) `/summary-sheets`
GET(シート一覧) / POST(シート作成) / GET :id(セル一覧含む) / PATCH :id(名称変更) / DELETE :id(論理削除) /
PUT :id/cells(セル1件upsert) / POST,DELETE :id/rows(/:row) / POST,DELETE :id/columns(/:col)

### ロスター `/users/options`
GET — 認証ユーザーなら誰でも取得できる軽量な在籍者一覧(サマリー/シフトの行追加用)。

## 月次ロールオーバー
毎月1日 00:05(JST)cron で当月分のサマリー実績表(全 DEPARTMENT_BRANCH)・シフト表を未生成なら生成する(遅延生成の保険)。

## 最終報告 `/final-reports`
GET fields(有効項目、入力画面用) / GET entries?period=YYYY-MM(&userId= は責任者/管理者のみ) /
POST entries(body {date:"YYYY-MM-DD", valuesPatch:{<fieldId>:値}, userId?}) /
GET admin/fields / POST,PATCH,DELETE admin/fields(/:id)(master:view/edit)
- FinalReportField: label / fieldType(NUMBER|TEXT) / computed("callSf+callBlank"等、自動計算) / unit / order / active。code付きの初期13項目は削除=非表示。
- FinalReportEntry: userId×date、values(JSON、fieldId→値)。
- 毎日19:00(JST)cron: シフト表で当日の稼働時間>0(出勤日)かつ当日の最終報告が未入力(values空)のユーザーを検出 → 責任者(MANAGER)+管理者(ADMIN/SUPER_ADMIN)へまとめてWebPush(本人には送らない)。

## トス登録フォーム `/toss-form`
GET fields(?all=1で無効項目も。アポインターの登録画面用、選択肢を解決して返す) /
POST submit(body {answers}、トス案件を作成) /
POST fields / PATCH fields/:id / DELETE fields/:id (管理: 「トスフォーム設定」タブ)

- TossFormField: targetKey(保存先固定キー)・label・fieldType・required・active・order・optionsMode(NONE/STATIC/MASTER/USERS)
- 初期値は Googleフォーム「トスアップフォーマット」の15項目

## ユーザー個人設定 `/me/preferences`
GET :key / PUT :key(body `{ value }`) — ログインユーザー本人のUI設定を保存(userIdはJWTから)。
権限不要(認証のみ)。keyは `[A-Za-z0-9_:-]{1,64}`。
一覧の列幅は `tableWidths:<画面key>`(例 `tableWidths:toss-cases`)、valueは `{ "<列key>": <px> }`。

## Google連携

Googleフォーム連携(webhook)はバックエンドに残っているが、アプリ内「トス登録」フォームへ移行したため
連携設定ページからは非表示。`/integrations/google-forms/webhook` は当面残置。

### Googleカレンダー / Meet `/integrations/google-calendar`
GET status(connected/accountEmail/configured) / GET auth-url / GET callback(Public、?google=connected|errorでフロントへ戻す) /
POST disconnect / POST appointments/:id/create-meet(body {title}、Meet発行してAppointment.meetingUrl・googleCalendarEventIdへ保存)

- 単一接続(GoogleIntegration provider一意)。トークンはAES-256-GCMで暗号化保存
- env: GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_REDIRECT_URI / GOOGLE_TOKEN_ENCRYPTION_KEY
- 商談形式=HPZOOMのアポ詳細作成時、連携済みならMeetを自動発行(未連携ならスキップ)

## 共通仕様
- すべて Zod DTO 検証、失敗時 400 + フィールド単位エラー
- 更新系は `If-Match: version` 相当を body の `version` で受け、不一致は 409 Conflict + 最新データ返却
- 監査ログは Interceptor で自動記録(actor, action, target, before/after, success)
- Rate Limit: 認証系は厳しめ(例: 5回/分)、通常APIは緩め(例: 120回/分/ユーザー)
