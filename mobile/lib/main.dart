import 'dart:async';
import 'dart:convert';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/foundation.dart';
import 'package:geolocator/geolocator.dart';
import 'package:http/http.dart' as http;
import 'package:socket_io_client/socket_io_client.dart' as io;
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

const apiOverride = String.fromEnvironment('API_URL');
const socketOverride = String.fromEnvironment('SOCKET_URL');
String get apiUrl => apiOverride.isNotEmpty ? apiOverride : 'http://127.0.0.1:3000';
String get socketUrl => socketOverride.isNotEmpty ? socketOverride : apiUrl;

void main() {
  runApp(const ShuttleTrackApp());
}

class ShuttleTrackApp extends StatelessWidget {
  const ShuttleTrackApp({super.key});
  @override
  Widget build(BuildContext context) => MaterialApp(
    title: 'ShuttleTrack Driver',
    debugShowCheckedModeBanner: false,
    theme: ThemeData(
      useMaterial3: true,
      colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xFF20B981)),
      scaffoldBackgroundColor: const Color(0xFFF3F6F9),
      appBarTheme: const AppBarTheme(backgroundColor: Color(0xFF10243A), foregroundColor: Colors.white),
      cardTheme: CardThemeData(color: Colors.white, elevation: 0, shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18))),
      inputDecorationTheme: InputDecorationTheme(filled: true, fillColor: Colors.white, border: OutlineInputBorder(borderRadius: BorderRadius.circular(14))),
    ),
    home: const DriverPage(),
  );
}

class DriverPage extends StatefulWidget {
  const DriverPage({super.key});
  @override
  State<DriverPage> createState() => _DriverPageState();
}

class _DriverPageState extends State<DriverPage> {
  final vehicleIdInput = TextEditingController();
  final deviceTokenInput = TextEditingController();
  static const secureStorage = FlutterSecureStorage();
  String? token, vehicleId, vehicleName, tripId, selectedRouteId, message;
  List<Map<String, dynamic>> routes = [];
  Position? position;
  DateTime? lastSent;
  StreamSubscription<Position>? gpsSubscription;
  Timer? routeSimulationTimer;
  Timer? elapsedTimer;
  DateTime? tripStartedAt;
  Duration elapsed = Duration.zero;
  double? latestHeading, latestSpeedKmh, latestAccuracy;
  String? latestCoordinateLabel;
  io.Socket? socket;
  bool busy = false, sharing = false, hideToken = true;

  bool get loggedIn => token != null;
  bool get tripActive => tripId != null;

  @override
  void initState() {
    super.initState();
    restoreSession();
  }

  Future<void> restoreSession() async {
    try {
      final savedToken = await secureStorage.read(key: 'vehicle_jwt');
      final savedVehicleId = await secureStorage.read(key: 'vehicle_id');
      if (savedToken == null || savedVehicleId == null || !mounted) return;
      final savedRoutes = await loadRoutes(savedToken);
      if (!mounted) return;
      setState(() {
        token = savedToken;
        vehicleId = savedVehicleId;
        vehicleName = savedVehicleId;
        routes = savedRoutes;
        selectedRouteId = savedRoutes.isEmpty ? null : savedRoutes.first['id']?.toString();
        message = 'Restored saved session.';
      });
    } catch (_) {
      await secureStorage.delete(key: 'vehicle_jwt');
      await secureStorage.delete(key: 'vehicle_id');
    }
  }

  @override
  void dispose() {
    gpsSubscription?.cancel();
    routeSimulationTimer?.cancel();
    elapsedTimer?.cancel();
    socket?.dispose();
    vehicleIdInput.dispose();
    deviceTokenInput.dispose();
    super.dispose();
  }

  void inform(String text) {
    if (mounted) setState(() => message = text);
  }

  Map<String, dynamic> unwrap(http.Response response) {
    final decoded = jsonDecode(response.body);
    if (decoded is! Map<String, dynamic>) throw Exception('Unexpected server response.');
    if (response.statusCode < 200 || response.statusCode >= 300 || decoded['success'] == false) {
      throw Exception(decoded['error'] ?? 'Request failed (${response.statusCode}).');
    }
    final data = decoded['data'];
    return data is Map<String, dynamic> ? data : decoded;
  }

