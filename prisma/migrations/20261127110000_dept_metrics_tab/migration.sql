-- 新しいタブ「部署数値」を、タブを絞っている役職にも表示する(サマリー=役割別数値が見られる役職にそろえる)。
UPDATE "Role"
  SET "visibleTabs" = "visibleTabs" || '["/dept-metrics"]'::jsonb
  WHERE "visibleTabs" IS NOT NULL AND jsonb_typeof("visibleTabs") = 'array'
    AND "visibleTabs" @> '["/summary"]'::jsonb
    AND NOT ("visibleTabs" @> '["/dept-metrics"]'::jsonb);
