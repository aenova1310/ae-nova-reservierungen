-- CreateEnum
CREATE TYPE "PlanCode" AS ENUM ('BASIC', 'PRO');

-- CreateEnum
CREATE TYPE "PlatformRole" AS ENUM ('USER', 'SUPER_ADMIN');

-- CreateEnum
CREATE TYPE "MemberRole" AS ENUM ('OWNER', 'STAFF');

-- CreateEnum
CREATE TYPE "RestaurantStatus" AS ENUM ('ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "AllocationMode" AS ENUM ('GUEST_CHOOSES_TABLE', 'AUTOMATIC');

-- CreateEnum
CREATE TYPE "ConfirmationMode" AS ENUM ('AUTOMATIC', 'MANUAL');

-- CreateEnum
CREATE TYPE "ThemeMode" AS ENUM ('LIGHT', 'DARK');

-- CreateEnum
CREATE TYPE "DepositType" AS ENUM ('PER_PERSON', 'FLAT');

-- CreateEnum
CREATE TYPE "TableShape" AS ENUM ('RECT', 'SQUARE', 'ROUND');

-- CreateEnum
CREATE TYPE "TableMediaKind" AS ENUM ('PHOTO', 'PANORAMA_360', 'VIDEO', 'MODEL_3D');

-- CreateEnum
CREATE TYPE "DateExceptionType" AS ENUM ('CLOSED', 'SPECIAL_HOURS');

-- CreateEnum
CREATE TYPE "ReservationStatus" AS ENUM ('PENDING_PAYMENT', 'REQUESTED', 'CONFIRMED', 'ARRIVED', 'NO_SHOW', 'CANCELLED', 'EXPIRED', 'DECLINED');

-- CreateEnum
CREATE TYPE "ReservationSource" AS ENUM ('ONLINE', 'PHONE', 'WALK_IN', 'ADMIN');

-- CreateEnum
CREATE TYPE "CancelledBy" AS ENUM ('GUEST', 'RESTAURANT', 'SYSTEM');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'EXPIRED', 'REFUNDED', 'PARTIALLY_REFUNDED', 'FORFEITED');

-- CreateEnum
CREATE TYPE "EmailType" AS ENUM ('RESERVATION_CONFIRMED', 'RESERVATION_MODIFIED', 'RESERVATION_REQUESTED', 'RESERVATION_DECLINED', 'RESERVATION_CANCELLED_GUEST', 'RESERVATION_CANCELLED_RESTAURANT', 'RESERVATION_REMINDER', 'RESTAURANT_NEW_RESERVATION', 'RESTAURANT_RESERVATION_MODIFIED', 'RESTAURANT_CANCELLATION', 'PAYMENT_REFUNDED', 'STAFF_INVITATION', 'PASSWORD_RESET');

-- CreateEnum
CREATE TYPE "EmailStatus" AS ENUM ('QUEUED', 'SENT', 'FAILED');

-- CreateEnum
CREATE TYPE "PrivacyRequestType" AS ENUM ('EXPORT', 'DELETE');

