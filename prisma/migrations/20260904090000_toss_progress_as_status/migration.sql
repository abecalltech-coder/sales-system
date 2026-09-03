-- トスの「ステータス」と「進捗」を一本化(要望)。進捗(TOSS_PROGRESS)で状況管理する。
-- 状況遷移に必要な値を進捗マスタへ追加。internalCode PROGRESS_APPOINTMENT は
-- トス→アポ詳細の自動生成トリガーに使う(変更不可)。
INSERT INTO "StatusMaster" ("id", "category", "internalCode", "displayName", "order", "active", "color") VALUES
  (gen_random_uuid(), 'TOSS_PROGRESS', 'PROGRESS_NEW',         '新規',   5,  true, '#ffffff'),
  (gen_random_uuid(), 'TOSS_PROGRESS', 'PROGRESS_PROSPECT',    '見込み', 15, true, '#fef9c3'),
  (gen_random_uuid(), 'TOSS_PROGRESS', 'PROGRESS_APPOINTMENT', 'アポイント', 20, true, '#fecaca'),
  (gen_random_uuid(), 'TOSS_PROGRESS', 'PROGRESS_EXCLUDED',    '対象外', 90, true, '#e5e7eb')
ON CONFLICT ("category", "internalCode") DO NOTHING;
