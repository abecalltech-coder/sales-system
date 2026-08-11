-- CreateTable
CREATE TABLE "GoogleFormWebhookLog" (
    "id" TEXT NOT NULL,
    "responseId" TEXT,
    "rawPayload" JSONB NOT NULL,
    "status" TEXT NOT NULL,
    "tossCaseId" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GoogleFormWebhookLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GoogleFormWebhookLog_responseId_idx" ON "GoogleFormWebhookLog"("responseId");

-- CreateIndex
CREATE INDEX "GoogleFormWebhookLog_createdAt_idx" ON "GoogleFormWebhookLog"("createdAt");
