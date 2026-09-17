-- 月次シフト表を部署ごとに分ける(要望)。既存シートは暫定的に最初の部署へ割り当てる
-- (部署が1つも登録されていない場合は既存シートを削除して整合性を保つ)。

ALTER TABLE "MonthlyShiftSheet" ADD COLUMN "departmentId" TEXT;

UPDATE "MonthlyShiftSheet"
SET "departmentId" = (
  SELECT id FROM "Department" WHERE active = true ORDER BY "order" ASC, "createdAt" ASC LIMIT 1
)
WHERE "departmentId" IS NULL;

DELETE FROM "MonthlyShiftSheet" WHERE "departmentId" IS NULL;

ALTER TABLE "MonthlyShiftSheet" ALTER COLUMN "departmentId" SET NOT NULL;

DROP INDEX IF EXISTS "MonthlyShiftSheet_periodMonth_key";

ALTER TABLE "MonthlyShiftSheet" ADD CONSTRAINT "MonthlyShiftSheet_departmentId_fkey"
  FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE UNIQUE INDEX "MonthlyShiftSheet_periodMonth_departmentId_key" ON "MonthlyShiftSheet"("periodMonth", "departmentId");
CREATE INDEX "MonthlyShiftSheet_periodMonth_idx" ON "MonthlyShiftSheet"("periodMonth");
CREATE INDEX "MonthlyShiftSheet_departmentId_idx" ON "MonthlyShiftSheet"("departmentId");
