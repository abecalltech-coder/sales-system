-- トークスクリプト(要望: APのランクごとのベーストークとアウト返し集)
ALTER TABLE "Role" ADD COLUMN "canEditTalkScripts" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN "talkRank" TEXT;

CREATE TABLE "TalkStep" (
    "id" TEXT NOT NULL,
    "rank" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "body" TEXT NOT NULL DEFAULT '',
    "outIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    CONSTRAINT "TalkStep_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "TalkStep_rank_order_idx" ON "TalkStep"("rank", "order");

CREATE TABLE "TalkOut" (
    "id" TEXT NOT NULL,
    "ranks" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "label" TEXT NOT NULL DEFAULT '',
    "category" TEXT NOT NULL DEFAULT '',
    "body" TEXT NOT NULL DEFAULT '',
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    CONSTRAINT "TalkOut_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "TalkOut_order_idx" ON "TalkOut"("order");

-- タブを絞っている役職にも トークスクリプト のタブを表示する(見せない役職はユーザー管理でチェックを外す)
UPDATE "Role"
  SET "visibleTabs" = "visibleTabs" || '["/talk-scripts"]'::jsonb
  WHERE "visibleTabs" IS NOT NULL AND jsonb_typeof("visibleTabs") = 'array'
    AND NOT ("visibleTabs" @> '["/talk-scripts"]'::jsonb);
