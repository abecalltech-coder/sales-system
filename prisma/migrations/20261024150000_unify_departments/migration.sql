-- 組織の統一(要望): 会社 CH partners の下に CH東 / CH西 / CT東 / モバイル / クオリティ / バックヤード(この順)。
-- 部署は「組織管理」(Department)を正とし、マスタの部署(StatusMaster DEPARTMENT_BRANCH)は branchStatusId で紐づけて同期する。
-- 6部署以外は消さずに非表示(active=false)にする。旧「CT」は「CT東」へ改名して引き継ぐ。

ALTER TABLE "Department" ADD COLUMN "branchStatusId" TEXT;
CREATE UNIQUE INDEX "Department_branchStatusId_key" ON "Department"("branchStatusId");

-- 会社(1社構成)
UPDATE "Company" SET "name" = 'CH partners', "updatedAt" = CURRENT_TIMESTAMP;
INSERT INTO "Company" ("id", "name", "updatedAt")
  SELECT gen_random_uuid(), 'CH partners', CURRENT_TIMESTAMP WHERE NOT EXISTS (SELECT 1 FROM "Company");

CREATE TEMP TABLE "_dept_target" ("name" TEXT PRIMARY KEY, "ord" INT NOT NULL);
INSERT INTO "_dept_target" VALUES ('CH東', 1), ('CH西', 2), ('CT東', 3), ('モバイル', 4), ('クオリティ', 5), ('バックヤード', 6);

-- 旧「CT」→「CT東」(CT東が既にあれば改名しない)
UPDATE "StatusMaster" SET "displayName" = 'CT東'
  WHERE "category" = 'DEPARTMENT_BRANCH' AND btrim("displayName") = 'CT'
    AND NOT EXISTS (SELECT 1 FROM "StatusMaster" WHERE "category" = 'DEPARTMENT_BRANCH' AND btrim("displayName") = 'CT東');
UPDATE "Department" SET "name" = 'CT東', "version" = "version" + 1, "updatedAt" = CURRENT_TIMESTAMP
  WHERE btrim("name") = 'CT' AND NOT EXISTS (SELECT 1 FROM "Department" WHERE btrim("name") = 'CT東');

-- ---- 組織管理(Department) ----
INSERT INTO "Department" ("id", "companyId", "name", "order", "updatedAt")
  SELECT gen_random_uuid(), (SELECT "id" FROM "Company" ORDER BY "createdAt" LIMIT 1), t."name", t."ord", CURRENT_TIMESTAMP
  FROM "_dept_target" t
  WHERE NOT EXISTS (SELECT 1 FROM "Department" d WHERE btrim(d."name") = t."name");

-- 同名が複数あれば、有効・所属ユーザーが多い・古い順で1つを残す
CREATE TEMP TABLE "_dept_keep" AS
  SELECT DISTINCT ON (t."name") d."id", t."name", t."ord"
  FROM "_dept_target" t JOIN "Department" d ON btrim(d."name") = t."name"
  ORDER BY t."name", d."active" DESC, (SELECT count(*) FROM "User" u WHERE u."departmentId" = d."id") DESC, d."createdAt";

-- 同名の重複部署にいたユーザーは残す方へ寄せる
UPDATE "User" u SET "departmentId" = k."id", "teamId" = NULL
  FROM "Department" d, "_dept_keep" k
  WHERE u."departmentId" = d."id" AND btrim(d."name") = k."name" AND d."id" <> k."id";

UPDATE "Department" d SET "name" = k."name", "order" = k."ord", "active" = true, "version" = d."version" + 1, "updatedAt" = CURRENT_TIMESTAMP
  FROM "_dept_keep" k WHERE d."id" = k."id";
UPDATE "Department" SET "active" = false, "version" = "version" + 1, "updatedAt" = CURRENT_TIMESTAMP
  WHERE "active" = true AND "id" NOT IN (SELECT "id" FROM "_dept_keep");

-- ---- マスタの部署(StatusMaster DEPARTMENT_BRANCH) ----
INSERT INTO "StatusMaster" ("id", "category", "internalCode", "displayName", "order", "active")
  SELECT gen_random_uuid(), 'DEPARTMENT_BRANCH', 'DEPT_' || substr(md5(t."name"), 1, 10), t."name", t."ord", true
  FROM "_dept_target" t
  WHERE NOT EXISTS (SELECT 1 FROM "StatusMaster" s WHERE s."category" = 'DEPARTMENT_BRANCH' AND btrim(s."displayName") = t."name");

CREATE TEMP TABLE "_branch_keep" AS
  SELECT DISTINCT ON (t."name") s."id", t."name", t."ord"
  FROM "_dept_target" t JOIN "StatusMaster" s ON s."category" = 'DEPARTMENT_BRANCH' AND btrim(s."displayName") = t."name"
  ORDER BY t."name", s."active" DESC, s."order";

UPDATE "StatusMaster" s SET "displayName" = k."name", "order" = k."ord", "active" = true
  FROM "_branch_keep" k WHERE s."id" = k."id";
UPDATE "StatusMaster" SET "active" = false
  WHERE "category" = 'DEPARTMENT_BRANCH' AND "active" = true AND "id" NOT IN (SELECT "id" FROM "_branch_keep");

-- 紐づけ
UPDATE "Department" d SET "branchStatusId" = b."id"
  FROM "_dept_keep" k, "_branch_keep" b
  WHERE d."id" = k."id" AND b."name" = k."name";

DROP TABLE "_dept_target";
DROP TABLE "_dept_keep";
DROP TABLE "_branch_keep";
