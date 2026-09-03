-- トス・アポ・エントリー共通の選択肢マスタ(要望: 同じ項目は全画面連動)。マスタ管理で追加削除可。
INSERT INTO "StatusMaster" ("id", "category", "internalCode", "displayName", "order", "active") VALUES
  (gen_random_uuid(), 'INDUSTRY', 'IND_1', '飲食', 10, true),
  (gen_random_uuid(), 'INDUSTRY', 'IND_2', '小売', 20, true),
  (gen_random_uuid(), 'INDUSTRY', 'IND_3', '美容・サロン', 30, true),
  (gen_random_uuid(), 'INDUSTRY', 'IND_4', '医療・クリニック', 40, true),
  (gen_random_uuid(), 'INDUSTRY', 'IND_5', '建設・不動産', 50, true),
  (gen_random_uuid(), 'INDUSTRY', 'IND_6', '製造', 60, true),
  (gen_random_uuid(), 'INDUSTRY', 'IND_7', 'サービス', 70, true),
  (gen_random_uuid(), 'INDUSTRY', 'IND_8', 'その他', 80, true),
  (gen_random_uuid(), 'EXISTING_CONTRACT', 'EC_1', '東京電力', 10, true),
  (gen_random_uuid(), 'EXISTING_CONTRACT', 'EC_2', '関西電力', 20, true),
  (gen_random_uuid(), 'EXISTING_CONTRACT', 'EC_3', '中部電力', 30, true),
  (gen_random_uuid(), 'EXISTING_CONTRACT', 'EC_4', 'その他新電力', 40, true),
  (gen_random_uuid(), 'EXISTING_CONTRACT', 'EC_5', 'なし', 50, true),
  (gen_random_uuid(), 'PROPOSAL_LOCATION', 'PL_1', '店舗', 10, true),
  (gen_random_uuid(), 'PROPOSAL_LOCATION', 'PL_2', '自宅', 20, true),
  (gen_random_uuid(), 'PROPOSAL_LOCATION', 'PL_3', '事務所', 30, true)
ON CONFLICT ("category", "internalCode") DO NOTHING;
