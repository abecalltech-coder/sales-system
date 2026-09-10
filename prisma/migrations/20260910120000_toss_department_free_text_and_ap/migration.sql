-- 要望:
--  - トス実績の「部署」はトスフォームの内容をそのまま反映する自由記述にする(プルダウン廃止)
--  - トスフォームの「トス担当者名」を「AP」に改称し、トス実績の AP 欄にも反映する
--  - 既存案件にも反映する

-- 1. 既存トス案件の department に StatusMaster.id が入っているものを表示名(テキスト)へ変換
UPDATE "TossCase" t
  SET "department" = sm."displayName"
  FROM "StatusMaster" sm
  WHERE t."department" = sm."id";

-- 2. AP 欄(apStaffName)が空でトス担当者(tossUserId)が設定されている案件へ、ユーザー名を反映
UPDATE "TossCase" t
  SET "apStaffName" = u."name"
  FROM "User" u
  WHERE t."tossUserId" = u."id"
    AND (t."apStaffName" IS NULL OR t."apStaffName" = '');

-- 3. トスフォームの項目ラベル「トス担当者名」→「AP」
UPDATE "TossFormField"
  SET "label" = 'AP'
  WHERE "targetKey" = 'tossUserName' AND "label" = 'トス担当者名';
