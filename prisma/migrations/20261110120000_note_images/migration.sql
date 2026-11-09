-- メモ・稼働ルールに貼る画像(要望)
CREATE TABLE "NoteImage" (
    "id" TEXT NOT NULL,
    "ownerType" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "image" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "NoteImage_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "NoteImage_ownerType_ownerId_idx" ON "NoteImage"("ownerType", "ownerId");
