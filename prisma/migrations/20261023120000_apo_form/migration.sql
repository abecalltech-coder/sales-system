-- アポ登録フォーム(アポ詳細を単品で作る): トスフォームの項目テーブルをフォーム種別で分けて共用する
ALTER TABLE "TossFormField" ADD COLUMN "form" TEXT NOT NULL DEFAULT 'TOSS';

DROP INDEX IF EXISTS "TossFormField_order_idx";
CREATE INDEX "TossFormField_form_order_idx" ON "TossFormField"("form", "order");

-- 初期項目。管理タブ「アポフォーム設定」で編集できる
INSERT INTO "TossFormField" ("id","form","targetKey","label","fieldType","required","order","optionsMode","masterCategory","staticOptions","updatedAt") VALUES
  (gen_random_uuid(),'APPOINTMENT','department','部署','SELECT',true,10,'MASTER','DEPARTMENT_BRANCH','[]',CURRENT_TIMESTAMP),
  (gen_random_uuid(),'APPOINTMENT','hook','フック(商談形式)','SELECT',true,20,'MASTER','MEETING_FORMAT','[]',CURRENT_TIMESTAMP),
  (gen_random_uuid(),'APPOINTMENT','apStaffName','AP','SELECT',false,30,'USERS',NULL,'[]',CURRENT_TIMESTAMP),
  (gen_random_uuid(),'APPOINTMENT','preConfirmStaffName','前確者','SELECT',false,40,'MASTER','TOSS_PRE_CONFIRM','[]',CURRENT_TIMESTAMP),
  (gen_random_uuid(),'APPOINTMENT','closerName','CL','SELECT',false,50,'MASTER','APPOINTMENT_CLOSER','[]',CURRENT_TIMESTAMP),
  (gen_random_uuid(),'APPOINTMENT','corporateName','店舗名','TEXT',true,60,'NONE',NULL,'[]',CURRENT_TIMESTAMP),
  (gen_random_uuid(),'APPOINTMENT','phone','店舗連絡先','TEXT',false,70,'NONE',NULL,'[]',CURRENT_TIMESTAMP),
  (gen_random_uuid(),'APPOINTMENT','address','住所(都道府県から)','TEXT',false,80,'NONE',NULL,'[]',CURRENT_TIMESTAMP),
  (gen_random_uuid(),'APPOINTMENT','contactName','担当者名','TEXT',false,90,'NONE',NULL,'[]',CURRENT_TIMESTAMP),
  (gen_random_uuid(),'APPOINTMENT','industry','業種','SELECT',false,100,'MASTER','INDUSTRY','[]',CURRENT_TIMESTAMP),
  (gen_random_uuid(),'APPOINTMENT','listName','リスト','TEXT',false,110,'NONE',NULL,'[]',CURRENT_TIMESTAMP),
  (gen_random_uuid(),'APPOINTMENT','existingContract','電気会社(既契約)','TEXT',false,120,'NONE',NULL,'[]',CURRENT_TIMESTAMP),
  (gen_random_uuid(),'APPOINTMENT','meetingStartAt','商談日時','DATETIME',true,130,'NONE',NULL,'[]',CURRENT_TIMESTAMP),
  (gen_random_uuid(),'APPOINTMENT','preContactAt','前連日時','DATETIME',false,140,'NONE',NULL,'[]',CURRENT_TIMESTAMP),
  (gen_random_uuid(),'APPOINTMENT','memo','備考(アポ詳細の末尾に追記)','TEXTAREA',false,150,'NONE',NULL,'[]',CURRENT_TIMESTAMP);

-- タブを絞っている役職にも新しいタブを出す(トス登録が見える役職=アポ登録も見える、トスフォーム設定が見える役職=アポフォーム設定も見える)。
-- 以後はユーザー管理の「役職ごとのタブ表示」で外せる
UPDATE "Role" SET "visibleTabs" = "visibleTabs" || '["/appointments/new"]'::jsonb
  WHERE "visibleTabs" IS NOT NULL AND jsonb_typeof("visibleTabs") = 'array'
    AND "visibleTabs" ? '/toss/new' AND NOT ("visibleTabs" ? '/appointments/new');
UPDATE "Role" SET "visibleTabs" = "visibleTabs" || '["/admin/apo-form"]'::jsonb
  WHERE "visibleTabs" IS NOT NULL AND jsonb_typeof("visibleTabs") = 'array'
    AND "visibleTabs" ? '/admin/toss-form' AND NOT ("visibleTabs" ? '/admin/apo-form');
