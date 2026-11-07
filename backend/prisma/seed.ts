import 'dotenv/config';
import { hash } from 'bcryptjs';
import { PrismaClient, type Prisma } from '@prisma/client';

const prisma = new PrismaClient();

const stops = [
  { id: 'rsu-stop-1', nameTh: 'ประตูหลัก', nameEn: 'RSU Main Gate', latitude: 13.9645, longitude: 100.5858 },
  { id: 'rsu-stop-2', nameTh: 'อาคารอาทิตย์ อุไรรัตน์', nameEn: 'Arthit Ourairat Building', latitude: 13.9650, longitude: 100.5865 },
  { id: 'rsu-stop-3', nameTh: 'วิทยาลัยนานาชาติ', nameEn: 'Rangsit University International College', latitude: 13.9637, longitude: 100.5875 },
  { id: 'rsu-stop-4', nameTh: 'หอสมุด', nameEn: 'University Library', latitude: 13.9641, longitude: 100.5870 },
  { id: 'rsu-stop-5', nameTh: 'ศูนย์กิจกรรมนักศึกษา', nameEn: 'Student Center', latitude: 13.9633, longitude: 100.5864 },
  { id: 'rsu-stop-6', nameTh: 'โรงอาหาร', nameEn: 'University Canteen', latitude: 13.9638, longitude: 100.5859 },
  { id: 'rsu-stop-7', nameTh: 'โรงยิม', nameEn: 'Gymnasium', latitude: 13.9628, longitude: 100.5872 },
];

const routes = [
  { id: 'rsu-campus-loop', name: 'RSU Campus Loop', color: '#2563EB', stopIds: ['rsu-stop-1', 'rsu-stop-2', 'rsu-stop-3', 'rsu-stop-4', 'rsu-stop-5', 'rsu-stop-6', 'rsu-stop-7'], closeLoop: true },
];

const vehicles = [
  { id: 'rsu-shuttle-01', name: 'RSU Shuttle Bus 01', type: 'bus', assignedRouteId: 'rsu-campus-loop', status: 'active' as const },
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
      update: {},
    });
  }

  const stopById = new Map(stops.map(stop => [stop.id, stop]));
  for (const route of routes) {
    const geometryStops = route.closeLoop ? [...route.stopIds, route.stopIds[0]!] : route.stopIds;
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
      update: {},
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
        create: { id: `rs-${route.id}-${index + 1}`, routeId: route.id, stopId, stopOrder: index + 1 },
        update: { stopOrder: index + 1 },
      });
    }

    // Preserve any existing route-stop records not listed in this seed,
    // placing them after the configured stops instead of deleting them.
    const configuredStopIds = new Set(route.stopIds);
    const remainingStops = existingRouteStops.filter(item => !configuredStopIds.has(item.stopId));

    for (let index = 0; index < remainingStops.length; index += 1) {
      await prisma.routeStop.update({
        where: { id: remainingStops[index]!.id },
        data: { stopOrder: route.stopIds.length + index + 1 },
      });
    }
  }

  for (const vehicle of vehicles) {
    await prisma.vehicle.upsert({
      where: { id: vehicle.id },
      create: vehicle,
      update: {},
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