  Future<List<Map<String, dynamic>>> loadRoutes(String jwt) async {
    final response = await http.get(Uri.parse('$apiUrl/api/routes'), headers: {'Authorization': 'Bearer $jwt'});
    final decoded = jsonDecode(response.body);
    if (response.statusCode < 200 || response.statusCode >= 300 || decoded is! Map<String, dynamic> || decoded['success'] == false) {
      throw Exception(decoded is Map ? (decoded['error'] ?? 'Unable to load routes') : 'Unable to load routes');
    }
    final data = decoded['data'];
    return data is List ? data.whereType<Map<String, dynamic>>().toList() : [];
  }

  Future<void> login() async {
    final id = vehicleIdInput.text.trim();
    final secret = deviceTokenInput.text.trim();
    if (id.isEmpty || secret.isEmpty) { inform('Enter your vehicle ID and device token.'); return; }
    setState(() { busy = true; message = null; });
    try {
      final response = await http.post(
        Uri.parse('$apiUrl/api/auth/vehicle/login'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({'vehicleId': id, 'deviceToken': secret}),
      );
      final data = unwrap(response);
      final jwt = data['token'] as String?;
      final vehicle = data['vehicle'];
      if (jwt == null || vehicle is! Map<String, dynamic>) throw Exception('Vehicle login response is incomplete.');
      final routeList = await loadRoutes(jwt);
      await secureStorage.write(key: 'vehicle_jwt', value: jwt);
      await secureStorage.write(key: 'vehicle_id', value: vehicle['id']?.toString() ?? id);
      if (!mounted) return;
      setState(() {
        token = jwt;
        vehicleId = vehicle['id']?.toString() ?? id;
        vehicleName = vehicle['name']?.toString() ?? id;
        routes = routeList;
        selectedRouteId = routeList.isEmpty ? null : routeList.first['id']?.toString();
        message = routeList.isEmpty ? 'Signed in, but no active routes were found.' : 'Signed in successfully.';
      });
    } catch (e) { inform(e.toString().replaceFirst('Exception: ', '')); }
    finally { if (mounted) setState(() => busy = false); }
  }

  Future<bool> requestLocationPermission() async {
    if (!await Geolocator.isLocationServiceEnabled()) { inform('Please turn on Location Services.'); return false; }
    var permission = await Geolocator.checkPermission();
    if (permission == LocationPermission.denied) permission = await Geolocator.requestPermission();
    if (permission == LocationPermission.denied || permission == LocationPermission.deniedForever) {
      inform('Location permission is required to share GPS.'); return false;
    }
    return true;
  }

  Future<void> startTrip() async {
    if (token == null || selectedRouteId == null) { inform('Choose a route first.'); return; }
    final selectedRoute = routes.firstWhere(
      (route) => route['id']?.toString() == selectedRouteId,
      orElse: () => <String, dynamic>{},
    );
    if (selectedRoute.isEmpty) { inform('Selected route could not be loaded.'); return; }

    setState(() { busy = true; message = null; });
    String? createdTripId;
    try {
      // Real phones publish their actual GPS. Flutter Web uses route geometry
      // as a demo GPS source so the map can move during browser testing.
      if (!kIsWeb && !await requestLocationPermission()) return;

      final response = await http.post(
        Uri.parse('$apiUrl/api/trips/start'),
        headers: {'Content-Type': 'application/json', 'Authorization': 'Bearer $token'},
        body: jsonEncode({'routeId': selectedRouteId}),
      );
      final data = unwrap(response);
      createdTripId = data['id']?.toString();
      if (createdTripId == null || createdTripId.isEmpty) {
        throw Exception('Backend did not return a trip ID.');
      }

      if (!mounted) return;
      setState(() {
        tripId = createdTripId;
        tripStartedAt = DateTime.now();
        elapsed = Duration.zero;
        elapsedTimer?.cancel();
        elapsedTimer = Timer.periodic(const Duration(seconds: 1), (_) {
          if (!mounted || tripStartedAt == null) return;
          setState(() => elapsed = DateTime.now().difference(tripStartedAt!));
        });
        message = 'Trip created. Connecting to live tracking...';
      });

      await connectSocket();
      if (kIsWeb) {
        await beginRouteSimulation(selectedRoute);
      } else {
        await beginGps();
      }
    } catch (e) {
      routeSimulationTimer?.cancel();
      elapsedTimer?.cancel();
      elapsedTimer = null;
      tripStartedAt = null;
      await gpsSubscription?.cancel();
      socket?.dispose();
      socket = null;
      // Roll back the newly created active trip if live tracking failed.
      if (createdTripId != null && token != null) {
        try {
          await http.post(
            Uri.parse('$apiUrl/api/trips/$createdTripId/end'),
            headers: {'Authorization': 'Bearer $token'},
          );
        } catch (_) {}
      }
      if (mounted) setState(() { tripId = null; sharing = false; elapsed = Duration.zero; });
      inform(e.toString().replaceFirst('Exception: ', ''));
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> connectSocket() async {
    socket?.dispose();
    final connected = Completer<void>();
    socket = io.io(
      socketUrl,
      io.OptionBuilder()
          .setTransports(['websocket'])
          .setAuth({'token': token})
          .disableAutoConnect()
          .build(),
    );
    socket!.onConnect((_) {
      if (!connected.isCompleted) connected.complete();
      inform('Live connection ready.');
    });
    socket!.onConnectError((error) {
      if (!connected.isCompleted) {
        connected.completeError(Exception('Live connection failed: $error'));
      } else {
        inform('Live connection failed: $error');
      }
    });
    socket!.onDisconnect((_) {
      if (mounted && tripActive) inform('Live connection lost.');
    });
    socket!.connect();
    await connected.future.timeout(
      const Duration(seconds: 20),
      onTimeout: () => throw Exception('Timed out connecting to the live tracking server.'),
    );
  }

  Future<void> beginGps() async {
    await gpsSubscription?.cancel();
    final firstFix = await Geolocator.getCurrentPosition(
      locationSettings: const LocationSettings(accuracy: LocationAccuracy.high),
    );
    if (!mounted || !tripActive) return;
    setState(() {
      position = firstFix;
      latestCoordinateLabel = '${firstFix.latitude.toStringAsFixed(6)}, ${firstFix.longitude.toStringAsFixed(6)}';
      latestHeading = firstFix.heading;
      latestSpeedKmh = firstFix.speed.isFinite ? math.max(0, firstFix.speed * 3.6).toDouble() : 0;
      latestAccuracy = firstFix.accuracy;
      sharing = true;
    });
    sendGps(firstFix);

    gpsSubscription = Geolocator.getPositionStream(
      locationSettings: const LocationSettings(accuracy: LocationAccuracy.high, distanceFilter: 3),
    ).listen((fix) {
      if (!mounted || !tripActive) return;
      setState(() {
        position = fix;
        latestCoordinateLabel = '${fix.latitude.toStringAsFixed(6)}, ${fix.longitude.toStringAsFixed(6)}';
        latestHeading = fix.heading;
        latestSpeedKmh = fix.speed.isFinite ? math.max(0, fix.speed * 3.6).toDouble() : 0;
        latestAccuracy = fix.accuracy;
      });
      sendGps(fix);
    }, onError: (Object error) => inform('GPS error: $error'));
    inform('Trip active. Live phone GPS is being shared.');
  }

  Future<void> beginRouteSimulation(Map<String, dynamic> route) async {
    // Prefer the saved GeoJSON route. If it is missing, use the ordered route
    // stops returned by GET /api/routes (the same fallback used by the web map).
    final coordinates = <List<double>>[];
    final geometry = route['geometry'];
    final rawCoordinates = geometry is Map ? geometry['coordinates'] : null;

    if (geometry is Map && geometry['type'] == 'LineString' && rawCoordinates is List) {
      for (final item in rawCoordinates) {
        if (item is! List || item.length < 2 || item[0] is! num || item[1] is! num) {
          throw Exception('Route geometry contains an invalid coordinate.');
        }
        final longitude = (item[0] as num).toDouble();
        final latitude = (item[1] as num).toDouble();
        if (!longitude.isFinite || !latitude.isFinite || longitude.abs() > 180 || latitude.abs() > 90) {
          throw Exception('Route geometry contains an invalid latitude/longitude.');
        }
        coordinates.add([longitude, latitude]);
      }
    }

    if (coordinates.length < 2) {
      final routeStops = route['routeStops'];
      if (routeStops is List) {
        for (final entry in routeStops) {
          if (entry is! Map) continue;
          final stop = entry['stop'] is Map ? entry['stop'] as Map : entry;
          final lat = stop['latitude'];
          final lng = stop['longitude'];
          if (lat is! num || lng is! num) continue;
          final latitude = lat.toDouble();
          final longitude = lng.toDouble();
          if (latitude.isFinite && longitude.isFinite &&
              latitude.abs() <= 90 && longitude.abs() <= 180) {
            coordinates.add([longitude, latitude]);
          }
        }
      }
    }

    if (coordinates.length < 2) {
      throw Exception('This route needs at least two valid stops or a LineString map geometry for browser movement.');
    }

    // Close the browser demo path so the bus continuously loops around the route.
    final first = coordinates.first;
    final last = coordinates.last;
    if (first[0] != last[0] || first[1] != last[1]) {
      coordinates.add([first[0], first[1]]);
    }

    // Interpolate between stops so the marker moves smoothly, not only stop-to-stop.
    final points = <List<double>>[];
    const stepsPerSegment = 30;
    for (var segment = 0; segment < coordinates.length - 1; segment++) {
      final from = coordinates[segment];
      final to = coordinates[segment + 1];
      for (var step = 0; step < stepsPerSegment; step++) {
        final t = step / stepsPerSegment;
        points.add([
          from[0] + (to[0] - from[0]) * t,
          from[1] + (to[1] - from[1]) * t,
        ]);
      }
    }
    points.add([first[0], first[1]]);
    if (points.length < 2) throw Exception('Route needs at least two movement points.');

    routeSimulationTimer?.cancel();
    var pointIndex = 0;
    void publishCurrentPoint() {
      if (!mounted || !tripActive || socket?.connected != true) return;
      final point = points[pointIndex];
      final next = points[(pointIndex + 1) % points.length];
      final dx = (next[0] - point[0]) * 111320 * math.cos(point[1] * math.pi / 180);
      final dy = (next[1] - point[1]) * 111320;
      final heading = (math.atan2(dx, dy) * 180 / math.pi + 360) % 360;
      setState(() {
        latestCoordinateLabel = '${point[1].toStringAsFixed(6)}, ${point[0].toStringAsFixed(6)}';
        latestHeading = heading;
        latestSpeedKmh = 18.0;
        latestAccuracy = 5.0;
        sharing = true;
      });
      sendCoordinates(point[1], point[0], speed: 5.0, heading: heading);
      pointIndex = (pointIndex + 1) % points.length;
    }

    // Send immediately, then continue every second while the trip is active.
    publishCurrentPoint();
    routeSimulationTimer = Timer.periodic(
      const Duration(seconds: 1),
      (_) => publishCurrentPoint(),
    );
    inform('Browser route simulation started. Sending a new vehicle location every second.');
  }

  void sendGps(Position fix) {
    sendCoordinates(
      fix.latitude,
      fix.longitude,
      speed: fix.speed.isFinite && fix.speed > 0 ? fix.speed : 0,
      heading: fix.heading.isFinite ? fix.heading : 0,
    );
  }

  void sendCoordinates(double latitude, double longitude, {double speed = 0, double heading = 0}) {
    final activeSocket = socket;
    if (activeSocket == null || !activeSocket.connected || vehicleId == null || tripId == null) {
      inform('Waiting for live connection before sending GPS.');
      return;
    }
    final payload = {
      'vehicleId': vehicleId,
      'tripId': tripId,
      'latitude': latitude,
      'longitude': longitude,
      'speed': speed.isFinite && speed >= 0 ? speed : 0,
      'heading': heading.isFinite ? heading % 360 : 0,
      'recordedAt': DateTime.now().toUtc().toIso8601String(),
    };
    activeSocket.emitWithAck('vehicle:location:update', payload, ack: (dynamic result) {
      if (!mounted) return;
      if (result is Map && result['success'] == true) {
        setState(() => lastSent = DateTime.now());
      } else {
        inform(result is Map ? 'GPS rejected: ${result['error'] ?? 'Unknown error'}' : 'GPS update was not accepted.');
      }
    });
  }

  Future<void> endTrip() async {
    if (token == null || tripId == null) return;
    setState(() => busy = true);
    try {
      final response = await http.post(
        Uri.parse('$apiUrl/api/trips/$tripId/end'),
        headers: {'Authorization': 'Bearer $token'},
      );
      unwrap(response);
      await gpsSubscription?.cancel();
      gpsSubscription = null;
      routeSimulationTimer?.cancel();
      routeSimulationTimer = null;
      elapsedTimer?.cancel();
      elapsedTimer = null;
      socket?.dispose();
      socket = null;
      if (!mounted) return;
      setState(() {
        tripId = null; sharing = false; tripStartedAt = null; elapsed = Duration.zero;
        latestHeading = null; latestSpeedKmh = null; latestAccuracy = null;
        message = 'Trip ended. GPS sharing stopped.';
      });
    } catch (e) { inform(e.toString().replaceFirst('Exception: ', '')); }
    finally { if (mounted) setState(() => busy = false); }
  }

  Future<void> logout() async {
    if (tripActive) { inform('End the active trip before signing out.'); return; }
    await gpsSubscription?.cancel();
    routeSimulationTimer?.cancel();
    socket?.dispose();
    if (!mounted) return;
    setState(() {
      token = null; vehicleId = null; vehicleName = null; routes = [];
      selectedRouteId = null; position = null; lastSent = null; latestCoordinateLabel = null; sharing = false;
      tripStartedAt = null; elapsed = Duration.zero; latestHeading = null; latestSpeedKmh = null; latestAccuracy = null;
      elapsedTimer?.cancel();
      message = 'Signed out.';
    });
    deviceTokenInput.clear();
    await secureStorage.delete(key: 'vehicle_jwt');
    await secureStorage.delete(key: 'vehicle_id');
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    backgroundColor: Colors.white,
    appBar: loggedIn
        ? AppBar(
            backgroundColor: const Color(0xFFC05B8D),
            elevation: 0,
            centerTitle: true,
            title: Text(vehicleId ?? 'Vehicle', style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w800)),
            leading: IconButton(onPressed: tripActive ? null : logout, icon: const Icon(Icons.arrow_back, size: 30)),
            actions: [IconButton(onPressed: busy || tripActive ? null : logout, icon: const Icon(Icons.logout_rounded))],
          )
        : AppBar(
            title: const Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text('ShuttleTrack', style: TextStyle(fontWeight: FontWeight.w800)),
              Text('DRIVER APP', style: TextStyle(fontSize: 10, letterSpacing: 2)),
            ]),
          ),
    body: SafeArea(child: loggedIn ? dashboard() : loginView()),
  );

