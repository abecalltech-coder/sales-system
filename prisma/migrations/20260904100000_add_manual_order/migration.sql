-- 一覧の手動並び替え順(要望)
ALTER TABLE "TossCase" ADD COLUMN "manualOrder" INTEGER;
ALTER TABLE "Appointment" ADD COLUMN "manualOrder" INTEGER;
ALTER TABLE "Contract" ADD COLUMN "manualOrder" INTEGER;
