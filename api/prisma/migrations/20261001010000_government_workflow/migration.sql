-- AlterTable
ALTER TABLE "User" ADD COLUMN     "clearance" "Clearance",
ADD COLUMN     "permissionVersion" INTEGER NOT NULL DEFAULT 0,
ALTER COLUMN "role" SET DEFAULT 'VIEWER';

-- AlterTable
ALTER TABLE "AccountInvite" ADD COLUMN     "clearance" "Clearance",
ALTER COLUMN "role" SET DEFAULT 'VIEWER';

-- AlterTable
ALTER TABLE "Category" ADD COLUMN     "accessLevel" "AccessLevel",
ADD COLUMN     "mainSlot" INTEGER;

-- AlterTable
ALTER TABLE "DataCollection" ALTER COLUMN "defaultAccessLevel" SET DEFAULT 'V4';

-- AlterTable
ALTER TABLE "DashboardWidget" ALTER COLUMN "accessLevel" SET DEFAULT 'V4';

-- AlterTable
ALTER TABLE "DataRecord" ALTER COLUMN "accessLevel" SET DEFAULT 'V4';

-- AlterTable
ALTER TABLE "ImportJob" ADD COLUMN     "accessLevel" "AccessLevel",
ADD COLUMN     "operationKey" TEXT;

-- AlterTable
ALTER TABLE "Document" ADD COLUMN     "operationKey" TEXT,
ALTER COLUMN "accessLevel" SET DEFAULT 'V4';

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "operationKey" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationRead" (
    "notificationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),

    CONSTRAINT "NotificationRead_pkey" PRIMARY KEY ("notificationId","userId")
);

-- CreateIndex
CREATE UNIQUE INDEX "Notification_operationKey_key" ON "Notification"("operationKey");

-- CreateIndex
CREATE INDEX "Notification_createdAt_id_idx" ON "Notification"("createdAt", "id");

-- CreateIndex
CREATE INDEX "NotificationRead_userId_readAt_idx" ON "NotificationRead"("userId", "readAt");

-- CreateIndex
CREATE UNIQUE INDEX "Category_mainSlot_key" ON "Category"("mainSlot");

-- CreateIndex
CREATE UNIQUE INDEX "ImportJob_operationKey_key" ON "ImportJob"("operationKey");

-- CreateIndex
CREATE UNIQUE INDEX "Document_operationKey_key" ON "Document"("operationKey");

-- AddForeignKey
ALTER TABLE "NotificationRead" ADD CONSTRAINT "NotificationRead_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "Notification"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationRead" ADD CONSTRAINT "NotificationRead_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Existing folders deliberately remain NULL until explicitly mapped.
ALTER TABLE "Category" ALTER COLUMN "accessLevel" SET DEFAULT 'V4';
ALTER TABLE "Category" ADD CONSTRAINT "Category_main_slot_shape" CHECK ("mainSlot" IS NULL OR ("mainSlot" BETWEEN 1 AND 6 AND "parentId" IS NULL AND "archivedAt" IS NULL));
ALTER TABLE "User" ADD CONSTRAINT "User_clearance_shape" CHECK ("clearance" IS NULL OR ("role" = 'ADMIN' AND "clearance" IN ('V1','V2','V3')) OR "role" = 'VIEWER');
ALTER TABLE "AccountInvite" ADD CONSTRAINT "Invite_clearance_shape" CHECK ("clearance" IS NULL OR ("role" = 'ADMIN' AND "clearance" IN ('V1','V2','V3')) OR "role" = 'VIEWER');

-- A new installation receives six stable roots. Populated installations are untouched.
INSERT INTO "Category" (id, name, "sortOrder", "mainSlot", "accessLevel", "createdAt", "updatedAt")
SELECT 'cmainfolder00000000000000' || n, 'Main Folder ' || n, n, n, 'V4', now(), now()
FROM generate_series(1,6) n WHERE NOT EXISTS (SELECT 1 FROM "Category");

CREATE FUNCTION protect_workflow_roots() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD."parentId" IS NULL OR OLD."mainSlot" IS NOT NULL THEN RAISE EXCEPTION 'Main folders cannot be deleted'; END IF;
    RETURN OLD;
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW."parentId" IS NULL AND NEW."mainSlot" IS NULL THEN RAISE EXCEPTION 'Additional root folders are prohibited'; END IF;
  ELSE
    IF OLD."parentId" IS NULL AND (NEW."parentId" IS NOT NULL OR NEW."archivedAt" IS NOT NULL) THEN RAISE EXCEPTION 'Root folders are protected'; END IF;
    IF OLD."parentId" IS NOT NULL AND NEW."parentId" IS NULL THEN RAISE EXCEPTION 'A child cannot become a root'; END IF;
    IF OLD."mainSlot" IS NOT NULL AND NEW."mainSlot" IS DISTINCT FROM OLD."mainSlot" THEN RAISE EXCEPTION 'Main folder identities are immutable'; END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "Category_protect_roots" BEFORE INSERT OR UPDATE OR DELETE ON "Category" FOR EACH ROW EXECUTE FUNCTION protect_workflow_roots();
CREATE INDEX "Category_accessLevel_archivedAt_idx" ON "Category"("accessLevel", "archivedAt");
CREATE INDEX "User_clearance_isActive_idx" ON "User"("clearance", "isActive");
