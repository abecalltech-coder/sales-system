# リアルタイム更新・同時編集対策

## Socket.IOルーム設計

接続時、JWTからuser/team/departmentを解決し以下へ自動join:
`company:{companyId}`, `department:{departmentId}`, `team:{teamId}`, `user:{userId}`
案件詳細画面を開いた時のみ動的join/leave: `toss:{id}` / `appointment:{id}` / `visit:{id}` / `contract:{id}`

配信ペイロードは差分のみ:
```json
{ "event": "case.updated", "entityType": "TOSS_CASE", "id": "...", "version": 5, "updatedAt": "...", "updatedBy": "...", "changedFields": ["statusId","memo"] }
```
受信クライアントはTanStack Queryの該当キーを`invalidateQueries`または部分更新する(全量再取得ではなく
差分と現在キャッシュのマージを優先し、詳細画面のみ必要ならAPI再取得)。

Redis Adapter(`@socket.io/redis-adapter`)で複数APIインスタンス間のブロードキャストを同期する(Phase7でRedis追加)。
WebSocket切断中もREST操作は継続でき、再接続時に「最終更新時刻以降の差分を再取得」する簡易リカバリを行う。

## 楽観的ロック

全主要エンティティに`version`。PATCH時にクライアントは編集開始時点の`version`を送信。
サーバーは`WHERE id=? AND version=?`のUPDATEで0件なら409 Conflictを返し、最新データを同梱する。
フロントは競合モーダルで「自分の変更」「最新データ」「差分項目」を表示し、再読込 or 自分の変更を再適用(変更していない項目は最新値を採用、変更した項目のみ選択的に再送)。

## プレゼンス表示

案件詳細を開いているユーザーをRedisの`presence:{entityType}:{id}` Setで管理(TTL付きハートビート)。
「○○さんが閲覧中」はSocket.IOイベント`presence.updated`で配信。
