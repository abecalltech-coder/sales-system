-- アポ登録フォームの項目変更(要望)。アポ詳細FMTの並びに合わせて並べ直す

-- フックはテキスト入力に
UPDATE "TossFormField" SET "fieldType" = 'TEXT', "optionsMode" = 'NONE', "masterCategory" = NULL, "staticOptions" = '[]', "updatedAt" = CURRENT_TIMESTAMP
  WHERE "form" = 'APPOINTMENT' AND "targetKey" = 'hook';
-- CL は不要(非表示。アポフォーム設定で戻せる)
UPDATE "TossFormField" SET "active" = false, "order" = 990, "updatedAt" = CURRENT_TIMESTAMP
  WHERE "form" = 'APPOINTMENT' AND "targetKey" = 'closerName';
-- 電気会社(既契約)を「利用電気」に
UPDATE "TossFormField" SET "label" = '利用電気', "updatedAt" = CURRENT_TIMESTAMP
  WHERE "form" = 'APPOINTMENT' AND "targetKey" = 'existingContract';
UPDATE "TossFormField" SET "label" = '店舗番号', "updatedAt" = CURRENT_TIMESTAMP
  WHERE "form" = 'APPOINTMENT' AND "targetKey" = 'phone' AND "label" = '店舗連絡先';

INSERT INTO "TossFormField" ("id","form","targetKey","label","fieldType","required","order","optionsMode","masterCategory","staticOptions","updatedAt") VALUES
  (gen_random_uuid(),'APPOINTMENT','acquisitionAngle','獲得確度','SELECT',false,0,'STATIC',NULL,'["A","B","C"]',CURRENT_TIMESTAMP),
  (gen_random_uuid(),'APPOINTMENT','nextActionAt','取次日時','DATETIME',false,0,'NONE',NULL,'[]',CURRENT_TIMESTAMP),
  (gen_random_uuid(),'APPOINTMENT','mobilePhone','携帯番号','TEXT',false,0,'NONE',NULL,'[]',CURRENT_TIMESTAMP),
  (gen_random_uuid(),'APPOINTMENT','contactAge','担当者の年齢(何歳前後)','TEXT',false,0,'NONE',NULL,'[]',CURRENT_TIMESTAMP),
  (gen_random_uuid(),'APPOINTMENT','contactGender','男性/女性','SELECT',false,0,'STATIC',NULL,'["男性","女性"]',CURRENT_TIMESTAMP),
  (gen_random_uuid(),'APPOINTMENT','charge','料金','TEXT',false,0,'NONE',NULL,'[]',CURRENT_TIMESTAMP),
  (gen_random_uuid(),'APPOINTMENT','billPrep','明細','TEXT',false,0,'NONE',NULL,'[]',CURRENT_TIMESTAMP),
  (gen_random_uuid(),'APPOINTMENT','corporateType','法人or屋号','SELECT',false,0,'STATIC',NULL,'["法人","屋号","未"]',CURRENT_TIMESTAMP),
  (gen_random_uuid(),'APPOINTMENT','outOfScope','対象外確認','SELECT',false,0,'STATIC',NULL,'["済","未"]',CURRENT_TIMESTAMP),
  (gen_random_uuid(),'APPOINTMENT','pointsJuryo','地点数(従量)','TEXT',false,0,'NONE',NULL,'[]',CURRENT_TIMESTAMP),
  (gen_random_uuid(),'APPOINTMENT','pointsDoryoku','地点数(動力)','TEXT',false,0,'NONE',NULL,'[]',CURRENT_TIMESTAMP),
  (gen_random_uuid(),'APPOINTMENT','proposal','提案','SELECT',false,0,'STATIC',NULL,'["店舗","自宅","事務所","その他"]',CURRENT_TIMESTAMP),
  (gen_random_uuid(),'APPOINTMENT','smsTo','SMS送付番号(orメアド)','TEXT',false,0,'NONE',NULL,'[]',CURRENT_TIMESTAMP),
  (gen_random_uuid(),'APPOINTMENT','storeHp','店舗HPのURL','TEXT',false,0,'NONE',NULL,'[]',CURRENT_TIMESTAMP);

-- 並び順(アポ詳細FMTの並び)
UPDATE "TossFormField" f SET "order" = v.ord
  FROM (VALUES
    ('department',10),('acquisitionAngle',20),('hook',30),('nextActionAt',40),('meetingStartAt',50),('preContactAt',60),
    ('corporateName',70),('address',80),('industry',90),('phone',100),('mobilePhone',110),
    ('contactName',120),('contactAge',130),('contactGender',140),('existingContract',150),
    ('apStaffName',160),('preConfirmStaffName',170),('charge',180),('billPrep',190),('corporateType',200),('outOfScope',210),
    ('pointsJuryo',220),('pointsDoryoku',230),('proposal',240),('listName',250),('smsTo',260),('storeHp',270),('memo',280)
  ) AS v(key, ord)
  WHERE f."form" = 'APPOINTMENT' AND f."targetKey" = v.key;
