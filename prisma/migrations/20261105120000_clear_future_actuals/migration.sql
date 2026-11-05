-- 個人別数値: 未来日の実績の手入力を全員分削除する(要望: 実績は今日までの数字しか入力しない。2026-11-05 JST 時点)
DELETE FROM "PersonalDailyStat"
  WHERE "metricKey" IN ('TOSS_UP', 'APPOINTMENT', 'MEETING', 'JUSETSU_OK', 'ET')
    AND "date" > '2026-11-05';
