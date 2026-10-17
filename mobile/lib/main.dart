import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';
import 'package:http/http.dart' as http;
import 'package:socket_io_client/socket_io_client.dart' as io;
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

const apiOverride = String.fromEnvironment('API_URL');
const socketOverride = String.fromEnvironment('SOCKET_URL');
String get apiUrl => apiOverride.isNotEmpty ? apiOverride : 'http://127.0.0.1:3000';
String get socketUrl => socketOverride.isNotEmpty ? socketOverride : apiUrl;

void main() => runApp(const ShuttleTrackApp());

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
    setState(() { busy = true; message = null; });
    try {
      if (!await requestLocationPermission()) return;
      final response = await http.post(
        Uri.parse('$apiUrl/api/trips/start'),
        headers: {'Content-Type': 'application/json', 'Authorization': 'Bearer $token'},
        body: jsonEncode({'routeId': selectedRouteId}),
      );
      final data = unwrap(response);
      final newTripId = data['id']?.toString();
      if (newTripId == null || newTripId.isEmpty) throw Exception('Backend did not return a trip ID.');
      tripId = newTripId;
      connectSocket();
      if (mounted) setState(() => message = 'Trip started. Waiting for GPS...');
      await beginGps();
    } catch (e) { inform(e.toString().replaceFirst('Exception: ', '')); }
    finally { if (mounted) setState(() => busy = false); }
  }

  void connectSocket() {
    socket?.dispose();
    socket = io.io(socketUrl, io.OptionBuilder().setTransports(['websocket']).setAuth({'token': token}).disableAutoConnect().build());
    socket!.onConnect((_) => inform('Live connection ready.'));
    socket!.onConnectError((error) => inform('Live connection failed: $error'));
    socket!.onDisconnect((_) { if (mounted && tripActive) inform('Live connection lost. Reconnecting...'); });
    socket!.connect();
  }

  Future<void> beginGps() async {
    await gpsSubscription?.cancel();
    gpsSubscription = Geolocator.getPositionStream(
      locationSettings: const LocationSettings(accuracy: LocationAccuracy.high, distanceFilter: 5),
    ).listen((fix) {
      if (!mounted || !tripActive) return;
      setState(() => position = fix);
      sendGps(fix);
    }, onError: (Object error) => inform('GPS error: $error'));
    if (mounted) setState(() => sharing = true);
  }

  void sendGps(Position fix) {
    final activeSocket = socket;
    if (activeSocket == null || !activeSocket.connected || vehicleId == null || tripId == null) {
      inform('Waiting for live connection before sending GPS.');
      return;
    }
    final payload = {
      'vehicleId': vehicleId, 'tripId': tripId,
      'latitude': fix.latitude, 'longitude': fix.longitude,
      'speed': fix.speed.isFinite && fix.speed > 0 ? fix.speed : 0,
      'heading': fix.heading.isFinite ? fix.heading : 0,
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
      socket?.dispose();
      socket = null;
      if (!mounted) return;
      setState(() { tripId = null; sharing = false; message = 'Trip ended. GPS sharing stopped.'; });
    } catch (e) { inform(e.toString().replaceFirst('Exception: ', '')); }
    finally { if (mounted) setState(() => busy = false); }
  }

  Future<void> logout() async {
    if (tripActive) { inform('End the active trip before signing out.'); return; }
    await gpsSubscription?.cancel();
    socket?.dispose();
    if (!mounted) return;
    setState(() {
      token = null; vehicleId = null; vehicleName = null; routes = [];
      selectedRouteId = null; position = null; lastSent = null; sharing = false;
      message = 'Signed out.';
    });
    deviceTokenInput.clear();
    await secureStorage.delete(key: 'vehicle_jwt');
    await secureStorage.delete(key: 'vehicle_id');
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(
      title: const Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text('ShuttleTrack', style: TextStyle(fontWeight: FontWeight.w800)),
        Text('DRIVER APP', style: TextStyle(fontSize: 10, letterSpacing: 2)),
      ]),
      actions: [if (loggedIn) IconButton(onPressed: busy ? null : logout, icon: const Icon(Icons.logout_rounded)), const SizedBox(width: 8)],
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
    for (final route in routes) { if (route['id']?.toString() == selectedRouteId) selected = route; }
    return ListView(padding: const EdgeInsets.all(18), children: [
      Row(children: [
        Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          const Text('DRIVER CONTROL', style: TextStyle(fontSize: 11, letterSpacing: 1.4, fontWeight: FontWeight.w800, color: Colors.black54)),
          const SizedBox(height: 5),
          Text(vehicleName ?? 'Vehicle', style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w800)),
          Text('Vehicle ID: ${vehicleId ?? '-'}', style: const TextStyle(color: Colors.black54)),
        ])),
        Chip(label: Text(tripActive ? 'ON TRIP' : 'OFF DUTY'), backgroundColor: tripActive ? const Color(0xFFD8F8E8) : const Color(0xFFE5EBF2)),
      ]),
      const SizedBox(height: 18),
      gpsCard(),
      const SizedBox(height: 16),
      Card(child: Padding(padding: const EdgeInsets.all(18), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        const Text('Assigned route', style: TextStyle(fontSize: 17, fontWeight: FontWeight.bold)),
        const SizedBox(height: 5),
        const Text('Choose the route for this trip.', style: TextStyle(color: Colors.black54)),
        const SizedBox(height: 14),
        DropdownButtonFormField<String>(
          value: routes.any((r) => r['id']?.toString() == selectedRouteId) ? selectedRouteId : null,
          isExpanded: true,
          decoration: const InputDecoration(prefixIcon: Icon(Icons.alt_route_rounded), labelText: 'Route'),
          items: routes.map((r) => DropdownMenuItem<String>(value: r['id']?.toString(), child: Text(r['name']?.toString() ?? 'Route', overflow: TextOverflow.ellipsis))).toList(),
          onChanged: tripActive || busy ? null : (value) => setState(() => selectedRouteId = value),
        ),
        if (selected != null) ...[const SizedBox(height: 14), stopsView(selected)],
      ]))),
      const SizedBox(height: 16),
      SizedBox(height: 54, child: FilledButton.icon(
        style: tripActive ? FilledButton.styleFrom(backgroundColor: const Color(0xFFB42318)) : null,
        onPressed: busy ? null : (tripActive ? endTrip : startTrip),
        icon: Icon(tripActive ? Icons.stop_rounded : Icons.play_arrow_rounded),
        label: Text(tripActive ? 'End trip' : 'Start trip', style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
      )),
      const SizedBox(height: 12),
      messageView(),
      const SizedBox(height: 16),
      const Text('GPS sharing works while a trip is active and this app is open.', textAlign: TextAlign.center, style: TextStyle(fontSize: 12, color: Colors.black54)),
    ]);
  }

  Widget gpsCard() {
    final fix = position;
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(gradient: const LinearGradient(colors: [Color(0xFF10243A), Color(0xFF1E425D)]), borderRadius: BorderRadius.circular(22)),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          const Icon(Icons.my_location_rounded, color: Color(0xFF20B981)),
          const SizedBox(width: 8),
          const Expanded(child: Text('LIVE GPS STATUS', style: TextStyle(color: Colors.white, fontWeight: FontWeight.w800, letterSpacing: 1))),
          Container(width: 8, height: 8, decoration: BoxDecoration(color: sharing ? const Color(0xFF20B981) : Colors.orangeAccent, shape: BoxShape.circle)),
        ]),
        const SizedBox(height: 18),
        Text(fix == null ? 'Waiting for GPS' : '${fix.latitude.toStringAsFixed(6)}, ${fix.longitude.toStringAsFixed(6)}', style: const TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.bold)),
        const SizedBox(height: 7),
        Text(fix == null ? 'Coordinates appear after a GPS fix.' : 'Accuracy ±${fix.accuracy.toStringAsFixed(0)} m  ·  Speed ${(fix.speed * 3.6).toStringAsFixed(1)} km/h', style: const TextStyle(color: Color(0xFFD2DCE6), fontSize: 12)),
        const SizedBox(height: 14),
        Text(lastSent == null ? 'No GPS update confirmed yet' : 'Last confirmed: ${TimeOfDay.fromDateTime(lastSent!).format(context)}', style: const TextStyle(color: Color(0xFFD2DCE6), fontSize: 12)),
      ]),
    );
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
