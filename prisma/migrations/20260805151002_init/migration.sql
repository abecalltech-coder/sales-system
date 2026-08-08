-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'RETIRED');

-- CreateEnum
CREATE TYPE "ViewMode" AS ENUM ('AUTO', 'MOBILE', 'PC');

-- CreateEnum
CREATE TYPE "MeetingType" AS ENUM ('VISIT', 'GOOGLE_MEET', 'PHONE', 'OTHER');

-- CreateEnum
CREATE TYPE "SyncStatus" AS ENUM ('NOT_SYNCED', 'SYNCING', 'SYNCED', 'ERROR');

-- CreateTable
CREATE TABLE "Company" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Department" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Department_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Team" (
    "id" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Team_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "employeeCode" TEXT,
    "name" TEXT NOT NULL,
    "departmentId" TEXT,
    "teamId" TEXT,
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "hiredAt" TIMESTAMP(3),
    "retiredAt" TIMESTAMP(3),
    "iconUrl" TEXT,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "preferredViewMode" "ViewMode" NOT NULL DEFAULT 'AUTO',
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT true,
    "failedLoginCount" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Role" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Permission" (
    "id" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "scope" TEXT NOT NULL,

    CONSTRAINT "Permission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserRole" (
    "userId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,

    CONSTRAINT "UserRole_pkey" PRIMARY KEY ("userId","roleId")
);

-- CreateTable
CREATE TABLE "RefreshToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "replacedBy" TEXT,
    "createdByIp" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actorUserId" TEXT,
    "action" TEXT NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "targetType" TEXT,
    "targetId" TEXT,
    "before" JSONB,
    "after" JSONB,
    "success" BOOLEAN NOT NULL,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemSetting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,

    CONSTRAINT "SystemSetting_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "SequenceCounter" (
    "key" TEXT NOT NULL,
    "lastValue" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "SequenceCounter_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Source" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Source_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StatusMaster" (
    "id" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "internalCode" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "color" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "StatusMaster_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "corporateName" TEXT,
    "contactName" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "postalCode" TEXT,
    "address" TEXT,
    "building" TEXT,
    "memo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TossCase" (
    "id" TEXT NOT NULL,
    "caseNumber" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "googleFormResponseId" TEXT,
    "customerId" TEXT,
    "productId" TEXT,
    "sourceId" TEXT,
    "snapshotDepartmentId" TEXT,
    "snapshotTeamId" TEXT,
    "tossUserId" TEXT,
    "salesUserId" TEXT,
    "fieldSalesUserId" TEXT,
    "desiredAt" TIMESTAMP(3),
    "confirmedStartAt" TIMESTAMP(3),
    "confirmedEndAt" TIMESTAMP(3),
    "statusId" TEXT NOT NULL,
    "memo" TEXT,
    "tags" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "TossCase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Appointment" (
    "id" TEXT NOT NULL,
    "caseNumber" TEXT NOT NULL,
    "tossCaseId" TEXT,
    "customerId" TEXT,
    "snapshotDepartmentId" TEXT,
    "snapshotTeamId" TEXT,
    "apoUserId" TEXT,
    "meetingUserId" TEXT,
    "fieldSalesUserId" TEXT,
    "meetingStartAt" TIMESTAMP(3),
    "meetingEndAt" TIMESTAMP(3),
    "meetingType" "MeetingType" NOT NULL DEFAULT 'VISIT',
    "visitAddress" TEXT,
    "meetingUrl" TEXT,
    "googleCalendarEventId" TEXT,
    "calendarSyncStatus" "SyncStatus" NOT NULL DEFAULT 'NOT_SYNCED',
    "calendarSyncError" TEXT,
    "meetingStatusId" TEXT NOT NULL,
    "meetingResultId" TEXT,
    "nextActionAt" TIMESTAMP(3),
    "memo" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Appointment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Visit" (
    "id" TEXT NOT NULL,
    "caseNumber" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "visitKind" TEXT NOT NULL DEFAULT 'INITIAL',
    "fieldSalesUserId" TEXT,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "statusId" TEXT NOT NULL,
    "destinationLatitude" DOUBLE PRECISION,
    "destinationLongitude" DOUBLE PRECISION,
    "departedAt" TIMESTAMP(3),
    "arrivedAt" TIMESTAMP(3),
    "arrivedByUserId" TEXT,
    "arrivedLatitude" DOUBLE PRECISION,
    "arrivedLongitude" DOUBLE PRECISION,
    "arrivedAccuracy" DOUBLE PRECISION,
    "arrivedDistanceFromDestination" DOUBLE PRECISION,
    "arrivedDeviceInfo" TEXT,
    "arrivedIpAddress" TEXT,
    "arrivedComment" TEXT,
    "locationPermissionStatus" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Visit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VisitStatusHistory" (
    "id" TEXT NOT NULL,
    "visitId" TEXT NOT NULL,
    "fromStatusId" TEXT,
    "toStatusId" TEXT NOT NULL,
    "changedBy" TEXT,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VisitStatusHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MeetingSession" (
    "id" TEXT NOT NULL,
    "visitId" TEXT NOT NULL,
    "meetingStartedAt" TIMESTAMP(3),
    "meetingStartedByUserId" TEXT,
    "meetingStartLatitude" DOUBLE PRECISION,
    "meetingStartLongitude" DOUBLE PRECISION,
    "waitingMinutes" INTEGER,
    "meetingEndedAt" TIMESTAMP(3),
    "meetingEndedByUserId" TEXT,
    "meetingDurationMinutes" INTEGER,
    "meetingResult" TEXT,
    "nextAction" TEXT,
    "nextActionDate" TIMESTAMP(3),
    "nextVisitAt" TIMESTAMP(3),
    "meetingMemo" TEXT,
    "customerNeeds" TEXT,
    "rejectionReason" TEXT,
    "estimatedContractProbability" INTEGER,
    "contractExpectedDate" TIMESTAMP(3),
    "meetingEndLatitude" DOUBLE PRECISION,
    "meetingEndLongitude" DOUBLE PRECISION,

    CONSTRAINT "MeetingSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contract" (
    "id" TEXT NOT NULL,
    "caseNumber" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "tossCaseId" TEXT,
    "contractUserId" TEXT,
    "contractedAt" TIMESTAMP(3),
    "contractAmount" DECIMAL(12,2),
    "revenueForecast" DECIMAL(12,2),
    "feeForecast" DECIMAL(12,2),
    "contractNumber" TEXT,
    "applicationNumber" TEXT,
    "matchingStatusId" TEXT NOT NULL,
    "matchingAt" TIMESTAMP(3),
    "switchingScheduledAt" TIMESTAMP(3),
    "switchingAt" TIMESTAMP(3),
    "entryStatusId" TEXT,
    "entryAt" TIMESTAMP(3),
    "deficiencyNote" TEXT,
    "nextActionAt" TIMESTAMP(3),
    "memo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Contract_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Entry" (
    "id" TEXT NOT NULL,
    "caseNumber" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "entryUserId" TEXT,
    "entryAt" TIMESTAMP(3),
    "statusId" TEXT NOT NULL,
    "applicationNumber" TEXT,
    "deficiencyNote" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "memo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Entry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CaseComment" (
    "id" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CaseComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CaseHistory" (
    "id" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "changedBy" TEXT,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CaseHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CaseAttachment" (
    "id" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "uploadedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CaseAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomFieldDefinition" (
    "id" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "fieldKey" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "dataType" TEXT NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "defaultValue" TEXT,
    "placeholder" TEXT,
    "validationRule" JSONB,
    "showInList" BOOLEAN NOT NULL DEFAULT false,
    "showInDetail" BOOLEAN NOT NULL DEFAULT true,
    "showInCreate" BOOLEAN NOT NULL DEFAULT true,
    "showInEdit" BOOLEAN NOT NULL DEFAULT true,
    "searchable" BOOLEAN NOT NULL DEFAULT false,
    "filterable" BOOLEAN NOT NULL DEFAULT false,
    "csvExportable" BOOLEAN NOT NULL DEFAULT true,
    "csvImportable" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "CustomFieldDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomFieldOption" (
    "id" TEXT NOT NULL,
    "fieldId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "CustomFieldOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomFieldValue" (
    "id" TEXT NOT NULL,
    "fieldId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "textValue" TEXT,
    "numberValue" DECIMAL(18,4),
    "dateValue" TIMESTAMP(3),
    "dateTimeValue" TIMESTAMP(3),
    "booleanValue" BOOLEAN,
    "jsonValue" JSONB,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomFieldValue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomFieldPermission" (
    "id" TEXT NOT NULL,
    "fieldId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "canView" BOOLEAN NOT NULL DEFAULT true,
    "canEdit" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "CustomFieldPermission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StatusAutomationRule" (
    "id" TEXT NOT NULL,
    "statusMasterId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "config" JSONB NOT NULL DEFAULT '{}',
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "StatusAutomationRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LocationRecord" (
    "id" TEXT NOT NULL,
    "visitId" TEXT,
    "eventType" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "accuracy" DOUBLE PRECISION,
    "userId" TEXT,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LocationRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OfflineAction" (
    "id" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "actionType" TEXT NOT NULL,
    "targetEntityId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "errorMessage" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "syncedAt" TIMESTAMP(3),

    CONSTRAINT "OfflineAction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Department_companyId_idx" ON "Department"("companyId");

-- CreateIndex
CREATE INDEX "Team_departmentId_idx" ON "Team"("departmentId");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_employeeCode_key" ON "User"("employeeCode");

-- CreateIndex
CREATE INDEX "User_departmentId_idx" ON "User"("departmentId");

-- CreateIndex
CREATE INDEX "User_teamId_idx" ON "User"("teamId");

-- CreateIndex
CREATE UNIQUE INDEX "Role_code_key" ON "Role"("code");

-- CreateIndex
CREATE INDEX "Permission_roleId_idx" ON "Permission"("roleId");

-- CreateIndex
CREATE UNIQUE INDEX "Permission_roleId_resource_action_key" ON "Permission"("roleId", "resource", "action");

-- CreateIndex
CREATE UNIQUE INDEX "RefreshToken_tokenHash_key" ON "RefreshToken"("tokenHash");

-- CreateIndex
CREATE INDEX "RefreshToken_userId_idx" ON "RefreshToken"("userId");

-- CreateIndex
CREATE INDEX "AuditLog_actorUserId_idx" ON "AuditLog"("actorUserId");

-- CreateIndex
CREATE INDEX "AuditLog_targetType_targetId_idx" ON "AuditLog"("targetType", "targetId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "StatusMaster_category_idx" ON "StatusMaster"("category");

-- CreateIndex
CREATE UNIQUE INDEX "StatusMaster_category_internalCode_key" ON "StatusMaster"("category", "internalCode");

-- CreateIndex
CREATE INDEX "Customer_phone_idx" ON "Customer"("phone");

-- CreateIndex
CREATE INDEX "Customer_email_idx" ON "Customer"("email");

-- CreateIndex
CREATE INDEX "Customer_corporateName_idx" ON "Customer"("corporateName");

-- CreateIndex
CREATE UNIQUE INDEX "TossCase_caseNumber_key" ON "TossCase"("caseNumber");

-- CreateIndex
CREATE INDEX "TossCase_statusId_idx" ON "TossCase"("statusId");

-- CreateIndex
CREATE INDEX "TossCase_tossUserId_idx" ON "TossCase"("tossUserId");

-- CreateIndex
CREATE INDEX "TossCase_salesUserId_idx" ON "TossCase"("salesUserId");

-- CreateIndex
CREATE INDEX "TossCase_snapshotDepartmentId_idx" ON "TossCase"("snapshotDepartmentId");

-- CreateIndex
CREATE INDEX "TossCase_snapshotTeamId_idx" ON "TossCase"("snapshotTeamId");

-- CreateIndex
CREATE INDEX "TossCase_receivedAt_idx" ON "TossCase"("receivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Appointment_caseNumber_key" ON "Appointment"("caseNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Appointment_tossCaseId_key" ON "Appointment"("tossCaseId");

-- CreateIndex
CREATE UNIQUE INDEX "Appointment_idempotencyKey_key" ON "Appointment"("idempotencyKey");

-- CreateIndex
CREATE INDEX "Appointment_meetingStatusId_idx" ON "Appointment"("meetingStatusId");

-- CreateIndex
CREATE INDEX "Appointment_apoUserId_idx" ON "Appointment"("apoUserId");

-- CreateIndex
CREATE INDEX "Appointment_meetingStartAt_idx" ON "Appointment"("meetingStartAt");

-- CreateIndex
CREATE INDEX "Appointment_snapshotDepartmentId_idx" ON "Appointment"("snapshotDepartmentId");

-- CreateIndex
CREATE INDEX "Appointment_snapshotTeamId_idx" ON "Appointment"("snapshotTeamId");

-- CreateIndex
CREATE UNIQUE INDEX "Visit_caseNumber_key" ON "Visit"("caseNumber");

-- CreateIndex
CREATE INDEX "Visit_appointmentId_idx" ON "Visit"("appointmentId");

-- CreateIndex
CREATE INDEX "Visit_statusId_idx" ON "Visit"("statusId");

-- CreateIndex
CREATE INDEX "Visit_fieldSalesUserId_idx" ON "Visit"("fieldSalesUserId");

-- CreateIndex
CREATE INDEX "Visit_scheduledAt_idx" ON "Visit"("scheduledAt");

-- CreateIndex
CREATE INDEX "VisitStatusHistory_visitId_idx" ON "VisitStatusHistory"("visitId");

-- CreateIndex
CREATE UNIQUE INDEX "MeetingSession_visitId_key" ON "MeetingSession"("visitId");

-- CreateIndex
CREATE UNIQUE INDEX "Contract_caseNumber_key" ON "Contract"("caseNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Contract_appointmentId_key" ON "Contract"("appointmentId");

-- CreateIndex
CREATE INDEX "Contract_matchingStatusId_idx" ON "Contract"("matchingStatusId");

-- CreateIndex
CREATE INDEX "Contract_contractUserId_idx" ON "Contract"("contractUserId");

-- CreateIndex
CREATE INDEX "Contract_contractedAt_idx" ON "Contract"("contractedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Entry_caseNumber_key" ON "Entry"("caseNumber");

-- CreateIndex
CREATE INDEX "Entry_contractId_idx" ON "Entry"("contractId");

-- CreateIndex
CREATE INDEX "Entry_statusId_idx" ON "Entry"("statusId");

-- CreateIndex
CREATE INDEX "CaseComment_entityType_entityId_idx" ON "CaseComment"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "CaseHistory_entityType_entityId_idx" ON "CaseHistory"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "CaseAttachment_entityType_entityId_idx" ON "CaseAttachment"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "CustomFieldDefinition_entityType_idx" ON "CustomFieldDefinition"("entityType");

-- CreateIndex
CREATE UNIQUE INDEX "CustomFieldDefinition_entityType_fieldKey_key" ON "CustomFieldDefinition"("entityType", "fieldKey");

-- CreateIndex
CREATE INDEX "CustomFieldOption_fieldId_idx" ON "CustomFieldOption"("fieldId");

-- CreateIndex
CREATE INDEX "CustomFieldValue_entityType_entityId_idx" ON "CustomFieldValue"("entityType", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "CustomFieldValue_fieldId_entityId_key" ON "CustomFieldValue"("fieldId", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "CustomFieldPermission_fieldId_roleId_key" ON "CustomFieldPermission"("fieldId", "roleId");

-- CreateIndex
CREATE INDEX "StatusAutomationRule_statusMasterId_idx" ON "StatusAutomationRule"("statusMasterId");

-- CreateIndex
CREATE INDEX "LocationRecord_visitId_idx" ON "LocationRecord"("visitId");

-- CreateIndex
CREATE UNIQUE INDEX "OfflineAction_idempotencyKey_key" ON "OfflineAction"("idempotencyKey");

-- CreateIndex
CREATE INDEX "OfflineAction_userId_idx" ON "OfflineAction"("userId");

-- CreateIndex
CREATE INDEX "OfflineAction_status_idx" ON "OfflineAction"("status");

-- AddForeignKey
ALTER TABLE "Department" ADD CONSTRAINT "Department_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Team" ADD CONSTRAINT "Team_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Permission" ADD CONSTRAINT "Permission_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TossCase" ADD CONSTRAINT "TossCase_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_tossCaseId_fkey" FOREIGN KEY ("tossCaseId") REFERENCES "TossCase"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Visit" ADD CONSTRAINT "Visit_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisitStatusHistory" ADD CONSTRAINT "VisitStatusHistory_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "Visit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingSession" ADD CONSTRAINT "MeetingSession_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "Visit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Entry" ADD CONSTRAINT "Entry_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomFieldOption" ADD CONSTRAINT "CustomFieldOption_fieldId_fkey" FOREIGN KEY ("fieldId") REFERENCES "CustomFieldDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomFieldPermission" ADD CONSTRAINT "CustomFieldPermission_fieldId_fkey" FOREIGN KEY ("fieldId") REFERENCES "CustomFieldDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;
