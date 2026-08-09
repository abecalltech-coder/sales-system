-- AlterTable
ALTER TABLE "Appointment" ADD COLUMN     "reminderEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "reminderMinutesBefore" INTEGER;

-- CreateTable
CREATE TABLE "AppointmentReportEvent" (
    "id" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "checkpoint" TEXT NOT NULL,
    "reportText" TEXT NOT NULL,
    "reportedByUserId" TEXT,
    "reportedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acknowledgedByUserId" TEXT,
    "acknowledgedAt" TIMESTAMP(3),

    CONSTRAINT "AppointmentReportEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AppointmentReportEvent_appointmentId_idx" ON "AppointmentReportEvent"("appointmentId");

-- CreateIndex
CREATE INDEX "AppointmentReportEvent_acknowledgedAt_idx" ON "AppointmentReportEvent"("acknowledgedAt");

-- AddForeignKey
ALTER TABLE "AppointmentReportEvent" ADD CONSTRAINT "AppointmentReportEvent_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
