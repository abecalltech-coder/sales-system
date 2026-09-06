-- 最終報告(ユーザーが日々入力する数値レポート。セクション追加要望)

CREATE TABLE "FinalReportField" (
    "id" TEXT NOT NULL,
    "code" TEXT,
    "label" TEXT NOT NULL,
    "fieldType" TEXT NOT NULL DEFAULT 'NUMBER',
    "computed" TEXT,
    "unit" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinalReportField_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "FinalReportField_code_key" ON "FinalReportField"("code");
CREATE INDEX "FinalReportField_order_idx" ON "FinalReportField"("order");

CREATE TABLE "FinalReportEntry" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "values" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinalReportEntry_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "FinalReportEntry_userId_date_key" ON "FinalReportEntry"("userId", "date");
CREATE INDEX "FinalReportEntry_userId_idx" ON "FinalReportEntry"("userId");
CREATE INDEX "FinalReportEntry_date_idx" ON "FinalReportEntry"("date");

-- 初期項目(要望のレイアウト)。管理者タブで編集可能。
INSERT INTO "FinalReportField" ("id","code","label","fieldType","computed","order","updatedAt") VALUES
  (gen_random_uuid(),'checkinTime','出勤時間','TEXT',NULL,10,CURRENT_TIMESTAMP),
  (gen_random_uuid(),'callSf','コール数（SF）','NUMBER',NULL,20,CURRENT_TIMESTAMP),
  (gen_random_uuid(),'callBlank','コール数（白地）','NUMBER',NULL,30,CURRENT_TIMESTAMP),
  (gen_random_uuid(),'callTotal','合計コール数','NUMBER','callSf+callBlank',40,CURRENT_TIMESTAMP),
  (gen_random_uuid(),'approach','アプローチ','NUMBER',NULL,50,CURRENT_TIMESTAMP),
  (gen_random_uuid(),'gist','主旨','NUMBER',NULL,60,CURRENT_TIMESTAMP),
  (gen_random_uuid(),'indoorOrClosing','インドア or クロージング','TEXT',NULL,70,CURRENT_TIMESTAMP),
  (gen_random_uuid(),'electricity','電気(インドア人員のみ)','NUMBER',NULL,80,CURRENT_TIMESTAMP),
  (gen_random_uuid(),'testCloseOrSchedule','テスクロ or 日程調整','TEXT',NULL,90,CURRENT_TIMESTAMP),
  (gen_random_uuid(),'tossUp','トスアップ','NUMBER',NULL,100,CURRENT_TIMESTAMP),
  (gen_random_uuid(),'appointment','アポイント','NUMBER',NULL,110,CURRENT_TIMESTAMP),
  (gen_random_uuid(),'prospectA','見込みA','NUMBER',NULL,120,CURRENT_TIMESTAMP),
  (gen_random_uuid(),'prospectB','見込みB','NUMBER',NULL,130,CURRENT_TIMESTAMP);
