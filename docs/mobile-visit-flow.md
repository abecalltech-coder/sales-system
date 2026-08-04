# 訪問営業(モバイル)フロー設計

## 到着ボタン `POST /visits/:id/arrive`

```
1. 確認ダイアログ
2. navigator.geolocation.getCurrentPosition (タイムアウト10秒、明示的許可)
3. 取得成功 -> {lat,lng,accuracy} 付きでPOST
   取得失敗/拒否 -> locationPermissionStatus="DENIED"/"FAILED" で位置情報なしPOST可
4. サーバー側:
   - 訪問先座標(Customer/Visit.address由来のジオコーディング結果、事前計算 or 到着時計算)との距離を計算
   - 距離 > SystemSetting.arrivalWarningDistanceMeters(初期500m) の場合、警告フラグをレスポンスに含める
     (登録自体は許可。理由入力欄を必須にする設定は管理画面で切替可能)
   - VisitStatusHistory追記, Visit.status=VISIT_ARRIVED, arrivedAt等保存
   - AuditLog記録
   - Socket.IOで visit:{id} / team:{teamId} ルームへ配信
5. 到着日時の事後修正は ADMIN 以上のみ可能、修正時は理由必須+CaseHistoryに記録
```

## 商談開始ボタン(=商談中ボタン) `POST /visits/:id/start-meeting`

未到着状態で押された場合、フロントで選択モーダルを表示:
- 「到着」と「商談開始」を同時登録(サーバーは1トランザクションでarrive+start両方処理)
- 先に到着のみ登録

保存: meetingStartedAt, waitingMinutes(=meetingStartedAt - arrivedAt), Visit.status=MEETING_IN_PROGRESS,
Appointment.meetingStatus=APO_IN_MEETING(同期更新)。

## 商談終了ボタン `POST /visits/:id/end-meeting`

結果入力フォーム必須項目は管理画面で設定可能(初期: meetingResult必須)。
`meetingResult`が内部コード的に「成約」に相当する場合、Contract自動作成(セクション25/26と同じ冪等性方針、
`appointmentId` UNIQUE制約で二重作成防止)。「再商談/再訪問」選択時は次回日時入力必須。「失注」時は理由必須。

## オフライン対応

到着/商談開始/商談終了/結果入力/メモの各操作は、送信前にクライアント側の`OfflineQueue`(IndexedDB)へ
`{idempotencyKey(uuid), actionType, targetId, payload, capturedAt}`として保存してからAPI呼び出しを試みる。
成功したらキューから削除。通信断/失敗時はキューに残し、オンライン復帰時に`POST /offline-actions/sync`へ
バッチ送信。サーバーは`idempotencyKey`のUNIQUE制約で重複実行を防止する。

## 地図・電話

`tel:{phone}` リンクで発信、`https://www.google.com/maps/search/?api=1&query={address}` でMap起動
(Apple Maps判定はUAで`maps://`スキームに切替)。初期実装は外部アプリ遷移のみ。
