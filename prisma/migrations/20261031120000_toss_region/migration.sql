-- トス実績の「地域」(一括投入で取り込んだ値。住所から都道府県が取れないときの表示用)
ALTER TABLE "TossCase" ADD COLUMN "region" TEXT;
