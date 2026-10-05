-- 役職ごとのタスク閲覧範囲(ユーザー管理で編集)。初期値はこれまでの決まりどおり
ALTER TABLE "Role" ADD COLUMN "taskView" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
UPDATE "Role" SET "taskView" = ARRAY['AP'] WHERE "code" IN ('AP_LEADER', 'CL');
UPDATE "Role" SET "taskView" = ARRAY['AP', 'DEPT'] WHERE "code" IN ('RESPONSIBLE', 'MANAGER');
UPDATE "Role" SET "taskView" = ARRAY['ALL'] WHERE "code" IN ('GENERAL_RESPONSIBLE', 'SUPER_ADMIN', 'ADMIN');
