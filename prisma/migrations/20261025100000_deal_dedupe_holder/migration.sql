-- 案件管理(要望 2026-10-24): 同じ申込名義の重複案件を1件に纏める(ユーザー了承済み)。
-- 申込名義は全角/半角・空白の違いを無視して照合(一括投入と同じ)。
-- 残すのは手打ち・システム内で修正した項目(importedKeys に無い入力済みの項目)が一番多い案件。同数なら作成順で最初。
-- 残す案件の空欄は、他の案件の値で埋める(作成順で先のもの優先)。手打ちの値は変えない。
-- 地点数は纏めた案件の地点数の合計(空・数字でないものは1地点)。残す案件の地点数が手打ちならそのまま。
-- 残り(重複分)は論理削除(deletedAt なのでDB上で戻せる)。
DO $$
DECLARE
  holder_key TEXT;
  pc_key TEXT;
  g RECORD;
  keep_id TEXT;
  keep_values JSONB;
  keep_imported TEXT[];
  o RECORD;
  kv RECORD;
  total_points INT;
BEGIN
  SELECT "fieldKey" INTO holder_key FROM "DealField"
    WHERE "fieldKey" = 'application_name' OR btrim("label") = '申込名義'
    ORDER BY ("fieldKey" = 'application_name') DESC, "order" LIMIT 1;
  IF holder_key IS NULL THEN RETURN; END IF;
  SELECT "fieldKey" INTO pc_key FROM "DealField"
    WHERE "fieldKey" = 'point_count' OR btrim("label") = '地点数'
    ORDER BY ("fieldKey" = 'point_count') DESC, "order" LIMIT 1;

  CREATE TEMP TABLE deal_holder ON COMMIT DROP AS
    SELECT d."id",
           regexp_replace(normalize(d."values"->>holder_key, NFKC), '[[:space:]]', '', 'g') AS holder,
           -- 手打ち・システム内で入れた項目の数(空でない値のうち一括投入由来でないもの)
           (SELECT count(*) FROM jsonb_each_text(d."values") e
             WHERE COALESCE(btrim(e.value), '') <> '' AND NOT (e.key = ANY(d."importedKeys"))) AS manual_cnt,
           d."createdAt", d."manualOrder"
      FROM "Deal" d
     WHERE d."deletedAt" IS NULL
       AND COALESCE(regexp_replace(normalize(d."values"->>holder_key, NFKC), '[[:space:]]', '', 'g'), '') <> '';

  FOR g IN SELECT holder FROM deal_holder GROUP BY holder HAVING count(*) > 1 LOOP
    SELECT h."id" INTO keep_id FROM deal_holder h WHERE h.holder = g.holder
      ORDER BY h.manual_cnt DESC, h."createdAt", h."manualOrder", h."id" LIMIT 1;
    SELECT d."values", d."importedKeys" INTO keep_values, keep_imported FROM "Deal" d WHERE d."id" = keep_id;
    total_points := 0;

    FOR o IN SELECT d."id", d."values", d."importedKeys" FROM "Deal" d JOIN deal_holder h ON h."id" = d."id"
              WHERE h.holder = g.holder ORDER BY d."createdAt", d."manualOrder", d."id" LOOP
      -- 地点数の合計
      IF pc_key IS NOT NULL AND COALESCE(btrim(o."values"->>pc_key), '') ~ '^[0-9]+$' THEN
        total_points := total_points + (btrim(o."values"->>pc_key))::INT;
      ELSE
        total_points := total_points + 1;
      END IF;
      IF o."id" = keep_id THEN CONTINUE; END IF;
      -- 残す案件の空欄を埋める(一括投入由来の値は一括投入の項目として引き継ぐ)
      FOR kv IN SELECT e.key, e.value FROM jsonb_each(o."values") e LOOP
        IF kv.key = pc_key THEN CONTINUE; END IF;
        IF COALESCE(btrim(kv.value #>> '{}'), '') = '' THEN CONTINUE; END IF;
        IF COALESCE(btrim(keep_values->>kv.key), '') <> '' THEN CONTINUE; END IF;
        keep_values := keep_values || jsonb_build_object(kv.key, kv.value);
        IF kv.key = ANY(o."importedKeys") AND NOT (kv.key = ANY(keep_imported)) THEN
          keep_imported := array_append(keep_imported, kv.key);
        END IF;
      END LOOP;
    END LOOP;

    -- 地点数: 空か一括投入由来のときだけ合計を入れる(手打ちは変えない)
    IF pc_key IS NOT NULL AND (COALESCE(btrim(keep_values->>pc_key), '') = '' OR pc_key = ANY(keep_imported)) THEN
      keep_values := keep_values || jsonb_build_object(pc_key, total_points::TEXT);
      IF NOT (pc_key = ANY(keep_imported)) THEN keep_imported := array_append(keep_imported, pc_key); END IF;
    END IF;

    UPDATE "Deal" SET "values" = keep_values, "importedKeys" = keep_imported,
                      "version" = "version" + 1, "updatedAt" = CURRENT_TIMESTAMP
     WHERE "id" = keep_id;
    UPDATE "Deal" d SET "deletedAt" = CURRENT_TIMESTAMP
      FROM deal_holder h
     WHERE d."id" = h."id" AND h.holder = g.holder AND d."id" <> keep_id;
  END LOOP;
END $$;
