-- CB管理(要望: CBの案件を登録して一覧で管理する。項目はすべて任意)
CREATE TABLE "CbCase" (
    "id" TEXT NOT NULL,
    "caseName" TEXT NOT NULL DEFAULT '',
    "contractDate" TEXT,
    "mcDate" TEXT,
    "cbAmount" INTEGER,
    "status" TEXT,
    "memo" TEXT NOT NULL DEFAULT '',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    CONSTRAINT "CbCase_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "CbCase_createdAt_idx" ON "CbCase"("createdAt");

-- タブを絞っている役職にも CB管理 のタブを表示する(見せない役職はユーザー管理でチェックを外す)
UPDATE "Role"
  SET "visibleTabs" = "visibleTabs" || '["/cb-cases"]'::jsonb
  WHERE "visibleTabs" IS NOT NULL AND jsonb_typeof("visibleTabs") = 'array'
    AND NOT ("visibleTabs" @> '["/cb-cases"]'::jsonb);
