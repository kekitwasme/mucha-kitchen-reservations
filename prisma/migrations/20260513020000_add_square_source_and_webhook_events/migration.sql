-- AlterEnum: Add 'square' to ReservationSource
ALTER TYPE "ReservationSource" ADD VALUE 'square';

-- CreateTable: WebhookEvent for idempotency
CREATE TABLE "WebhookEvent" (
    "id" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "processed" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: Unique constraint on eventId for idempotency
CREATE UNIQUE INDEX "WebhookEvent_eventId_key" ON "WebhookEvent"("eventId");

-- CreateIndex: Performance index on createdAt
CREATE INDEX "WebhookEvent_createdAt_idx" ON "WebhookEvent"("createdAt");