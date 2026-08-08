-- AlterTable
ALTER TABLE "Appointment" ADD COLUMN     "caseName" TEXT;

-- AlterTable
ALTER TABLE "Contract" ADD COLUMN     "caseName" TEXT;

-- AlterTable
ALTER TABLE "Entry" ADD COLUMN     "caseName" TEXT;

-- AlterTable
ALTER TABLE "TossCase" ADD COLUMN     "apStaffName" TEXT,
ADD COLUMN     "callDirection" TEXT,
ADD COLUMN     "callingByUserId" TEXT,
ADD COLUMN     "callingStartedAt" TIMESTAMP(3),
ADD COLUMN     "caseName" TEXT,
ADD COLUMN     "department" TEXT,
ADD COLUMN     "existingContract" TEXT,
ADD COLUMN     "hook" TEXT,
ADD COLUMN     "industry" TEXT,
ADD COLUMN     "isCallingInProgress" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "listName" TEXT,
ADD COLUMN     "nextActionAt" TIMESTAMP(3),
ADD COLUMN     "ngReasonStatusId" TEXT,
ADD COLUMN     "preConfirmStatusId" TEXT,
ADD COLUMN     "progressStatusId" TEXT,
ADD COLUMN     "proposal" TEXT;

-- AlterTable
ALTER TABLE "Visit" ADD COLUMN     "caseName" TEXT;
