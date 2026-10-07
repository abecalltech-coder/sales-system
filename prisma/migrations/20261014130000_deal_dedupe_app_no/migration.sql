-- 案件管理(要望 2026-10-07): HC番号ごとに作られた案件を、申込番号ごとに1件へ。
-- 同じ申込番号の案件は作成順で最初の1件を残し、残りを論理削除する(deletedAt なのでDB上で戻せる)。
-- 残す案件の地点数が空なら、纏めた件数(=HC番号の行数)を一括投入の項目として入れる。
DO $$
DECLARE
  app_key TEXT;
BEGIN
  SELECT "fieldKey" INTO app_key FROM "DealField"
    WHERE "fieldKey" = 'application_number' OR btrim("label") = '申込番号'
    ORDER BY ("fieldKey" = 'application_number') DESC, "order" LIMIT 1;
  IF app_key IS NULL THEN RETURN; END IF;

  CREATE TEMP TABLE deal_groups ON COMMIT DROP AS
    SELECT "id",
           row_number() OVER (PARTITION BY btrim("values"->>app_key) ORDER BY "createdAt", "manualOrder", "id") AS rn,
           count(*) OVER (PARTITION BY btrim("values"->>app_key)) AS cnt
      FROM "Deal"
     WHERE "deletedAt" IS NULL AND COALESCE(btrim("values"->>app_key), '') <> '';

  UPDATE "Deal" d
     SET "values" = d."values" || jsonb_build_object('point_count', g.cnt::text),
         "importedKeys" = array_append(array_remove(d."importedKeys", 'point_count'), 'point_count'),
         "updatedAt" = CURRENT_TIMESTAMP
    FROM deal_groups g
   WHERE d."id" = g."id" AND g.rn = 1 AND g.cnt > 1
     AND COALESCE(btrim(d."values"->>'point_count'), '') = '';

  UPDATE "Deal" d
     SET "deletedAt" = CURRENT_TIMESTAMP
    FROM deal_groups g
   WHERE d."id" = g."id" AND g.rn > 1;
END $$;
