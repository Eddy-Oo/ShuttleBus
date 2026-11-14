-- Add GPS source metadata to persisted vehicle locations.
ALTER TABLE "VehicleLocation"
  ADD COLUMN IF NOT EXISTS "source" VARCHAR(20),
  ADD COLUMN IF NOT EXISTS "deviceId" VARCHAR(100);

-- Support filtering and comparing measurements by source and device.
CREATE INDEX IF NOT EXISTS "VehicleLocation_source_deviceId_recordedAt_idx"
  ON "VehicleLocation" ("source", "deviceId", "recordedAt");
