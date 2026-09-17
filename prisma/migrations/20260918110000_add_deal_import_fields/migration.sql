-- 案件管理「一括投入」用に、既存の外部シートに合わせた項目を追加(要望)

INSERT INTO "DealField" ("id","fieldKey","label","dataType","order","updatedAt") VALUES
  (gen_random_uuid(),'visit_date','訪問日','DATE',210,CURRENT_TIMESTAMP),
  (gen_random_uuid(),'department','部署','TEXT',220,CURRENT_TIMESTAMP),
  (gen_random_uuid(),'shop_name','店舗名','TEXT',230,CURRENT_TIMESTAMP),
  (gen_random_uuid(),'mcok_date','MCOK日','DATE',240,CURRENT_TIMESTAMP);
