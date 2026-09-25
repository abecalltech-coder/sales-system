-- セルの太字(要望: 右クリックで太字)
ALTER TABLE "CellStyle" ALTER COLUMN "textColor" DROP NOT NULL;
ALTER TABLE "CellStyle" ADD COLUMN "bold" BOOLEAN NOT NULL DEFAULT false;
