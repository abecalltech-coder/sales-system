# ステータス遷移設計

自動処理は表示名ではなく`StatusMaster.internalCode`で判定する。表示名/色/並び順は管理画面から変更可能。

## トス (category=TOSS)
```
TOSS_NEW -> TOSS_UNHANDLED -> TOSS_IN_PROGRESS -> TOSS_ABSENT -> TOSS_RECALL
                                      |
                                      +--> TOSS_PROSPECT --> TOSS_APPOINTMENT(*)
                                      +--> TOSS_CANCELLED
                                      +--> TOSS_EXCLUDED
                                      +--> TOSS_DUPLICATE
                                      +--> TOSS_CLOSED
```
(*) `TOSS_APPOINTMENT`遷移時 = セクション10の自動移行トリガー(アポ作成/カレンダー/Meet発行)。

## アポ (category=APPOINTMENT, meetingStatus)
```
APO_CONFIRMED -> APO_BEFORE_MEETING -> APO_IN_MEETING -> APO_MEETING_DONE
                                            |
                                            +--> APO_RESCHEDULE / APO_REVISIT
                                            +--> APO_CONTRACTED(*)  // 成約自動移行
                                            +--> APO_ON_HOLD
                                            +--> APO_CANCELLED / APO_NO_CONTACT / APO_LOST / APO_EXCLUDED
```

## 訪問 (category=VISIT)
```
VISIT_SCHEDULED -> VISIT_DEPARTED -> VISIT_IN_TRANSIT -> VISIT_ARRIVED
   -> MEETING_IN_PROGRESS -> MEETING_COMPLETED
VISIT_ABSENT / VISIT_DELAYED / VISIT_CANCELLED / REVISIT_REQUIRED / VISIT_COMPLETED
```
到着ボタン: 任意ステータス(未到着系) → `VISIT_ARRIVED`。
商談中ボタン: `VISIT_ARRIVED`以降 → `MEETING_IN_PROGRESS`(到着未登録なら同時登録を選択させる、セクション19)。
商談終了ボタン: `MEETING_IN_PROGRESS` → `MEETING_COMPLETED` + 商談結果入力必須。

## マッチング状況 (category=MATCHING, Contract.matchingStatusId)
```
NOT_HANDLED -> ERROR / FACTOR_COLLECTING / SMS_APPROVAL_PENDING / POST_CONFIRM_PENDING
   -> MATCHING_COMPLETED(*) -> SWITCHING_PENDING -> SWITCHING_COMPLETED(*)
CANCELLED (任意時点)
```
(*) `MATCHING_COMPLETED`遷移時、`matchingAt`が空なら現在日を自動入力(管理者は修正可)。
(*) `SWITCHING_COMPLETED`遷移時、`switchingAt`が空なら現在日を自動入力。

## エントリー (category=ENTRY)
```
NOT_ENTERED -> PREPARING -> DEFICIENCY_CHECKING -> ENTERED
                                  |
                                  +--> RETURNED -> RESUBMITTED -> APPROVED / REJECTED
ENTRY_CANCELLED(任意時点)
```

## 自動処理マトリクス(StatusAutomationRule.action)

| internalCode遷移 | アクション |
|---|---|
| -> TOSS_APPOINTMENT | CREATE_APPOINTMENT, CREATE_CALENDAR_EVENT, CREATE_MEET, NOTIFY_ASSIGNEE |
| -> APO_CONTRACTED | CREATE_CONTRACT, NOTIFY_ASSIGNEE, NOTIFY_ADMIN |
| Contract -> MATCHING_COMPLETED | SET_MATCHING_DATE_IF_EMPTY |
| Contract -> SWITCHING_COMPLETED | SET_SWITCHING_DATE_IF_EMPTY |
| Appointment日時変更 | UPDATE_CALENDAR_EVENT |
| Appointmentキャンセル系 | CANCEL_CALENDAR_EVENT |
