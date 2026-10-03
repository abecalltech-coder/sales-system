-- 申込情報の明細写真(要望)
CREATE TABLE "ApplicationSheetPhoto" (
    "id" TEXT NOT NULL,
    "sheetId" TEXT NOT NULL,
    "section" TEXT NOT NULL,
    "image" TEXT NOT NULL,
    "thumb" TEXT NOT NULL,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ApplicationSheetPhoto_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ApplicationSheetPhoto_sheetId_idx" ON "ApplicationSheetPhoto"("sheetId");
ALTER TABLE "ApplicationSheetPhoto" ADD CONSTRAINT "ApplicationSheetPhoto_sheetId_fkey" FOREIGN KEY ("sheetId") REFERENCES "ApplicationSheet"("id") ON DELETE CASCADE ON UPDATE CASCADE;
