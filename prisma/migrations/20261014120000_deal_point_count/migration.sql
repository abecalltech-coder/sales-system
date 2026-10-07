-- 案件管理(要望): 一括投入の「HC番号」の数を「地点数」として入れる列を地点番号の右に追加
DO $$
DECLARE
  base INTEGER;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "DealField" WHERE "fieldKey" = 'point_count' OR btrim("label") = '地点数') THEN
    SELECT COALESCE((SELECT "order" FROM "DealField" WHERE "fieldKey" = 'point_number' OR btrim("label") = '地点番号' ORDER BY "order" LIMIT 1), 0)
      INTO base;
    INSERT INTO "DealField" ("id", "fieldKey", "label", "dataType", "order", "updatedAt")
      VALUES (gen_random_uuid(), 'point_count', '地点数', 'TEXT', base + 1, CURRENT_TIMESTAMP);
  END IF;
END $$;
