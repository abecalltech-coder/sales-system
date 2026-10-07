-- 案件管理(要望)
--  ・先頭(固定列)を「申込名義」、2列目を「案件名」に戻す
--  ・一括投入で同じ申込番号の行(拠点ごと)を見分けるため「地点番号」の列を申込番号の右に追加
DO $$
DECLARE
  first_order INTEGER;
  app_no_order INTEGER;
BEGIN
  SELECT COALESCE(MIN("order"), 0) INTO first_order FROM "DealField";
  UPDATE "DealField" SET "order" = first_order - 20, "updatedAt" = CURRENT_TIMESTAMP WHERE "fieldKey" = 'application_name';
  UPDATE "DealField" SET "order" = first_order - 10, "updatedAt" = CURRENT_TIMESTAMP WHERE "fieldKey" = 'case_name';

  IF NOT EXISTS (SELECT 1 FROM "DealField" WHERE "fieldKey" = 'point_number' OR btrim("label") = '地点番号') THEN
    SELECT COALESCE((SELECT "order" FROM "DealField" WHERE "fieldKey" = 'application_number' OR btrim("label") = '申込番号' ORDER BY "order" LIMIT 1), 0)
      INTO app_no_order;
    INSERT INTO "DealField" ("id", "fieldKey", "label", "dataType", "order", "updatedAt")
      VALUES (gen_random_uuid(), 'point_number', '地点番号', 'TEXT', app_no_order + 1, CURRENT_TIMESTAMP);
  END IF;
END $$;
