-- 部署ストーリー(要望: 個人別数値に部署ごとの週・月で追うシート。数字は手入力)
CREATE TABLE "DepartmentStoryValue" (
    "id" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "cell" TEXT NOT NULL,
    "value" INTEGER NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DepartmentStoryValue_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DepartmentStoryValue_departmentId_month_cell_key" ON "DepartmentStoryValue"("departmentId", "month", "cell");
