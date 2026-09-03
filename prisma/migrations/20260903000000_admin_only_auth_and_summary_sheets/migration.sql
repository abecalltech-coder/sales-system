-- AlterTable
ALTER TABLE "User" DROP COLUMN "mustChangePassword";

-- CreateTable
CREATE TABLE "SummarySheet" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "rowCount" INTEGER NOT NULL DEFAULT 20,
    "colCount" INTEGER NOT NULL DEFAULT 10,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "SummarySheet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SummarySheetCell" (
    "id" TEXT NOT NULL,
    "sheetId" TEXT NOT NULL,
    "row" INTEGER NOT NULL,
    "col" INTEGER NOT NULL,
    "value" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,

    CONSTRAINT "SummarySheetCell_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SummarySheet_order_idx" ON "SummarySheet"("order");

-- CreateIndex
CREATE INDEX "SummarySheetCell_sheetId_idx" ON "SummarySheetCell"("sheetId");

-- CreateIndex
CREATE UNIQUE INDEX "SummarySheetCell_sheetId_row_col_key" ON "SummarySheetCell"("sheetId", "row", "col");

-- AddForeignKey
ALTER TABLE "SummarySheetCell" ADD CONSTRAINT "SummarySheetCell_sheetId_fkey" FOREIGN KEY ("sheetId") REFERENCES "SummarySheet"("id") ON DELETE CASCADE ON UPDATE CASCADE;
