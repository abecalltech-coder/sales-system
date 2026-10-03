-- 申込情報/明細(要望)
CREATE TABLE "ApplicationSheet" (
    "id" TEXT NOT NULL,
    "inputCode" TEXT,
    "hasJuryo" BOOLEAN NOT NULL DEFAULT false,
    "hasDoryoku" BOOLEAN NOT NULL DEFAULT false,
    "data" JSONB NOT NULL DEFAULT '{}',
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    CONSTRAINT "ApplicationSheet_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ApplicationSheet_createdAt_idx" ON "ApplicationSheet"("createdAt");
