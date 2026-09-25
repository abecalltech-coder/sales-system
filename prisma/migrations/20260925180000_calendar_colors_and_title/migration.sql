-- CLカレンダー: 部署ごとの訪問/オンライン色、題名の手入力(要望)
ALTER TABLE "StatusMaster" ADD COLUMN "onlineColor" TEXT;
ALTER TABLE "Appointment" ADD COLUMN "calendarTitleCustom" TEXT;

-- アポ変換時に部署色を案件へ複写していたため、マスタ管理で色を変えても反映されなかった。
-- 案件ごとの色をリセットし、以降はマスタの部署色(訪問/オンライン)を常に使う。
UPDATE "Appointment" SET "calendarColor" = NULL WHERE "calendarColor" IS NOT NULL;
