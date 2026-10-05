-- 個人チャット(1対1)とメモ(要望)
ALTER TABLE "ChatRoom" ADD COLUMN "isDirect" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ChatRoom" ADD COLUMN "directKey" TEXT;
CREATE UNIQUE INDEX "ChatRoom_directKey_key" ON "ChatRoom"("directKey");

CREATE TABLE "Memo" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL DEFAULT '',
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    CONSTRAINT "Memo_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Memo_userId_updatedAt_idx" ON "Memo"("userId", "updatedAt");
