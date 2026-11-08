-- アウト返しのあとに戻るトーク(要望)。null はアウトが出たトークに戻る
ALTER TABLE "TalkOut" ADD COLUMN "returnStepId" TEXT;
