-- チャット: メンションと、端末ごと・グループごとの通知設定(要望)
ALTER TABLE "ChatMessage" ADD COLUMN "mentions" TEXT[] DEFAULT ARRAY[]::TEXT[];

CREATE TABLE "ChatNotifySetting" (
    "endpoint" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ChatNotifySetting_pkey" PRIMARY KEY ("endpoint","roomId")
);
