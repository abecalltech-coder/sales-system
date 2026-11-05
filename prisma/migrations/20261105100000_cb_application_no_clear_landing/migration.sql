-- CB管理に申込番号を追加(要望)
ALTER TABLE "CbCase" ADD COLUMN "applicationNo" TEXT NOT NULL DEFAULT '';

-- 個人別数値: 今日(2026-11-05 JST)以降の着地見込みの手入力を全員分いったん消す(要望)
DELETE FROM "PersonalDailyStat"
  WHERE "metricKey" IN ('TOSS_UP_REVISED', 'APPOINTMENT_REVISED')
    AND "date" >= '2026-11-05';
