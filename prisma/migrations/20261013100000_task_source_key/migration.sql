-- 案件から自動で作るタスク(店サポ解約誘導)の元。1つの元につき1タスク
ALTER TABLE "Task" ADD COLUMN "sourceKey" TEXT;
CREATE UNIQUE INDEX "Task_sourceKey_key" ON "Task"("sourceKey");