-- CreateTable
CREATE TABLE "plans" (
    "code" "PlanCode" NOT NULL,
    "name" TEXT NOT NULL,
    "priceMonthlyCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'eur',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plans_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "passwordHash" TEXT NOT NULL,
    "platformRole" "PlatformRole" NOT NULL DEFAULT 'USER',
    "emailVerified" TIMESTAMP(3),
    "disabledAt" TIMESTAMP(3),
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userAgent" TEXT,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "password_reset_tokens" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organizations" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "memberships" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "role" "MemberRole" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invitations" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "MemberRole" NOT NULL DEFAULT 'STAFF',
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invitations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "restaurants" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "RestaurantStatus" NOT NULL DEFAULT 'ACTIVE',
    "planCode" "PlanCode" NOT NULL DEFAULT 'BASIC',
    "timezone" TEXT NOT NULL DEFAULT 'Europe/Berlin',
    "defaultLocale" TEXT NOT NULL DEFAULT 'de',
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "street" TEXT,
    "postalCode" TEXT,
    "city" TEXT,
    "country" TEXT NOT NULL DEFAULT 'DE',
    "websiteUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "restaurants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "restaurant_settings" (
    "restaurantId" TEXT NOT NULL,
    "allocationMode" "AllocationMode" NOT NULL DEFAULT 'AUTOMATIC',
    "confirmationMode" "ConfirmationMode" NOT NULL DEFAULT 'AUTOMATIC',
    "slotIntervalMinutes" INTEGER NOT NULL DEFAULT 15,
    "bufferMinutes" INTEGER NOT NULL DEFAULT 0,
    "defaultDurationMinutes" INTEGER NOT NULL DEFAULT 120,
    "minPartySize" INTEGER NOT NULL DEFAULT 1,
    "maxPartySizeOnline" INTEGER NOT NULL DEFAULT 8,
    "minLeadTimeMinutes" INTEGER NOT NULL DEFAULT 60,
    "maxAdvanceDays" INTEGER NOT NULL DEFAULT 90,
    "onlineQuotaPercent" INTEGER NOT NULL DEFAULT 100,
    "depositEnabled" BOOLEAN NOT NULL DEFAULT false,
    "depositMinPartySize" INTEGER NOT NULL DEFAULT 6,
    "depositType" "DepositType" NOT NULL DEFAULT 'PER_PERSON',
    "depositAmountCents" INTEGER NOT NULL DEFAULT 0,
    "cancellationWindowHours" INTEGER NOT NULL DEFAULT 24,
    "paymentHoldMinutes" INTEGER NOT NULL DEFAULT 15,
    "privacyNoticeDe" TEXT,
    "privacyNoticeEn" TEXT,
    "privacyPolicyUrl" TEXT,
    "privacyNoticeVersion" INTEGER NOT NULL DEFAULT 1,
    "anonymizeAfterDays" INTEGER NOT NULL DEFAULT 180,
    "reminderEnabled" BOOLEAN NOT NULL DEFAULT true,
    "reminderHoursBefore" INTEGER NOT NULL DEFAULT 24,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "restaurant_settings_pkey" PRIMARY KEY ("restaurantId")
);

-- CreateTable
CREATE TABLE "brandings" (
    "restaurantId" TEXT NOT NULL,
    "logoKey" TEXT,
    "primaryColor" TEXT NOT NULL DEFAULT '#6B1E2E',
    "fontFamily" TEXT NOT NULL DEFAULT 'serif-classic',
    "themeMode" "ThemeMode" NOT NULL DEFAULT 'LIGHT',
    "cornerStyle" TEXT NOT NULL DEFAULT 'soft',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "brandings_pkey" PRIMARY KEY ("restaurantId")
);

-- CreateTable
CREATE TABLE "areas" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameEn" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "onlineBookable" BOOLEAN NOT NULL DEFAULT true,
    "planX" INTEGER NOT NULL DEFAULT 0,
    "planY" INTEGER NOT NULL DEFAULT 0,
    "planWidth" INTEGER NOT NULL DEFAULT 800,
    "planHeight" INTEGER NOT NULL DEFAULT 600,
    "planColor" TEXT,

    CONSTRAINT "areas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tables" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "areaId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "minCapacity" INTEGER NOT NULL DEFAULT 1,
    "maxCapacity" INTEGER NOT NULL,
    "onlineBookable" BOOLEAN NOT NULL DEFAULT true,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "posX" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "posY" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "rotation" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "width" DOUBLE PRECISION NOT NULL DEFAULT 80,
    "height" DOUBLE PRECISION NOT NULL DEFAULT 80,
    "shape" "TableShape" NOT NULL DEFAULT 'RECT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tables_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "table_combinations" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "minCapacity" INTEGER NOT NULL,
    "maxCapacity" INTEGER NOT NULL,
    "onlineBookable" BOOLEAN NOT NULL DEFAULT true,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "table_combinations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "combination_tables" (
    "combinationId" TEXT NOT NULL,
    "tableId" TEXT NOT NULL,

    CONSTRAINT "combination_tables_pkey" PRIMARY KEY ("combinationId","tableId")
);

