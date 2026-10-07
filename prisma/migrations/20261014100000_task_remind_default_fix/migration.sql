-- 2026-10-06 の変更でタスク作成時のリマインド初期値が「なし」(-1=一切通知しない)になっており、
-- 以後に作られたタスクの通知が来なくなっていた。初期値のまま作られたものを「期日ちょうど」(NULL)へ戻す。
UPDATE "Task" SET "remindMinutes" = NULL
WHERE "remindMinutes" = -1 AND "createdAt" >= '2026-10-06T13:20:00Z';
