-- アウト返しをベーストークの項目ごとに持つ(要望: 項目ごとに作成し、複数の項目を選んで作ったあとも項目ごとに別々に編集できる)。
ALTER TABLE "TalkOut" ADD COLUMN "stepId" TEXT;
CREATE INDEX "TalkOut_stepId_idx" ON "TalkOut"("stepId");

-- これまで複数の項目で共有していたアウトは、項目ごとの別々のアウトに分ける(内容は同じまま)。
-- 1つ目の項目は元のアウトをそのまま使い、2つ目以降は複製する。どの項目にも紐づいていないアウトはそのまま残す。
CREATE TEMP TABLE "_talk_pairs" AS
  SELECT s."id" AS "stepId", s."rank" AS "rank", o."id" AS "outId",
         row_number() OVER (PARTITION BY o."id" ORDER BY s."rank", s."order", s."createdAt") AS "rn"
  FROM "TalkStep" s
  CROSS JOIN LATERAL (SELECT DISTINCT unnest(s."outIds") AS "oid") x
  JOIN "TalkOut" o ON o."id" = x."oid"
  WHERE s."deletedAt" IS NULL AND o."deletedAt" IS NULL;

UPDATE "TalkOut" o SET "stepId" = p."stepId", "ranks" = ARRAY[p."rank"]
  FROM "_talk_pairs" p WHERE p."outId" = o."id" AND p."rn" = 1;

INSERT INTO "TalkOut" ("id", "stepId", "ranks", "label", "category", "body", "order", "createdBy", "updatedBy", "createdAt", "updatedAt")
  SELECT gen_random_uuid(), p."stepId", ARRAY[p."rank"], o."label", o."category", o."body", o."order", o."createdBy", o."updatedBy", o."createdAt", CURRENT_TIMESTAMP
  FROM "_talk_pairs" p JOIN "TalkOut" o ON o."id" = p."outId"
  WHERE p."rn" > 1;

DROP TABLE "_talk_pairs";
