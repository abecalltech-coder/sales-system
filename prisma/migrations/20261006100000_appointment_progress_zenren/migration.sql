-- アポ実績の進捗に「前連失注」を用意する(要望: サマリーの前連失注の集計元)。
-- 初期データに含まれるが、本番で未登録・削除済みの場合に備えて、同名が無ければ追加する。
INSERT INTO "StatusMaster" ("id", "category", "internalCode", "displayName", "order", "active", "color")
SELECT gen_random_uuid(), 'APPOINTMENT_PROGRESS', 'PROG_LOST_ZENREN', '前連失注', 40, true, '#fecaca'
WHERE NOT EXISTS (
  SELECT 1 FROM "StatusMaster"
  WHERE "category" = 'APPOINTMENT_PROGRESS' AND ("internalCode" = 'PROG_LOST_ZENREN' OR btrim("displayName") = '前連失注')
);
-- 以前「有効」を外していた場合は表示に戻す
UPDATE "StatusMaster" SET "active" = true
WHERE "category" = 'APPOINTMENT_PROGRESS' AND ("internalCode" = 'PROG_LOST_ZENREN' OR btrim("displayName") = '前連失注');
