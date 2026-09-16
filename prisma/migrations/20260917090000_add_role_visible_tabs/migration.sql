-- 役職ごとのタブ表示設定(ユーザー管理画面のチェックボックス設定)。
-- nullは「制限なし=全タブ表示」(既存ロールの挙動を変えないための既定値)。
ALTER TABLE "Role" ADD COLUMN "visibleTabs" JSONB;
