-- 稼働ルール(要望)。閲覧は全員、編集は役職ごとに許可(管理者は常に可)
ALTER TABLE "Role" ADD COLUMN "canEditWorkRules" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "WorkRuleGroup" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "WorkRuleGroup_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WorkRule" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL DEFAULT '',
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    CONSTRAINT "WorkRule_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "WorkRule_groupId_idx" ON "WorkRule"("groupId");
ALTER TABLE "WorkRule" ADD CONSTRAINT "WorkRule_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "WorkRuleGroup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
