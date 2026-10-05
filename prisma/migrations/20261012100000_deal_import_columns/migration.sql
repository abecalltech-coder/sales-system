-- 案件管理の一括投入の見直し(要望)
--  ・「担当者名」→「CL」、「エントリー日」→「ET日」(列名の変更。中身はそのまま)
--  ・「申込名義」を追加して先頭列(固定)に、2列目を「案件名」(店舗名)に
--  ・「オプション」(プルダウン。選択肢はデータから追加)、「相対/供給管理費」(6.0円〜12.0円 0.5円刻み)を追加

UPDATE "DealField" SET "label" = 'CL', "updatedAt" = CURRENT_TIMESTAMP WHERE "fieldKey" = 'assignee_user_id';
UPDATE "DealField" SET "label" = 'ET日', "updatedAt" = CURRENT_TIMESTAMP WHERE "fieldKey" = 'entry_date';

DO $$
DECLARE
  first_order INTEGER;
  last_order INTEGER;
BEGIN
  SELECT COALESCE(MIN("order"), 0), COALESCE(MAX("order"), 0) INTO first_order, last_order FROM "DealField";

  IF NOT EXISTS (SELECT 1 FROM "DealField" WHERE "fieldKey" = 'application_name') THEN
    INSERT INTO "DealField" ("id", "fieldKey", "label", "dataType", "order", "updatedAt")
      VALUES (gen_random_uuid(), 'application_name', '申込名義', 'TEXT', first_order - 20, CURRENT_TIMESTAMP);
    UPDATE "DealField" SET "order" = first_order - 10, "updatedAt" = CURRENT_TIMESTAMP WHERE "fieldKey" = 'case_name';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM "DealField" WHERE "fieldKey" = 'option') THEN
    INSERT INTO "DealField" ("id", "fieldKey", "label", "dataType", "order", "updatedAt")
      VALUES (gen_random_uuid(), 'option', 'オプション', 'SELECT', last_order + 10, CURRENT_TIMESTAMP);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM "DealField" WHERE "fieldKey" = 'supply_mgmt_fee') THEN
    INSERT INTO "DealField" ("id", "fieldKey", "label", "dataType", "order", "updatedAt")
      VALUES (gen_random_uuid(), 'supply_mgmt_fee', '相対/供給管理費', 'SELECT', last_order + 20, CURRENT_TIMESTAMP);
    INSERT INTO "DealFieldOption" ("id", "fieldId", "label", "order")
      SELECT gen_random_uuid(), f."id", to_char(v.n, 'FM990.0') || '円', (v.n * 20)::INTEGER
      FROM "DealField" f
      CROSS JOIN (SELECT generate_series(60, 120, 5) / 10.0 AS n) v
      WHERE f."fieldKey" = 'supply_mgmt_fee';
  END IF;
END $$;
