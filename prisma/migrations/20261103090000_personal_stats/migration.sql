-- 個人別数値(要望: シフトに代わる人員ごとの週次表)。シフトのテーブルは残す。
CREATE TABLE "PersonalDailyStat" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "metricKey" TEXT NOT NULL,
    "value" INTEGER NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PersonalDailyStat_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PersonalDailyStat_userId_date_metricKey_key" ON "PersonalDailyStat"("userId", "date", "metricKey");
CREATE INDEX "PersonalDailyStat_date_idx" ON "PersonalDailyStat"("date");

CREATE TABLE "PersonalStatTarget" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "metricKey" TEXT NOT NULL,
    "weeklyStory" INTEGER,
    "monthlyGoal" INTEGER,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PersonalStatTarget_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PersonalStatTarget_userId_month_metricKey_key" ON "PersonalStatTarget"("userId", "month", "metricKey");
CREATE INDEX "PersonalStatTarget_month_idx" ON "PersonalStatTarget"("month");

-- タブを絞っている役職にも「個人別数値」を出す(シフトの置き換え。見せたくない役職はユーザー管理で外す)
UPDATE "Role"
  SET "visibleTabs" = "visibleTabs" || '["/personal-stats"]'::jsonb
  WHERE "visibleTabs" IS NOT NULL AND jsonb_typeof("visibleTabs") = 'array'
    AND NOT ("visibleTabs" @> '["/personal-stats"]'::jsonb);
