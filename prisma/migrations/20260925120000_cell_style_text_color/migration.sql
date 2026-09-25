-- 文字色はマスタ管理ではなく一覧画面のセルごとに設定する(要望)
ALTER TABLE "StatusMaster" DROP COLUMN IF EXISTS "textColor";

CREATE TABLE "CellStyle" (
    "id" TEXT NOT NULL,
    "tableKey" TEXT NOT NULL,
    "rowId" TEXT NOT NULL,
    "columnKey" TEXT NOT NULL,
    "textColor" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CellStyle_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CellStyle_tableKey_rowId_columnKey_key" ON "CellStyle"("tableKey", "rowId", "columnKey");
CREATE INDEX "CellStyle_tableKey_idx" ON "CellStyle"("tableKey");
