/*
  Warnings:

  - You are about to drop the column `rePreConfirmStatusId` on the `Appointment` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Appointment" DROP COLUMN "rePreConfirmStatusId";

-- AlterTable
ALTER TABLE "Contract" ADD COLUMN     "cancelledAt" TIMESTAMP(3),
ADD COLUMN     "terminatedAt" TIMESTAMP(3);
