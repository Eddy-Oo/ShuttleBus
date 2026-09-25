-- Close any duplicate active trips (keep the newest per vehicle) before enforcing uniqueness.
UPDATE "Trip" t
SET "status" = 'completed', "endedAt" = COALESCE(t."endedAt", CURRENT_TIMESTAMP)
WHERE t."status" = 'active'
  AND EXISTS (
    SELECT 1 FROM "Trip" newer
    WHERE newer."vehicleId" = t."vehicleId"
      AND newer."status" = 'active'
      AND (newer."startedAt" > t."startedAt" OR (newer."startedAt" = t."startedAt" AND newer."id" > t."id"))
  );

-- At most one active trip per vehicle. Replaces SERIALIZABLE isolation on trip start,
-- which caused false conflicts when different vehicles started trips concurrently.
CREATE UNIQUE INDEX "Trip_one_active_per_vehicle_idx" ON "Trip" ("vehicleId") WHERE "status" = 'active';
