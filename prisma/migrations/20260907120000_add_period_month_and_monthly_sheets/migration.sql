-- 対象月(periodMonth = "YYYY-MM"、JST暦月)をトス/アポ/エントリーへ追加し、
-- 月次サマリー実績表・月次シフト表のテーブルを新設する(セクション追加要望: 月単位運用)。

-- ============================================================
-- 1. periodMonth 列の追加
-- ============================================================
ALTER TABLE "TossCase" ADD COLUMN "periodMonth" TEXT;
ALTER TABLE "Appointment" ADD COLUMN "periodMonth" TEXT;
ALTER TABLE "Contract" ADD COLUMN "periodMonth" TEXT;

-- 既存レコードのバックフィル。UTC保存値を Asia/Tokyo の壁時計へ変換してから "YYYY-MM" を取る。
UPDATE "TossCase"
  SET "periodMonth" = to_char(("receivedAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Tokyo'), 'YYYY-MM')
  WHERE "periodMonth" IS NULL;

UPDATE "Appointment"
  SET "periodMonth" = to_char(
    (COALESCE("preContactAt", "meetingStartAt", "createdAt") AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Tokyo'),
    'YYYY-MM'
  )
  WHERE "periodMonth" IS NULL;

UPDATE "Contract"
  SET "periodMonth" = to_char(
    (COALESCE("contractedAt", "matchingAt", "createdAt") AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Tokyo'),
    'YYYY-MM'
  )
  WHERE "periodMonth" IS NULL;

CREATE INDEX "TossCase_periodMonth_idx" ON "TossCase"("periodMonth");
CREATE INDEX "Appointment_periodMonth_idx" ON "Appointment"("periodMonth");
CREATE INDEX "Contract_periodMonth_idx" ON "Contract"("periodMonth");

-- ============================================================
-- 2. 月次サマリー実績表
-- ============================================================
CREATE TABLE "MonthlySummarySheet" (
    "id" TEXT NOT NULL,
    "periodMonth" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MonthlySummarySheet_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MonthlySummarySheet_periodMonth_departmentId_key" ON "MonthlySummarySheet"("periodMonth", "departmentId");
CREATE INDEX "MonthlySummarySheet_periodMonth_idx" ON "MonthlySummarySheet"("periodMonth");

CREATE TABLE "MonthlySummaryRow" (
    "id" TEXT NOT NULL,
    "sheetId" TEXT NOT NULL,
    "userId" TEXT,
    "role" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "values" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MonthlySummaryRow_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MonthlySummaryRow_sheetId_idx" ON "MonthlySummaryRow"("sheetId");

ALTER TABLE "MonthlySummaryRow" ADD CONSTRAINT "MonthlySummaryRow_sheetId_fkey"
  FOREIGN KEY ("sheetId") REFERENCES "MonthlySummarySheet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================
-- 3. 月次シフト表
-- ============================================================
CREATE TABLE "MonthlyShiftSheet" (
    "id" TEXT NOT NULL,
    "periodMonth" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MonthlyShiftSheet_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MonthlyShiftSheet_periodMonth_key" ON "MonthlyShiftSheet"("periodMonth");

CREATE TABLE "MonthlyShiftRow" (
    "id" TEXT NOT NULL,
    "sheetId" TEXT NOT NULL,
    "userId" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "attributes" JSONB NOT NULL DEFAULT '{}',
    "days" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MonthlyShiftRow_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MonthlyShiftRow_sheetId_idx" ON "MonthlyShiftRow"("sheetId");

ALTER TABLE "MonthlyShiftRow" ADD CONSTRAINT "MonthlyShiftRow_sheetId_fkey"
  FOREIGN KEY ("sheetId") REFERENCES "MonthlyShiftSheet"("id") ON DELETE CASCADE ON UPDATE CASCADE;
