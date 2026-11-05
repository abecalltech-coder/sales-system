-- 未来日の実績を消す(要望: 実績は今日までの数字しか入れない。2026-11-05 JST 時点)
-- 部署ストーリーの日別のセルは前回の削除の対象外だった。週目標(w:)・月目標(m:)は残す
DELETE FROM "DepartmentStoryValue"
  WHERE "cell" LIKE 'd:%'
    AND substring("cell" from 3 for 10) > '2026-11-05';

-- 人員シートも念のためもう一度(前回の削除の直後、切り替え中の古いサーバーに保存された分があれば消す)
DELETE FROM "PersonalDailyStat"
  WHERE "metricKey" IN ('TOSS_UP', 'APPOINTMENT', 'MEETING', 'JUSETSU_OK', 'ET')
    AND "date" > '2026-11-05';
