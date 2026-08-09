-- DropForeignKey
ALTER TABLE "Entry" DROP CONSTRAINT "Entry_contractId_fkey";

-- AlterTable
ALTER TABLE "Contract" DROP COLUMN "entryAt",
DROP COLUMN "entryStatusId";

-- DropTable
DROP TABLE "Entry";