-- CreateTable
CREATE TABLE "table_media" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "tableId" TEXT NOT NULL,
    "kind" "TableMediaKind" NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "bytes" INTEGER,
    "altDe" TEXT,
    "altEn" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "table_media_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shifts" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "weekday" INTEGER NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "lastSeatingTime" TEXT,
    "slotIntervalMinutes" INTEGER,
    "validFrom" DATE,
    "validUntil" DATE,

    CONSTRAINT "shifts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "date_exceptions" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "type" "DateExceptionType" NOT NULL,
    "reason" TEXT,
    "startTime" TEXT,
    "endTime" TEXT,
    "lastSeatingTime" TEXT,

    CONSTRAINT "date_exceptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "duration_rules" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "minPartySize" INTEGER NOT NULL,
    "maxPartySize" INTEGER NOT NULL,
    "durationMinutes" INTEGER NOT NULL,

    CONSTRAINT "duration_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reservations" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "status" "ReservationStatus" NOT NULL,
    "source" "ReservationSource" NOT NULL,
    "partySize" INTEGER NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "areaPreferenceId" TEXT,
    "guestName" TEXT,
    "guestEmail" TEXT,
    "guestPhone" TEXT,
    "guestNotes" TEXT,
    "locale" TEXT NOT NULL DEFAULT 'de',
    "internalNotes" TEXT,
    "privacyConsentAt" TIMESTAMP(3),
    "privacyNoticeVersion" INTEGER,
    "manageTokenHash" TEXT,
    "tokenVersion" INTEGER NOT NULL DEFAULT 1,
    "icsSequence" INTEGER NOT NULL DEFAULT 0,
    "holdExpiresAt" TIMESTAMP(3),
    "confirmedAt" TIMESTAMP(3),
    "arrivedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancelledBy" "CancelledBy",
    "cancelReason" TEXT,
    "reminderSentAt" TIMESTAMP(3),
    "anonymizedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reservations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reservation_tables" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "reservationId" TEXT NOT NULL,
    "tableId" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "blockedUntil" TIMESTAMP(3) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "reservation_tables_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stripe_accounts" (
    "restaurantId" TEXT NOT NULL,
    "stripeAccountId" TEXT NOT NULL,
    "chargesEnabled" BOOLEAN NOT NULL DEFAULT false,
    "payoutsEnabled" BOOLEAN NOT NULL DEFAULT false,
    "detailsSubmitted" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stripe_accounts_pkey" PRIMARY KEY ("restaurantId")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "reservationId" TEXT NOT NULL,
    "stripeAccountId" TEXT NOT NULL,
    "checkoutSessionId" TEXT NOT NULL,
    "paymentIntentId" TEXT,
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'eur',
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "refundedCents" INTEGER NOT NULL DEFAULT 0,
    "cancellationWindowHours" INTEGER NOT NULL,
    "freeCancellationUntil" TIMESTAMP(3) NOT NULL,
    "paidAt" TIMESTAMP(3),
    "refundedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stripe_events" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stripe_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_logs" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT,
    "reservationId" TEXT,
    "type" "EmailType" NOT NULL,
    "status" "EmailStatus" NOT NULL DEFAULT 'QUEUED',
    "providerMessageId" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stats_daily" (
    "restaurantId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "reservations" INTEGER NOT NULL DEFAULT 0,
    "guests" INTEGER NOT NULL DEFAULT 0,
    "onlineReservations" INTEGER NOT NULL DEFAULT 0,
    "walkIns" INTEGER NOT NULL DEFAULT 0,
    "noShows" INTEGER NOT NULL DEFAULT 0,
    "cancellations" INTEGER NOT NULL DEFAULT 0,
    "depositsCents" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "stats_daily_pkey" PRIMARY KEY ("restaurantId","date")
);

-- CreateTable
CREATE TABLE "privacy_requests" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "type" "PrivacyRequestType" NOT NULL,
    "emailHash" TEXT NOT NULL,
    "affectedCount" INTEGER NOT NULL,
    "handledById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "privacy_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "entityId" TEXT,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_tokenHash_key" ON "sessions"("tokenHash");

