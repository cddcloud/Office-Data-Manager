-- CreateEnum
CREATE TYPE "Clearance" AS ENUM ('V1', 'V2', 'V3', 'V4');

-- AlterEnum
ALTER TYPE "UserRole" ADD VALUE 'VIEWER';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AccessLevel" ADD VALUE 'V1';
ALTER TYPE "AccessLevel" ADD VALUE 'V2';
ALTER TYPE "AccessLevel" ADD VALUE 'V3';
ALTER TYPE "AccessLevel" ADD VALUE 'V4';

