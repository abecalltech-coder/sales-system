-- 申込情報/明細を役職ごとのタブ表示で出し入れできるようにする(要望)。
-- これまでは常に全員へ表示していたため、タブを絞っている役職にも今の見え方を保つよう表示に加えておく
-- (ユーザー管理でチェックを外せば非表示になる)。
UPDATE "Role"
  SET "visibleTabs" = "visibleTabs" || '["/application-sheets"]'::jsonb
  WHERE "visibleTabs" IS NOT NULL AND jsonb_typeof("visibleTabs") = 'array'
    AND NOT ("visibleTabs" @> '["/application-sheets"]'::jsonb);
