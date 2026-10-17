# ShuttleTrack Mobile (Flutter)

Native driver app for ShuttleTrack. It signs in with a vehicle ID and device token, loads active routes, starts/ends trips, reads real GPS while the app is open, and sends coordinates to the existing Socket.IO backend.

## Setup

From the repository root:

```bash
cd mobile
flutter create --platforms=android,ios .
flutter pub get
```

If platform folders already exist, Flutter will preserve their configuration.

Start the backend by following the root README. Configure the API address:

- Android emulator: `http://10.0.2.2:3000`
- iOS simulator: `http://127.0.0.1:3000`
- Physical phone: use your computer's LAN IP, e.g. `http://192.168.1.20:3000`, with both devices on the same Wi-Fi.

Example Android emulator run:

```bash
flutter run --dart-define=API_URL=http://10.0.2.2:3000 --dart-define=SOCKET_URL=http://10.0.2.2:3000
```

In the existing Admin Dashboard, open Vehicles and generate a device token for the chosen vehicle. Copy the token when shown; the raw token is displayed once.

## Required platform permissions

Android: add these above `<application>` in `android/app/src/main/AndroidManifest.xml`:

```xml
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
```

iOS: add this inside the main `<dict>` in `ios/Runner/Info.plist`:

```xml
<key>NSLocationWhenInUseUsageDescription</key>
<string>ShuttleTrack uses your location to share the vehicle's live position during a trip.</string>
```

The starter tracks GPS only while the app is open and a trip is active. Background tracking is not enabled. Credentials are kept in memory and are not persisted to disk.

## Backend contract

- `POST /api/auth/vehicle/login`
- `GET /api/routes`
- `POST /api/trips/start`
- `POST /api/trips/:id/end`
- Socket.IO event `vehicle:location:update` with acknowledgement

See `../docs/SOCKET_IO.md` for the payload contract.
