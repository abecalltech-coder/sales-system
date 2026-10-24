-- アポ登録: 訪問(フックが HPZOOM 以外)のとき必須の「最寄り駅」「徒歩分数」(住所の次に並べる)。
-- 必須かどうかはフックで決まるため required は false のまま(画面・サーバーで判定)
INSERT INTO "TossFormField" ("id","form","targetKey","label","fieldType","required","order","optionsMode","masterCategory","staticOptions","updatedAt") VALUES
  (gen_random_uuid(),'APPOINTMENT','nearestStation','最寄り駅','TEXT',false,82,'NONE',NULL,'[]',CURRENT_TIMESTAMP),
  (gen_random_uuid(),'APPOINTMENT','walkMinutes','徒歩分数','TEXT',false,84,'NONE',NULL,'[]',CURRENT_TIMESTAMP);
