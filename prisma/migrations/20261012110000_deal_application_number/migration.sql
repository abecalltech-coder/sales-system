-- 「申込番号」の列が無いと申込番号ごとに案件を作れない(要望: 申込番号ごとに行を作成)ため、無ければ案件名の右に追加
DO $$
DECLARE
  base INTEGER;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "DealField" WHERE "fieldKey" = 'application_number' OR btrim("label") = '申込番号') THEN
    SELECT COALESCE((SELECT "order" FROM "DealField" WHERE "fieldKey" = 'case_name'), 0) INTO base;
    INSERT INTO "DealField" ("id", "fieldKey", "label", "dataType", "order", "updatedAt")
      VALUES (gen_random_uuid(), 'application_number', '申込番号', 'TEXT', base + 5, CURRENT_TIMESTAMP);
  END IF;
END $$;
