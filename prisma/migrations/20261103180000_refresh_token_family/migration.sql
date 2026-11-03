-- ログインを端末ごとの系列で管理する(要望: 複数端末で常時ログイン)。
-- 異常なトークンが届いても、その端末の系列だけ失効させ、他の端末はログインしたままにする。
ALTER TABLE "RefreshToken" ADD COLUMN "familyId" TEXT;
CREATE INDEX "RefreshToken_familyId_idx" ON "RefreshToken"("familyId");
-- 有効なトークンは今の端末ごとに別の系列にする(以降のローテーションで引き継がれる)
UPDATE "RefreshToken" SET "familyId" = "id" WHERE "revokedAt" IS NULL;
