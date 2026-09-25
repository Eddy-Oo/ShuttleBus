import 'dotenv/config';
import { hash } from 'bcryptjs';
import { PrismaClient, type Prisma } from '@prisma/client';

const prisma = new PrismaClient();

const stops = [
  { id: 'stop-1', nameTh: 'ประตูหลัก', nameEn: 'Main Gate', latitude: 14.0310, longitude: 100.6500 },
  { id: 'stop-2', nameTh: 'อาคารสำนักงาน', nameEn: 'Admin Building', latitude: 14.0318, longitude: 100.6508 },
  { id: 'stop-3', nameTh: 'คณะวิศวกรรมศาสตร์', nameEn: 'Faculty of Engineering', latitude: 14.0328, longitude: 100.6518 },
  { id: 'stop-4', nameTh: 'คณะวิทยาศาสตร์', nameEn: 'Faculty of Science', latitude: 14.0338, longitude: 100.6528 },
  { id: 'stop-5', nameTh: 'คณะบริหารธุรกิจ', nameEn: 'Faculty of Business', latitude: 14.0345, longitude: 100.6515 },
  { id: 'stop-6', nameTh: 'หอสมุดกลาง', nameEn: 'Central Library', latitude: 14.0332, longitude: 100.6505 },
  { id: 'stop-7', nameTh: 'องค์การนักศึกษา', nameEn: 'Student Union', latitude: 14.0322, longitude: 100.6495 },
  { id: 'stop-8', nameTh: 'ศูนย์กีฬา', nameEn: 'Sports Complex', latitude: 14.0342, longitude: 100.6535 },
  { id: 'stop-9', nameTh: 'โรงอาหาร', nameEn: 'Canteen Area', latitude: 14.0325, longitude: 100.6512 },
  { id: 'stop-10', nameTh: 'ศูนย์คอมพิวเตอร์', nameEn: 'Computer Center', latitude: 14.0335, longitude: 100.6522 },
];

const routes = [
  { id: 'route-1', name: 'Blue Line — Main Gate Loop', color: '#2563EB', stopIds: ['stop-1', 'stop-2', 'stop-9', 'stop-6', 'stop-5', 'stop-7'], closeLoop: true },
  { id: 'route-2', name: 'Green Line — Academic Zone', color: '#16A34A', stopIds: ['stop-1', 'stop-3', 'stop-4', 'stop-10', 'stop-8'], closeLoop: false },
  { id: 'route-3', name: 'Red Line — Student Services', color: '#DC2626', stopIds: ['stop-1', 'stop-6', 'stop-9', 'stop-7', 'stop-5'], closeLoop: false },
];

const vehicles = [
  { id: 'v-1', name: 'Shuttle Bus 01', type: 'bus', assignedRouteId: 'route-1', status: 'active' as const },
  { id: 'v-2', name: 'Shuttle Bus 02', type: 'bus', assignedRouteId: 'route-2', status: 'active' as const },
  { id: 'v-3', name: 'Shuttle Bus 03', type: 'minibus', assignedRouteId: 'route-3', status: 'active' as const },
  { id: 'v-4', name: 'Shuttle Bus 04', type: 'bus', assignedRouteId: null, status: 'maintenance' as const },
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

    for (let index = 0; index < route.stopIds.length; index += 1) {
      const stopId = route.stopIds[index]!;
      await prisma.routeStop.upsert({
        where: { routeId_stopId: { routeId: route.id, stopId } },
        create: { id: `rs-${route.id}-${index + 1}`, routeId: route.id, stopId, stopOrder: index + 1 },
        update: {},
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

  console.info(`Seeded admin ${username}, ${routes.length} routes, ${stops.length} stops, and ${vehicles.length} vehicles.`);
}

main()
  .catch(error => {
    console.error('Seed failed', error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
