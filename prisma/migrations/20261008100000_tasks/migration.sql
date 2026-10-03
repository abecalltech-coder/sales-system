-- タスク(要望)
CREATE TABLE "Task" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "detail" TEXT,
    "targetAll" BOOLEAN NOT NULL DEFAULT false,
    "targetDepartmentIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "targetUserIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "dueAt" TIMESTAMP(3),
    "importance" INTEGER NOT NULL DEFAULT 3,
    "remindMinutes" INTEGER,
    "repeatType" TEXT NOT NULL DEFAULT 'NONE',
    "repeatInterval" INTEGER NOT NULL DEFAULT 1,
    "repeatWeekdays" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "repeatUntil" TIMESTAMP(3),
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Task_dueAt_idx" ON "Task"("dueAt");

CREATE TABLE "TaskProgress" (
    "taskId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "doneThrough" TIMESTAMP(3),
    "doneAt" TIMESTAMP(3),
    "snoozeUntil" TIMESTAMP(3),
    "lastNotifiedOccurrence" TIMESTAMP(3),
    "lastNotifiedAt" TIMESTAMP(3),
    CONSTRAINT "TaskProgress_pkey" PRIMARY KEY ("taskId","userId")
);
CREATE INDEX "TaskProgress_userId_idx" ON "TaskProgress"("userId");
ALTER TABLE "TaskProgress" ADD CONSTRAINT "TaskProgress_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
