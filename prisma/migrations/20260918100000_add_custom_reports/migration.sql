-- サマリータブ「カスタムレポート作成」(要望)

CREATE TABLE "CustomReport" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "config" JSONB NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,

    CONSTRAINT "CustomReport_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "CustomReport_order_idx" ON "CustomReport"("order");
