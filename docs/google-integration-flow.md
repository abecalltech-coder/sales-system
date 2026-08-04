# Google連携フロー設計

Googleフォーム・カレンダーが実際に用意されていない状態でも開発・起動できることを前提とする。
`GoogleFormIntegration.active=false` や `GoogleCalendarIntegration`未設定でもシステム全体は動作し、
連携部分だけが「未設定」として管理画面に表示される。

## A. Googleフォーム受信フロー

```
Googleフォーム回答 --(Apps Script onFormSubmit)--> HMAC署名付きJSON POST
  --> POST /integrations/google-forms/webhook
      1. Secret/HMAC/タイムスタンプ検証
      2. 受信原文をGoogleFormWebhookLogへ保存(必ず先に保存)
      3. 回答ID(responseId)で冪等性チェック(重複は200 OKで無視)
      4. integrationId特定 -> mappings取得
      5. フィールドマッピングに従いTossCase用データへ変換
         (未マッピング項目があっても処理継続、rawPayloadは保持)
      6. 重複判定ルール(REJECT/CREATE_NEW/APPEND_EXISTING/ADMIN_REVIEW)適用
      7. TossCase作成 (初期部署/チーム/担当者/ステータスを適用)
      8. WebhookLog.status = PROCESSED (失敗時はERROR/UNMAPPED_PARTIALでも200返却しGoogle側リトライを防ぐ)
      9. Socket.IOでリアルタイム通知
```
再処理: 管理画面からWebhookLog単位で「再実行」ボタン→ステップ4以降を再実行可能。

## B. トス→アポ自動移行(セクション10実装)

```
TossCase.statusId更新 -> internalCode = TOSS_APPOINTMENT を検知(DBトランザクション内)
  1. Appointment存在チェック(tossCaseId UNIQUE制約)
  2. 存在しなければ idempotencyKey(=tossCaseId固定)でAppointment作成
  3. 必須項目(顧客情報/商談形式/日時)不足 -> エラー返却、ステータス変更自体はロールバックしない設計にはせず、
     「ステータス変更 + アポ作成失敗」を明確に分離: ステータス変更はコミットし、
     Appointmentは PENDING_INFO 状態で作成 -> UIで不足項目を明示し入力を促す
  4. Google連携ジョブ(Worker)をQueueへ投入(同期処理でAPIを待たせない)
  5. Worker: カレンダー予定作成 -> Meet URL発行 -> Event ID/URL保存 -> calendarSyncStatus=SYNCED
     失敗時: calendarSyncStatus=ERROR + CalendarSyncLog保存、Appointment自体は保持
  6. Socket.IOで関係者へ通知
```

## C. Googleカレンダー/Meet API呼び出し

- OAuth2.0(会社Google Workspaceアカウント) `googleapis` パッケージ使用
- Token(access/refresh)は`GoogleCalendarIntegration`に暗号化(AES-256-GCM, `GOOGLE_TOKEN_ENCRYPTION_KEY`)して保存
- 予定作成: `calendar.events.insert({conferenceDataVersion:1, requestBody:{..., conferenceData:{createRequest:{...}}}})`
- タイトル/説明はテンプレート文字列を`{法人名}`等のプレースホルダー置換で生成
- 予定更新/キャンセル: `events.update` / `events.delete`、失敗時はリトライキュー(指数バックオフ、最大5回)

## D. Apps Script(完成版はPhase5で `docs/google-forms-integration.md` に別途コード添付)

Apps Script側の要件(onFormSubmit, Webhook URL/Secret設定, HMAC署名, 手動テスト関数, トリガー作成手順)は
実際のフォーム項目確定後にコードを確定させる。雛形自体はPhase5で先に用意し、項目名だけ後から調整できる構造にする。