-- CreateIndex
CREATE INDEX "sessions_userId_idx" ON "sessions"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "password_reset_tokens_tokenHash_key" ON "password_reset_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "memberships_organizationId_idx" ON "memberships"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "memberships_userId_organizationId_key" ON "memberships"("userId", "organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "invitations_tokenHash_key" ON "invitations"("tokenHash");

-- CreateIndex
CREATE INDEX "invitations_organizationId_idx" ON "invitations"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "restaurants_slug_key" ON "restaurants"("slug");

-- CreateIndex
CREATE INDEX "restaurants_organizationId_idx" ON "restaurants"("organizationId");

-- CreateIndex
CREATE INDEX "areas_restaurantId_idx" ON "areas"("restaurantId");

-- CreateIndex
CREATE UNIQUE INDEX "areas_restaurantId_name_key" ON "areas"("restaurantId", "name");

-- CreateIndex
CREATE INDEX "tables_restaurantId_areaId_idx" ON "tables"("restaurantId", "areaId");

-- CreateIndex
CREATE UNIQUE INDEX "tables_restaurantId_name_key" ON "tables"("restaurantId", "name");

-- CreateIndex
CREATE INDEX "table_combinations_restaurantId_idx" ON "table_combinations"("restaurantId");

-- CreateIndex
CREATE INDEX "combination_tables_tableId_idx" ON "combination_tables"("tableId");

-- CreateIndex
CREATE UNIQUE INDEX "table_media_tableId_key" ON "table_media"("tableId");

-- CreateIndex
CREATE INDEX "table_media_restaurantId_idx" ON "table_media"("restaurantId");

-- CreateIndex
CREATE INDEX "shifts_restaurantId_weekday_idx" ON "shifts"("restaurantId", "weekday");

-- CreateIndex
CREATE INDEX "date_exceptions_restaurantId_date_idx" ON "date_exceptions"("restaurantId", "date");

-- CreateIndex
CREATE INDEX "duration_rules_restaurantId_idx" ON "duration_rules"("restaurantId");

-- CreateIndex
CREATE UNIQUE INDEX "reservations_manageTokenHash_key" ON "reservations"("manageTokenHash");

-- CreateIndex
CREATE INDEX "reservations_restaurantId_startsAt_idx" ON "reservations"("restaurantId", "startsAt");

-- CreateIndex
CREATE INDEX "reservations_restaurantId_status_startsAt_idx" ON "reservations"("restaurantId", "status", "startsAt");

-- CreateIndex
CREATE INDEX "reservations_restaurantId_guestEmail_idx" ON "reservations"("restaurantId", "guestEmail");

-- CreateIndex
CREATE INDEX "reservations_status_holdExpiresAt_idx" ON "reservations"("status", "holdExpiresAt");

-- CreateIndex
CREATE INDEX "reservations_status_startsAt_reminderSentAt_idx" ON "reservations"("status", "startsAt", "reminderSentAt");

-- CreateIndex
CREATE INDEX "reservations_anonymizedAt_startsAt_idx" ON "reservations"("anonymizedAt", "startsAt");

-- CreateIndex
CREATE UNIQUE INDEX "reservations_restaurantId_code_key" ON "reservations"("restaurantId", "code");

-- CreateIndex
CREATE INDEX "reservation_tables_restaurantId_startsAt_idx" ON "reservation_tables"("restaurantId", "startsAt");

-- CreateIndex
CREATE INDEX "reservation_tables_tableId_startsAt_idx" ON "reservation_tables"("tableId", "startsAt");

-- CreateIndex
CREATE UNIQUE INDEX "reservation_tables_reservationId_tableId_key" ON "reservation_tables"("reservationId", "tableId");

