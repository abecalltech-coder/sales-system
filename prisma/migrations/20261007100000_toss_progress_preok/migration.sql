-- トス実績の進捗から「アポイント」を外し、「前確OK」に一本化する(要望)。
-- 前確OK が無ければ追加する
INSERT INTO "StatusMaster" ("id", "category", "internalCode", "displayName", "order", "active", "color")
SELECT gen_random_uuid(), 'TOSS_PROGRESS', 'PROGRESS_PRE_CONFIRM_OK', '前確OK', 10, true, '#16a34a'
WHERE NOT EXISTS (
  SELECT 1 FROM "StatusMaster"
  WHERE "category" = 'TOSS_PROGRESS' AND ("internalCode" = 'PROGRESS_PRE_CONFIRM_OK' OR btrim("displayName") = '前確OK')
);
UPDATE "StatusMaster" SET "active" = true
WHERE "category" = 'TOSS_PROGRESS' AND ("internalCode" = 'PROGRESS_PRE_CONFIRM_OK' OR btrim("displayName") = '前確OK');

-- 進捗が「アポイント」のトスは「前確OK」へ置き換える(アポ詳細は作成済みなので自動作成は走らない)
UPDATE "TossCase" t
SET "progressStatusId" = (
  SELECT id FROM "StatusMaster"
  WHERE "category" = 'TOSS_PROGRESS' AND ("internalCode" = 'PROGRESS_PRE_CONFIRM_OK' OR btrim("displayName") = '前確OK')
  ORDER BY ("internalCode" = 'PROGRESS_PRE_CONFIRM_OK') DESC
  LIMIT 1
)
WHERE t."progressStatusId" IN (
  SELECT id FROM "StatusMaster"
  WHERE "category" = 'TOSS_PROGRESS' AND ("internalCode" = 'PROGRESS_APPOINTMENT' OR btrim("displayName") = 'アポイント')
);

-- 「アポイント」は選択肢から外す(行の参照が残っていても壊れないよう削除ではなく非表示)
UPDATE "StatusMaster" SET "active" = false
WHERE "category" = 'TOSS_PROGRESS' AND ("internalCode" = 'PROGRESS_APPOINTMENT' OR btrim("displayName") = 'アポイント');
