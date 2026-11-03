-- タスク通知の取りこぼしを後から送る起点(要望: しばらく開かなくても、サーバーが止まっていても通知が来るように)。
-- 反映した時刻を入れ、これより前に過ぎた回は一斉に鳴らないよう送らない。これ以降は遅れても必ず送る。
INSERT INTO "SystemSetting" ("key", "value")
  VALUES ('taskNotifyCatchupFrom', to_jsonb(to_char(CURRENT_TIMESTAMP AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')))
  ON CONFLICT ("key") DO NOTHING;
