import 'dotenv/config';
import { hash } from 'bcryptjs';
import { PrismaClient, type Prisma } from '@prisma/client';

const prisma = new PrismaClient();

const stops = [
  // Provisional campus waypoints based on the official RSU building map.
  // These coordinates are provisional campus waypoints, not verified curbside pickup points.
  // Building names follow the RSU campus map; added building coordinates are approximate estimates.
  // The uploaded Google My Maps KML was a NetworkLink only, so it did not contain route geometry.
  // Confirm exact positions and road-following geometry before using for live navigation.
  { id: 'rsu-stop-1', nameTh: 'ประตูหลัก', nameEn: 'RSU Main Gate', latitude: 13.964355, longitude: 100.586705 },
  { id: 'rsu-stop-2', nameTh: 'อาคารอาทิตย์ อุไรรัตน์', nameEn: 'Arthit Ourairat Building (Building 1)', latitude: 13.96472, longitude: 100.58648 },
  { id: 'rsu-stop-5', nameTh: 'อาคารรังสิตประยูรศักดิ์', nameEn: 'Rangsit Prayurasak Building (Building 12)', latitude: 13.96372, longitude: 100.58712 },
  { id: 'rsu-stop-6', nameTh: 'อาคารนันทนาการ', nameEn: 'Recreation Building (Building 14)', latitude: 13.96352, longitude: 100.58638 },
  // Selected outer-campus waypoints for a shorter perimeter-style loop.
  // Approximate coordinates are for the first demo version only.
  { id: 'rsu-stop-8', nameTh: 'อาคารคุณหญิงพัฒนา', nameEn: 'Khunying Phatthana Building (Building 8)', latitude: 13.96505, longitude: 100.58525 },
  { id: 'rsu-stop-15', nameTh: 'อาคาร Digital Multimedia Complex', nameEn: 'Digital Multimedia Complex (Building 15)', latitude: 13.96827, longitude: 100.58515 },
  { id: 'rsu-stop-16', nameTh: 'อาคารบริการ', nameEn: 'Service Building (Building 16)', latitude: 13.96765, longitude: 100.58570 },
  { id: 'rsu-stop-19', nameTh: 'อาคารสถาปัตยกรรม', nameEn: 'Architecture Building (Building 19)', latitude: 13.96375, longitude: 100.58525 },
];

const routes = [
  { id: 'rsu-campus-loop', name: 'RSU Campus Loop', color: '#2563EB', stopIds: ['rsu-stop-1', 'rsu-stop-2', 'rsu-stop-8', 'rsu-stop-15', 'rsu-stop-16', 'rsu-stop-19', 'rsu-stop-5', 'rsu-stop-6'], closeLoop: true },
];

const vehicles = [
  { id: 'rsu-shuttle-01', name: 'RSU Shuttle Bus 01', type: 'bus', assignedRouteId: 'rsu-campus-loop', status: 'active' as const },
  { id: 'rsu-shuttle-02', name: 'RSU Shuttle Bus 02', type: 'bus', assignedRouteId: 'rsu-campus-loop', status: 'active' as const },
  { id: 'rsu-shuttle-03', name: 'RSU Shuttle Bus 03', type: 'bus', assignedRouteId: 'rsu-campus-loop', status: 'active' as const },
];

