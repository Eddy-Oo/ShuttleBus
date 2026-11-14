# GPS source identification

Every row in `VehicleLocation` now stores `source` and `deviceId`.

| Device | Ingestion path | Stored source |
| --- | --- | --- |
| ESP32 GPS | `POST /api/vehicle/location` with a vehicle bearer token | `ESP32` |
| iPhone Flutter app | Existing authenticated Socket.IO event `vehicle:location:update` | `IPHONE` (default) |
| Browser simulator | Existing Socket.IO event, with explicit source fields | `SIMULATOR` |
| LoRaWAN / The Things Stack | `POST /api/lorawan/uplink` | `LORAWAN` |

## ESP32

The existing HTTP endpoint automatically saves `source = ESP32`. You may optionally send `deviceId` in the JSON body. If omitted, it uses `esp32-<vehicleId>`.

Example body:

```json
{
  "vehicleId": "rsu-shuttle-01",
  "latitude": 13.96581133,
  "longitude": 100.5862965,
  "speed": 2.7
}
```

## iPhone

The existing Socket.IO publisher does not need to change to be classified as `IPHONE`. If it does not send `source`, the backend defaults it to `IPHONE` and uses `iphone-<vehicleId>` as the device ID. The simulator explicitly sends `SIMULATOR`, so its records are not mixed with iPhone records.

## The Things Stack / LoRaWAN

Set these variables in the backend deployment environment:

- `LORAWAN_WEBHOOK_SECRET`: a long random secret.
- `LORAWAN_DEVICE_MAP`: JSON mapping The Things Stack `end_device_ids.device_id` to a ShuttleTrack vehicle ID.

Example:

```env
LORAWAN_WEBHOOK_SECRET=use-a-long-random-secret
LORAWAN_DEVICE_MAP={"rsu-gps-tracker-01":"rsu-shuttle-01"}
```

Configure the The Things Stack webhook to POST uplink JSON to:

```
https://YOUR-BACKEND-DOMAIN/api/lorawan/uplink
```

The request must include this header:

```
Authorization: Bearer YOUR_LORAWAN_WEBHOOK_SECRET
Content-Type: application/json
```

The webhook handler reads this standard uplink structure:

```json
{
  "end_device_ids": { "device_id": "rsu-gps-tracker-01" },
  "received_at": "2026-11-14T03:00:00Z",
  "uplink_message": {
    "decoded_payload": {
      "latitude": 13.9658,
      "longitude": 100.5863,
      "speed": 2.5,
      "heading": 90
    }
  }
}
```

Your LoRaWAN device's decoder must expose numeric `latitude` and `longitude` values in `uplink_message.decoded_payload`. If its decoder uses different field names or units, adapt the decoder or the webhook mapping before connecting it.

## Check in Neon

After the schema has been pushed to Neon, run:

```sql
SELECT
  "vehicleId",
  source,
  "deviceId",
  latitude,
  longitude,
  speed,
  "recordedAt"
FROM "VehicleLocation"
ORDER BY "recordedAt" DESC
LIMIT 100;
```

The backend writes a separate history row for every accepted source update. All three physical devices can therefore be compared for the same vehicle; the live vehicle marker still shows the most recently accepted location.
