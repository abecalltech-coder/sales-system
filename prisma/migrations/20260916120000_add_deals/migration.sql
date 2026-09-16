-- 案件管理(契約中案件の進捗管理。列(フィールド)はこの画面から追加/削除/名称変更可能)

CREATE TABLE "DealField" (
    "id" TEXT NOT NULL,
    "fieldKey" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "dataType" TEXT NOT NULL DEFAULT 'TEXT',
    "order" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DealField_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "DealField_fieldKey_key" ON "DealField"("fieldKey");
CREATE INDEX "DealField_order_idx" ON "DealField"("order");

CREATE TABLE "DealFieldOption" (
    "id" TEXT NOT NULL,
    "fieldId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "color" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "DealFieldOption_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "DealFieldOption_fieldId_idx" ON "DealFieldOption"("fieldId");
ALTER TABLE "DealFieldOption" ADD CONSTRAINT "DealFieldOption_fieldId_fkey" FOREIGN KEY ("fieldId") REFERENCES "DealField"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "Deal" (
    "id" TEXT NOT NULL,
    "values" JSONB NOT NULL DEFAULT '{}',
    "manualOrder" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Deal_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Deal_manualOrder_idx" ON "Deal"("manualOrder");
CREATE INDEX "Deal_deletedAt_idx" ON "Deal"("deletedAt");

-- 初期列(要望のレイアウト)。この画面の「列を管理」パネルから追加・削除・名称変更可能。
INSERT INTO "DealField" ("id","fieldKey","label","dataType","order","updatedAt") VALUES
  (gen_random_uuid(),'case_name','案件名','TEXT',10,CURRENT_TIMESTAMP),
  (gen_random_uuid(),'meeting_date','商談日','DATE',20,CURRENT_TIMESTAMP),
  (gen_random_uuid(),'contract_date','成約日','DATE',30,CURRENT_TIMESTAMP),
  (gen_random_uuid(),'entry_date','エントリー日','DATE',40,CURRENT_TIMESTAMP),
  (gen_random_uuid(),'mc_progress','MC進捗','SELECT',50,CURRENT_TIMESTAMP),
  (gen_random_uuid(),'mc_date','MC日','DATE',60,CURRENT_TIMESTAMP),
  (gen_random_uuid(),'sw_date','SW日','DATE',70,CURRENT_TIMESTAMP),
  (gen_random_uuid(),'status','ステータス','SELECT',80,CURRENT_TIMESTAMP),
  (gen_random_uuid(),'hook','フック','SELECT',90,CURRENT_TIMESTAMP),
  (gen_random_uuid(),'assignee_user_id','担当者名','USER',100,CURRENT_TIMESTAMP),
  (gen_random_uuid(),'contact','連絡先','TEXT',110,CURRENT_TIMESTAMP),
  (gen_random_uuid(),'region','地域','TEXT',120,CURRENT_TIMESTAMP),
  (gen_random_uuid(),'address','住所','TEXT',130,CURRENT_TIMESTAMP),
  (gen_random_uuid(),'official_line','公式LINE','SELECT',140,CURRENT_TIMESTAMP),
  (gen_random_uuid(),'indoor_progress','インドア進捗','SELECT',150,CURRENT_TIMESTAMP),
  (gen_random_uuid(),'hp_progress','HP進捗','SELECT',160,CURRENT_TIMESTAMP),
  (gen_random_uuid(),'shop_support_cancel_date','店サポ解約誘導日','DATE',170,CURRENT_TIMESTAMP),
  (gen_random_uuid(),'shop_support_cancel_status','点サポ解約誘導','SELECT',180,CURRENT_TIMESTAMP);

-- SELECT列の初期選択肢
INSERT INTO "DealFieldOption" ("id","fieldId","label","order")
  SELECT gen_random_uuid(), f."id", v.label, v.ord
  FROM "DealField" f
  JOIN (VALUES
    ('mc_progress', 'SW済', 10),
    ('mc_progress', 'MC済', 20),
    ('mc_progress', 'MCエラー', 30),
    ('status', '成約', 10),
    ('status', 'ET', 20),
    ('status', '解約', 30),
    ('status', '保留', 40),
    ('hook', 'インドア', 10),
    ('hook', 'HP', 20),
    ('hook', '電気', 30),
    ('official_line', '未', 10),
    ('official_line', '依頼中', 20),
    ('official_line', '済', 30),
    ('indoor_progress', '撮影日調整中', 10),
    ('indoor_progress', '掲載調整中', 20),
    ('indoor_progress', '掲載済み', 30),
    ('hp_progress', 'フォーム回収待ち', 10),
    ('hp_progress', '作成中', 20),
    ('hp_progress', '公開済み', 30),
    ('shop_support_cancel_status', '未', 10),
    ('shop_support_cancel_status', '済', 20)
  ) AS v(field_key, label, ord) ON v.field_key = f."fieldKey";
