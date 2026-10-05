-- 案件を一旦すべて消す(要望 2026-10-05: 一括投入で何が反映されるか一から確認するため)。
-- 論理削除(deletedAt)なので、必要ならDB上で戻せる
UPDATE "Deal" SET "deletedAt" = CURRENT_TIMESTAMP WHERE "deletedAt" IS NULL;