-- CreateIndex
CREATE UNIQUE INDEX "stripe_accounts_stripeAccountId_key" ON "stripe_accounts"("stripeAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "payments_reservationId_key" ON "payments"("reservationId");

-- CreateIndex
CREATE UNIQUE INDEX "payments_checkoutSessionId_key" ON "payments"("checkoutSessionId");

-- CreateIndex
CREATE UNIQUE INDEX "payments_paymentIntentId_key" ON "payments"("paymentIntentId");

-- CreateIndex
CREATE INDEX "payments_restaurantId_status_idx" ON "payments"("restaurantId", "status");

-- CreateIndex
CREATE INDEX "email_logs_restaurantId_createdAt_idx" ON "email_logs"("restaurantId", "createdAt");

-- CreateIndex
CREATE INDEX "privacy_requests_restaurantId_idx" ON "privacy_requests"("restaurantId");

-- CreateIndex
CREATE INDEX "audit_logs_restaurantId_createdAt_idx" ON "audit_logs"("restaurantId", "createdAt");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "restaurants" ADD CONSTRAINT "restaurants_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "restaurants" ADD CONSTRAINT "restaurants_planCode_fkey" FOREIGN KEY ("planCode") REFERENCES "plans"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "restaurant_settings" ADD CONSTRAINT "restaurant_settings_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "brandings" ADD CONSTRAINT "brandings_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "areas" ADD CONSTRAINT "areas_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tables" ADD CONSTRAINT "tables_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tables" ADD CONSTRAINT "tables_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "areas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "table_combinations" ADD CONSTRAINT "table_combinations_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "combination_tables" ADD CONSTRAINT "combination_tables_combinationId_fkey" FOREIGN KEY ("combinationId") REFERENCES "table_combinations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "combination_tables" ADD CONSTRAINT "combination_tables_tableId_fkey" FOREIGN KEY ("tableId") REFERENCES "tables"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "table_media" ADD CONSTRAINT "table_media_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "table_media" ADD CONSTRAINT "table_media_tableId_fkey" FOREIGN KEY ("tableId") REFERENCES "tables"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "date_exceptions" ADD CONSTRAINT "date_exceptions_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "duration_rules" ADD CONSTRAINT "duration_rules_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservation_tables" ADD CONSTRAINT "reservation_tables_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservation_tables" ADD CONSTRAINT "reservation_tables_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "reservations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservation_tables" ADD CONSTRAINT "reservation_tables_tableId_fkey" FOREIGN KEY ("tableId") REFERENCES "tables"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stripe_accounts" ADD CONSTRAINT "stripe_accounts_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "reservations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_logs" ADD CONSTRAINT "email_logs_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_logs" ADD CONSTRAINT "email_logs_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "reservations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stats_daily" ADD CONSTRAINT "stats_daily_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "privacy_requests" ADD CONSTRAINT "privacy_requests_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ============================================================================
-- Doppelbuchungsschutz (von Prisma nicht abbildbar, daher handgeschrieben)
-- ============================================================================
-- Ein Tisch darf nie von zwei aktiven Belegungen mit überlappendem Zeitraum
-- belegt sein. Halboffenes Intervall [start, ende): Eine Buchung darf exakt
-- dort beginnen, wo die vorherige (inkl. Puffer) endet.
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "reservation_tables"
  ADD CONSTRAINT "reservation_tables_no_overlap"
  EXCLUDE USING gist (
    "tableId" WITH =,
    tsrange("startsAt", "blockedUntil", '[)') WITH &&
  ) WHERE ("active");

-- Plausibilitätsprüfungen
ALTER TABLE "reservation_tables"
  ADD CONSTRAINT "reservation_tables_range_valid" CHECK ("blockedUntil" > "startsAt");
ALTER TABLE "reservations"
  ADD CONSTRAINT "reservations_range_valid" CHECK ("endsAt" > "startsAt"),
  ADD CONSTRAINT "reservations_party_positive" CHECK ("partySize" > 0);
ALTER TABLE "tables"
  ADD CONSTRAINT "tables_capacity_valid" CHECK ("minCapacity" >= 1 AND "maxCapacity" >= "minCapacity");
ALTER TABLE "restaurant_settings"
  ADD CONSTRAINT "settings_quota_range" CHECK ("onlineQuotaPercent" BETWEEN 0 AND 100);
