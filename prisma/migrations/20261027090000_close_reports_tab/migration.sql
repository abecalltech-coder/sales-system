-- クローズ報告のタブを、タブを絞っている役職(管理者を含む)にも表示する(要望: タブが出ない)。
-- 役職ごとのタブ表示は「表示するタブの一覧」を保存しているため、後から増えたタブは一覧に足さないと出ない。
-- 見せたくない役職はユーザー管理でチェックを外せば非表示になる。
UPDATE "Role"
  SET "visibleTabs" = "visibleTabs" || '["/close-reports"]'::jsonb
  WHERE "visibleTabs" IS NOT NULL AND jsonb_typeof("visibleTabs") = 'array'
    AND NOT ("visibleTabs" @> '["/close-reports"]'::jsonb);
