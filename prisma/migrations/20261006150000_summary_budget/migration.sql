-- 部署別サマリーの予算(手入力)
CREATE TABLE "SummaryBudget" (
    "periodMonth" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "values" JSONB NOT NULL DEFAULT '{}',
    "updatedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SummaryBudget_pkey" PRIMARY KEY ("periodMonth","userId")
);
