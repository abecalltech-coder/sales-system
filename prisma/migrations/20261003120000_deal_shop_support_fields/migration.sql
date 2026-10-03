-- 案件管理の列の追加・名称変更(要望)
--  ・「店サポ解約誘導」→「店サポ解約誘導進捗」
--  ・「安心Biz付帯」→「安心Biz付帯有無」(画面から追加された列のため表示名で照合する)
--  ・「店サポ付帯有無」「店サポ解約誘導有無」(有/無のプルダウン)を店サポ解約誘導日の直前に追加

UPDATE "DealField"
SET "label" = '店サポ解約誘導進捗', "updatedAt" = CURRENT_TIMESTAMP
WHERE "fieldKey" = 'shop_support_cancel_status';

UPDATE "DealField"
SET "label" = '安心Biz付帯有無', "updatedAt" = CURRENT_TIMESTAMP
WHERE btrim("label") IN ('安心Biz付帯', '安心BIZ付帯', 'あんしんBiz付帯', 'あんしんBIZ付帯');

DO $$
DECLARE
  base INTEGER;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "DealField" WHERE "fieldKey" IN ('shop_support_attached', 'shop_support_cancel_guidance')) THEN
    SELECT "order" INTO base FROM "DealField" WHERE "fieldKey" = 'shop_support_cancel_date';
    IF base IS NULL THEN
      -- 店サポ解約誘導日の列が無い場合は末尾へ
      SELECT COALESCE(MAX("order"), 0) + 10 INTO base FROM "DealField";
    ELSE
      -- 2列分の場所を空ける
      UPDATE "DealField" SET "order" = "order" + 2, "updatedAt" = CURRENT_TIMESTAMP WHERE "order" >= base;
    END IF;

    INSERT INTO "DealField" ("id", "fieldKey", "label", "dataType", "order", "updatedAt") VALUES
      (gen_random_uuid(), 'shop_support_attached', '店サポ付帯有無', 'SELECT', base, CURRENT_TIMESTAMP),
      (gen_random_uuid(), 'shop_support_cancel_guidance', '店サポ解約誘導有無', 'SELECT', base + 1, CURRENT_TIMESTAMP);

    INSERT INTO "DealFieldOption" ("id", "fieldId", "label", "order")
      SELECT gen_random_uuid(), f."id", v.label, v.ord
      FROM "DealField" f
      JOIN (VALUES ('有', 10), ('無', 20)) AS v(label, ord) ON TRUE
      WHERE f."fieldKey" IN ('shop_support_attached', 'shop_support_cancel_guidance');
  END IF;
END $$;
