-- アポ実績の進捗「新規」(要望: 新規が無い / 新規案件が反映されていない)
-- 1) PROG_NEW_VISIT(トス→アポ変換時の初期値)がマスタに無い環境では作成する(無いと変換自体が失敗する)
INSERT INTO "StatusMaster" ("id", "category", "internalCode", "displayName", "order", "active", "color")
VALUES (gen_random_uuid(), 'APPOINTMENT_PROGRESS', 'PROG_NEW_VISIT', '新規', 60, true, '#ffffff')
ON CONFLICT ("category", "internalCode") DO NOTHING;

-- 2) 表示名「新規訪問」を「新規」に揃え、有効にする
UPDATE "StatusMaster" SET "displayName" = '新規', "active" = true
WHERE "category" = 'APPOINTMENT_PROGRESS' AND "internalCode" = 'PROG_NEW_VISIT';

-- 3) 一括投入等で別途作られた「新規」の選択肢があれば PROG_NEW_VISIT に寄せて無効化(重複表示を防ぐ)
UPDATE "Appointment" a SET "progressStatusId" = n."id"
FROM "StatusMaster" dup, "StatusMaster" n
WHERE a."progressStatusId" = dup."id"
  AND dup."category" = 'APPOINTMENT_PROGRESS' AND dup."internalCode" <> 'PROG_NEW_VISIT' AND btrim(dup."displayName") IN ('新規', '新規訪問')
  AND n."category" = 'APPOINTMENT_PROGRESS' AND n."internalCode" = 'PROG_NEW_VISIT';
UPDATE "StatusMaster" SET "active" = false
WHERE "category" = 'APPOINTMENT_PROGRESS' AND "internalCode" <> 'PROG_NEW_VISIT' AND btrim("displayName") IN ('新規', '新規訪問');

-- 4) 進捗が空欄のアポは「新規」にする
UPDATE "Appointment" SET "progressStatusId" = (
  SELECT "id" FROM "StatusMaster" WHERE "category" = 'APPOINTMENT_PROGRESS' AND "internalCode" = 'PROG_NEW_VISIT'
)
WHERE "progressStatusId" IS NULL;