  Widget loginView() => ListView(padding: const EdgeInsets.all(22), children: [
    const SizedBox(height: 22),
    Container(
      padding: const EdgeInsets.all(22),
      decoration: BoxDecoration(color: const Color(0xFF10243A), borderRadius: BorderRadius.circular(24)),
      child: const Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Icon(Icons.directions_bus_filled_rounded, color: Color(0xFF20B981), size: 42),
        SizedBox(height: 20),
        Text('Ready for your route?', style: TextStyle(color: Colors.white, fontSize: 25, fontWeight: FontWeight.bold)),
        SizedBox(height: 8),
        Text('Sign in with the vehicle credentials created in the Admin Dashboard.', style: TextStyle(color: Color(0xFFD2DCE6), height: 1.5)),
      ]),
    ),
    const SizedBox(height: 24),
    const Text('VEHICLE LOGIN', style: TextStyle(fontSize: 12, letterSpacing: 1.5, fontWeight: FontWeight.w800)),
    const SizedBox(height: 14),
    TextField(controller: vehicleIdInput, textInputAction: TextInputAction.next, decoration: const InputDecoration(labelText: 'Vehicle ID', hintText: 'e.g. v-1', prefixIcon: Icon(Icons.directions_bus_outlined))),
    const SizedBox(height: 14),
    TextField(controller: deviceTokenInput, obscureText: hideToken, decoration: InputDecoration(labelText: 'Device token', prefixIcon: const Icon(Icons.key_rounded), suffixIcon: IconButton(onPressed: () => setState(() => hideToken = !hideToken), icon: Icon(hideToken ? Icons.visibility_outlined : Icons.visibility_off_outlined)))),
    const SizedBox(height: 18),
    SizedBox(height: 52, child: FilledButton(onPressed: busy ? null : login, child: busy ? const SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2)) : const Text('Sign in', style: TextStyle(fontWeight: FontWeight.bold)))),
    const SizedBox(height: 12),
    messageView(),
    const SizedBox(height: 12),
    const Text('Generate a device token for this vehicle in the ShuttleTrack Admin Dashboard. The token is shown once.', style: TextStyle(color: Colors.black54, height: 1.5)),
  ]);

  Widget dashboard() {
    Map<String, dynamic>? selected;
    for (final route in routes) {
      if (route['id']?.toString() == selectedRouteId) selected = route;
    }
    final heading = latestHeading ?? 0;
    final speed = latestSpeedKmh ?? 0;
    final accuracy = latestAccuracy ?? 0;
    final coordinateParts = (latestCoordinateLabel ?? '0.000000, 0.000000').split(',');
    final latitude = coordinateParts.isNotEmpty ? coordinateParts[0].trim() : '0.000000';
    final longitude = coordinateParts.length > 1 ? coordinateParts[1].trim() : '0.000000';

    return Stack(
      children: [
        Positioned(top: 0, left: 0, right: 0, height: 210,
          child: Container(color: const Color(0xFFC05B8D))),
        Positioned.fill(
          top: 170,
          child: Container(
            decoration: const BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.vertical(top: Radius.circular(38)),
            ),
            child: ListView(
              padding: const EdgeInsets.fromLTRB(24, 76, 24, 30),
              children: [
                sectionTitle(Icons.history, 'Time'),
                const SizedBox(height: 24),
                metricRow(Icons.timer_outlined, 'Time Elapsed', formatDuration(elapsed), iconColor: const Color(0xFF536B75)),
                const Divider(height: 28),
                sectionTitle(Icons.phone_android, 'Phone Sensor (Local GPS)'),
                const SizedBox(height: 22),
                metricRow(Icons.directions_bus_filled, 'Station', tripActive ? 'En Route' : 'Waiting', iconColor: const Color(0xFF536B75)),
                const Divider(height: 28),
                metricRow(Icons.navigation, 'Heading Direction', '${heading.toStringAsFixed(1)}°', iconColor: const Color(0xFF536B75)),
                const Divider(height: 28),
                metricRow(Icons.my_location, 'Accuracy', tripActive ? '${accuracy.toStringAsFixed(0)} m' : '—', iconColor: const Color(0xFF536B75)),
                const Divider(height: 28),
                metricRow(Icons.access_time, 'Last Update', lastSent == null ? '—' : TimeOfDay.fromDateTime(lastSent!).format(context), iconColor: const Color(0xFF536B75)),
                const Divider(height: 28),
                metricRow(Icons.info, 'Ongoing Speed', '${speed.toStringAsFixed(1)} km/h', iconColor: const Color(0xFF536B75)),
                const Divider(height: 28),
                metricRow(Icons.location_on, 'Latitude', latitude, iconColor: const Color(0xFF536B75)),
                const Divider(height: 28),
                metricRow(Icons.location_on, 'Longitude', longitude, iconColor: const Color(0xFF536B75)),
                const Divider(height: 28),
                const SizedBox(height: 12),
                sectionTitle(Icons.alt_route, 'Assigned Route'),
                const SizedBox(height: 12),
                DropdownButtonFormField<String>(
                  initialValue: routes.any((r) => r['id']?.toString() == selectedRouteId) ? selectedRouteId : null,
                  isExpanded: true,
                  decoration: const InputDecoration(prefixIcon: Icon(Icons.alt_route_rounded), labelText: 'Select route'),
                  items: routes.map((r) => DropdownMenuItem<String>(
                    value: r['id']?.toString(),
                    child: Text(r['name']?.toString() ?? 'Route', overflow: TextOverflow.ellipsis),
                  )).toList(),
                  onChanged: tripActive || busy ? null : (value) => setState(() => selectedRouteId = value),
                ),
                if (selected != null) ...[const SizedBox(height: 14), stopsView(selected)],
                const SizedBox(height: 18),
                messageView(),
                const SizedBox(height: 14),
                const Text('GPS tracking works while this app is open. On a phone, allow location permission. In Chrome, the app simulates movement along the selected route.', textAlign: TextAlign.center, style: TextStyle(fontSize: 12, color: Colors.black54, height: 1.4)),
              ],
            ),
          ),
        ),
        Positioned(
          top: 185, left: 24,
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 18),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(40),
              boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.12), blurRadius: 16, offset: const Offset(0, 6))],
            ),
            child: Row(mainAxisSize: MainAxisSize.min, children: [
              Icon(Icons.circle, size: 13, color: sharing ? const Color(0xFF249653) : Colors.grey),
              const SizedBox(width: 12),
              Text(sharing ? 'Tracking Activated' : 'Tracking Deactivated',
                style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: Color(0xFF666666))),
            ]),
          ),
        ),
        Positioned(
          bottom: 26, left: 0, right: 0,
          child: Center(
            child: ElevatedButton.icon(
              style: ElevatedButton.styleFrom(
                backgroundColor: tripActive ? const Color(0xFFFFE8E6) : const Color(0xFFE7F6E9),
                foregroundColor: tripActive ? const Color(0xFFB42318) : const Color(0xFF287B3D),
                elevation: 5,
                padding: const EdgeInsets.symmetric(horizontal: 30, vertical: 18),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(30)),
              ),
              onPressed: busy ? null : (tripActive ? endTrip : startTrip),
              icon: Icon(tripActive ? Icons.stop_circle_outlined : Icons.my_location, size: 24),
              label: Text(busy ? 'Please wait...' : (tripActive ? 'Stop Tracking' : 'Start Tracking'),
                style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w800)),
            ),
          ),
        ),
      ],
    );
  }

  Widget sectionTitle(IconData icon, String title) => Row(children: [
    Icon(icon, color: const Color(0xFFB94F7D), size: 25),
    const SizedBox(width: 12),
    Text(title, style: const TextStyle(color: Color(0xFFB94F7D), fontSize: 17, fontWeight: FontWeight.w800)),
  ]);

  Widget metricRow(IconData icon, String title, String value, {required Color iconColor}) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 8),
    child: Row(children: [
      SizedBox(width: 48, child: Icon(icon, size: 34, color: iconColor)),
      const SizedBox(width: 18),
      Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(title, style: const TextStyle(fontSize: 19, color: Colors.black87, fontWeight: FontWeight.w500)),
        const SizedBox(height: 5),
        Text(value, style: const TextStyle(fontSize: 15, color: Colors.black54)),
      ])),
    ]),
  );

  String formatDuration(Duration value) {
    final hours = value.inHours.toString().padLeft(2, '0');
    final minutes = (value.inMinutes % 60).toString().padLeft(2, '0');
    final seconds = (value.inSeconds % 60).toString().padLeft(2, '0');
    return hours == '00' ? '$minutes:$seconds' : '$hours:$minutes:$seconds';
  }

  Widget stopsView(Map<String, dynamic> route) {
    final raw = route['routeStops'];
    if (raw is! List || raw.isEmpty) return const Text('No stops listed for this route.', style: TextStyle(color: Colors.black54));
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      const Text('STOPS', style: TextStyle(fontSize: 11, letterSpacing: 1.2, fontWeight: FontWeight.w800, color: Colors.black54)),
      const SizedBox(height: 10),
      for (int i = 0; i < raw.length; i++)
        if (raw[i] is Map<String, dynamic>)
          Padding(padding: const EdgeInsets.only(bottom: 8), child: Row(children: [
            CircleAvatar(radius: 12, backgroundColor: const Color(0xFFD8F8E8), child: Text('${i + 1}', style: const TextStyle(fontSize: 11, color: Color(0xFF08794E), fontWeight: FontWeight.bold))),
            const SizedBox(width: 10),
            Expanded(child: Text(stopName(raw[i] as Map<String, dynamic>), style: const TextStyle(fontWeight: FontWeight.w600))),
          ])),
    ]);
  }

  String stopName(Map<String, dynamic> item) {
    final stop = item['stop'];
    if (stop is Map<String, dynamic>) return (stop['nameEn'] ?? stop['nameTh'] ?? stop['name'] ?? 'Stop').toString();
    return (item['nameEn'] ?? item['nameTh'] ?? item['name'] ?? 'Stop').toString();
  }

  Widget messageView() {
    if (message == null || message!.isEmpty) return const SizedBox.shrink();
    final lower = message!.toLowerCase();
    final error = ['failed', 'error', 'rejected', 'required', 'invalid', 'unable', 'could not', 'not found'].any(lower.contains);
    return Container(
      width: double.infinity, padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(color: error ? const Color(0xFFFFE8E6) : const Color(0xFFE5F7EE), borderRadius: BorderRadius.circular(12)),
      child: Text(message!, style: TextStyle(color: error ? const Color(0xFFB42318) : const Color(0xFF08794E))),
    );
  }
}
