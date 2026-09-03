-- 商談形式(=フック)マスタの初期投入。マスタ管理から追加・編集・削除できる。
INSERT INTO "StatusMaster" ("id", "category", "internalCode", "displayName", "order", "active") VALUES
  (gen_random_uuid(), 'MEETING_FORMAT', 'MF_HPZOOM',   'HPZOOM',  10, true),
  (gen_random_uuid(), 'MEETING_FORMAT', 'MF_SATSU_HOU', '撮＆訪',  20, true),
  (gen_random_uuid(), 'MEETING_FORMAT', 'MF_HP_HOU',   'HP＆訪',  30, true),
  (gen_random_uuid(), 'MEETING_FORMAT', 'MF_DENKI',    '電気フック', 40, true)
ON CONFLICT ("category", "internalCode") DO NOTHING;