async function main() {
  const username = process.env.ADMIN_USERNAME?.trim();
  const password = process.env.ADMIN_PASSWORD;
  if (!username || !password || password.length < 12) {
    throw new Error('Set ADMIN_USERNAME and an ADMIN_PASSWORD of at least 12 characters before seeding');
  }

  const passwordHash = await hash(password, 12);
  await prisma.user.upsert({
    where: { username },
    create: { username, passwordHash, role: 'ADMIN' },
    update: {},
  });

  if (process.argv.includes('--admin-only')) {
    console.info(`Admin ${username} provisioned if missing; existing account unchanged.`);
    return;
  }

  for (const stop of stops) {
    await prisma.stop.upsert({
      where: { id: stop.id },
      create: { ...stop, status: 'active' },
      update: { nameTh: stop.nameTh, nameEn: stop.nameEn, latitude: stop.latitude, longitude: stop.longitude, status: 'active' },
    });
  }

  const stopById = new Map(stops.map(stop => [stop.id, stop]));
  for (const route of routes) {
    const geometryStops = route.closeLoop ? [...route.stopIds, route.stopIds[0]!] : route.stopIds;
    // This is a provisional straight-line connection between waypoints, not a road-snapped route.
    const geometry = {
      type: 'LineString',
      coordinates: geometryStops.map(id => {
        const stop = stopById.get(id)!;
        return [stop.longitude, stop.latitude];
      }),
    } as Prisma.InputJsonValue;

    await prisma.route.upsert({
      where: { id: route.id },
      create: { id: route.id, name: route.name, color: route.color, status: 'active', geometry },
      update: { name: route.name, color: route.color, status: 'active', geometry },
    });

    // Temporarily move existing stop orders below the current range so that
    // changing the order cannot collide with the routeId + stopOrder unique key.
    const existingRouteStops = await prisma.routeStop.findMany({
      where: { routeId: route.id },
      select: { id: true, stopId: true, stopOrder: true },
      orderBy: { stopOrder: 'asc' },
    });

    // Use temporary positive orders above the current range. The database
    // enforces RouteStop_stopOrder_positive_check, so temporary values must
    // remain positive as well as unique.
    const highestExistingOrder = Math.max(
      0,
      ...existingRouteStops.map(item => item.stopOrder),
    );
    const temporaryOrderStart =
      Math.max(highestExistingOrder, route.stopIds.length) + existingRouteStops.length + 1;

    for (let index = 0; index < existingRouteStops.length; index += 1) {
      await prisma.routeStop.update({
        where: { id: existingRouteStops[index]!.id },
        data: { stopOrder: temporaryOrderStart + index },
      });
    }

    // Upsert the configured stops in their intended order.
    for (let index = 0; index < route.stopIds.length; index += 1) {
      const stopId = route.stopIds[index]!;
      await prisma.routeStop.upsert({
        where: { routeId_stopId: { routeId: route.id, stopId } },
        create: { routeId: route.id, stopId, stopOrder: index + 1 },
        update: { stopOrder: index + 1 },
      });
    }

    // Remove old route-stop links that are no longer part of this loop.
    // This keeps the route limited to the configured perimeter waypoints.
    await prisma.routeStop.deleteMany({
      where: { routeId: route.id, stopId: { notIn: route.stopIds } },
    });
  }

  for (const vehicle of vehicles) {
    await prisma.vehicle.upsert({
      where: { id: vehicle.id },
      create: vehicle,
      update: { name: vehicle.name, type: vehicle.type, assignedRouteId: vehicle.assignedRouteId, status: vehicle.status },
    });
  }

  // Remove obsolete seeded routes, vehicles, and stops where no trip history depends on them.
  // Historical trip records are preserved; related records are left in place if referenced by a trip.
  const obsoleteRoutes = await prisma.route.findMany({
    where: { id: { notIn: routes.map(route => route.id) } },
    select: { id: true, _count: { select: { trips: true } } },
  });
  let preservedRoutes = 0;
  for (const oldRoute of obsoleteRoutes) {
    if (oldRoute._count.trips > 0) {
      preservedRoutes += 1;
      continue;
    }
    await prisma.routeStop.deleteMany({ where: { routeId: oldRoute.id } });
    await prisma.route.delete({ where: { id: oldRoute.id } });
  }

  const obsoleteVehicles = await prisma.vehicle.findMany({
    where: { id: { notIn: vehicles.map(vehicle => vehicle.id) } },
    select: { id: true, _count: { select: { trips: true } } },
  });
  let preservedVehicles = 0;
  for (const oldVehicle of obsoleteVehicles) {
    if (oldVehicle._count.trips > 0) {
      preservedVehicles += 1;
      continue;
    }
    await prisma.vehicle.delete({ where: { id: oldVehicle.id } });
  }

  await prisma.stop.deleteMany({
    where: {
      id: { notIn: stops.map(stop => stop.id) },
      routeStops: { none: {} },
    },
  });

  console.info(`Seeded admin ${username}, ${routes.length} route, ${stops.length} stops, and ${vehicles.length} vehicle. Removed unused old records. Preserved ${preservedRoutes} old routes and ${preservedVehicles} old vehicles because trip history references them.`);
}

main()
  .catch(error => {
    console.error('Seed failed', error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
