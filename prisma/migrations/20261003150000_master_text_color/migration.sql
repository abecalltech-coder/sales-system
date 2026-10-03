-- マスタ管理: 選択肢ごとに文字色と行の塗りつぶし色を別々に設定する(要望)
ALTER TABLE "StatusMaster" ADD COLUMN "textColor" TEXT;
ALTER TABLE "DealFieldOption" ADD COLUMN "textColor" TEXT;
