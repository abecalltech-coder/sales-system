-- よく出るアウト(要望: トークの下にはこれだけ表示し、他は「アウトを探す」にまとめる)。最初はどれも設定しない
ALTER TABLE "TalkOut" ADD COLUMN "pinned" BOOLEAN NOT NULL DEFAULT false;
