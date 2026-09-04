-- CreateTable
CREATE TABLE "TossFormField" (
    "id" TEXT NOT NULL,
    "targetKey" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "fieldType" TEXT NOT NULL DEFAULT 'TEXT',
    "required" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL DEFAULT 0,
    "helpText" TEXT,
    "optionsMode" TEXT NOT NULL DEFAULT 'NONE',
    "masterCategory" TEXT,
    "staticOptions" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TossFormField_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TossFormField_order_idx" ON "TossFormField"("order");

-- 初期項目(Googleフォーム「トスアップフォーマット」の内容)。管理タブで編集可能。
INSERT INTO "TossFormField" ("id","targetKey","label","fieldType","required","order","optionsMode","masterCategory","staticOptions","updatedAt") VALUES
  (gen_random_uuid(),'department','部署','MULTISELECT',false,10,'STATIC',NULL,'["CH 直販【東】","CH 直販【西】","CT 直販"]',CURRENT_TIMESTAMP),
  (gen_random_uuid(),'hook','フック','SELECT',false,20,'STATIC',NULL,'["インドア","電気フック","HP(ZOOM)","HP(訪問)","CRM","HP(シミュ)"]',CURRENT_TIMESTAMP),
  (gen_random_uuid(),'tossUserName','トス担当者名','SELECT',false,30,'USERS',NULL,'[]',CURRENT_TIMESTAMP),
  (gen_random_uuid(),'preConfirmStaffName','前確担当者名','SELECT',false,40,'MASTER','TOSS_PRE_CONFIRM','[]',CURRENT_TIMESTAMP),
  (gen_random_uuid(),'corporateName','店舗名','TEXT',false,50,'NONE',NULL,'[]',CURRENT_TIMESTAMP),
  (gen_random_uuid(),'phone','店舗連絡先','TEXT',false,60,'NONE',NULL,'[]',CURRENT_TIMESTAMP),
  (gen_random_uuid(),'address','住所(都道府県から)','TEXT',true,70,'NONE',NULL,'[]',CURRENT_TIMESTAMP),
  (gen_random_uuid(),'electricCompany','電気会社','TEXT',false,80,'NONE',NULL,'[]',CURRENT_TIMESTAMP),
  (gen_random_uuid(),'contactName','担当者名','RADIO',false,90,'STATIC',NULL,'["オーナー","その他"]',CURRENT_TIMESTAMP),
  (gen_random_uuid(),'listName','リスト','TEXT',false,100,'NONE',NULL,'[]',CURRENT_TIMESTAMP),
  (gen_random_uuid(),'proposal','提案','MULTISELECT',false,110,'STATIC',NULL,'["店舗","自宅","不明"]',CURRENT_TIMESTAMP),
  (gen_random_uuid(),'callDirection','架電or入電','RADIO',false,120,'STATIC',NULL,'["架電","入電"]',CURRENT_TIMESTAMP),
  (gen_random_uuid(),'industry','業種','SELECT',false,130,'STATIC',NULL,'["飲食","外国料理","ナイト系","エステ","その他","教室","美容室","メンズエステ","宿泊施設","カフェ","バー","パン","ネイルサロン","ジム","整体・整骨・マッサージ","和食","居酒屋","イタリアン","スナック","質屋","施設","ラーメン","不明","アートギャラリー","弁当・惣菜","中華","ペット","デザート","雀荘","カレー","雑貨屋・洋服","福祉","そば・うどん","焼肉"]',CURRENT_TIMESTAMP),
  (gen_random_uuid(),'preferredCallAt','架電希望日時','DATETIME',false,140,'NONE',NULL,'[]',CURRENT_TIMESTAMP),
  (gen_random_uuid(),'memo','備考','TEXTAREA',false,150,'NONE',NULL,'[]',CURRENT_TIMESTAMP);

-- 前確担当者(TOSS_PRE_CONFIRM)の初期値。マスタ管理 > トス実績 で編集できる。
INSERT INTO "StatusMaster" ("id","category","internalCode","displayName","order","active") VALUES
  (gen_random_uuid(),'TOSS_PRE_CONFIRM','PRECONF_1','阿部航大',10,true),
  (gen_random_uuid(),'TOSS_PRE_CONFIRM','PRECONF_2','河合絵璃香',20,true),
  (gen_random_uuid(),'TOSS_PRE_CONFIRM','PRECONF_3','岩井和希',30,true)
ON CONFLICT ("category","internalCode") DO NOTHING;
