-- タスクのリマインド「通知しない」を廃止(要望: 通知しないとタスクの意味がない)。
-- 「通知しない」だったタスクは「なし」(期日の時刻に通知)にする。
-- updatedAt は変えない(過ぎた期日の分まで一斉に通知されないよう、通知処理が updatedAt で判定するため)
UPDATE "Task" SET "remindMinutes" = NULL WHERE "remindMinutes" = -1;
