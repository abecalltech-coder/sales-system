-- 一括投入で入った項目の記録(要望: 手打ちの値は一括投入で上書きしない)。
-- 既存の値は出どころが分からないため、安全側に倒して全て「手打ち扱い」(空=保護)で始める
ALTER TABLE "Deal" ADD COLUMN "importedKeys" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
