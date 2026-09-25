CREATE EXTENSION IF NOT EXISTS postgis;

CREATE INDEX "Stop_location_gist_idx"
  ON "Stop"
  USING GIST ((ST_SetSRID(ST_MakePoint("longitude", "latitude"), 4326)::geography));

ALTER TABLE "Stop"
  ADD CONSTRAINT "Stop_latitude_range_check" CHECK ("latitude" BETWEEN -90 AND 90),
  ADD CONSTRAINT "Stop_longitude_range_check" CHECK ("longitude" BETWEEN -180 AND 180);

ALTER TABLE "Vehicle"
  ADD CONSTRAINT "Vehicle_current_latitude_range_check" CHECK ("currentLatitude" IS NULL OR "currentLatitude" BETWEEN -90 AND 90),
  ADD CONSTRAINT "Vehicle_current_longitude_range_check" CHECK ("currentLongitude" IS NULL OR "currentLongitude" BETWEEN -180 AND 180);

ALTER TABLE "VehicleLocation"
  ADD CONSTRAINT "VehicleLocation_latitude_range_check" CHECK ("latitude" BETWEEN -90 AND 90),
  ADD CONSTRAINT "VehicleLocation_longitude_range_check" CHECK ("longitude" BETWEEN -180 AND 180),
  ADD CONSTRAINT "VehicleLocation_speed_nonnegative_check" CHECK ("speed" IS NULL OR "speed" >= 0),
  ADD CONSTRAINT "VehicleLocation_heading_range_check" CHECK ("heading" IS NULL OR "heading" BETWEEN 0 AND 360);

ALTER TABLE "RouteStop"
  ADD CONSTRAINT "RouteStop_stopOrder_positive_check" CHECK ("stopOrder" > 0);
