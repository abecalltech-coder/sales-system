-- アポ登録(要望): 商談形式(フック)は HPZOOM / HP&訪問 / 遠隔 / 電気 のプルダウン、業種はテキスト入力に
-- (オンライン扱いは従来どおり HPZOOM のみ)
UPDATE "TossFormField"
  SET "label" = '商談形式', "fieldType" = 'SELECT', "optionsMode" = 'STATIC', "masterCategory" = NULL,
      "staticOptions" = '["HPZOOM","HP&訪問","遠隔","電気"]', "updatedAt" = CURRENT_TIMESTAMP
  WHERE "form" = 'APPOINTMENT' AND "targetKey" = 'hook';
UPDATE "TossFormField"
  SET "fieldType" = 'TEXT', "optionsMode" = 'NONE', "masterCategory" = NULL, "staticOptions" = '[]', "updatedAt" = CURRENT_TIMESTAMP
  WHERE "form" = 'APPOINTMENT' AND "targetKey" = 'industry';
