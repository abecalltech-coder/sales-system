-- トークスクリプトの文字色・塗りつぶし(要望)。[{ t: 文字, c?: 文字色, b?: 塗りつぶし }] で持つ。null は色なし
ALTER TABLE "TalkStep" ADD COLUMN "nameRich" JSONB;
ALTER TABLE "TalkStep" ADD COLUMN "bodyRich" JSONB;
ALTER TABLE "TalkOut" ADD COLUMN "labelRich" JSONB;
ALTER TABLE "TalkOut" ADD COLUMN "bodyRich" JSONB;
