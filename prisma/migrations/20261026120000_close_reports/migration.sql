-- クローズ報告(要望)。本人の報告だけ見られる
CREATE TABLE "CloseReport" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "storeName" TEXT NOT NULL DEFAULT '',
    "values" JSONB NOT NULL,
    "text" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    CONSTRAINT "CloseReport_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CloseReport_userId_createdAt_idx" ON "CloseReport"("userId", "createdAt");
