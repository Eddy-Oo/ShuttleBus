import "dotenv/config";
import { hash } from "bcryptjs";
import { PrismaClient, type Prisma } from "@prisma/client";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const prisma = new PrismaClient();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// --------------------------------------------------
// 1. Read campus stops from GeoJSON
// --------------------------------------------------

type StopFeatureCollection = {
  type: "FeatureCollection";
  features: {
    type: "Feature";
    properties: {
      id: string;
      nameTh: string;
      nameEn: string;
      stopOrder: number;
    };
    geometry: {
      type: "Point";
      coordinates: [number, number];
    };
  }[];
};

const stopsGeoJSON = JSON.parse(
  readFileSync(join(__dirname, "../geojson/rsu-campus-stops.geojson"), "utf8")
) as StopFeatureCollection;

if (
  stopsGeoJSON.type !== "FeatureCollection" ||
  !Array.isArray(stopsGeoJSON.features) ||
  stopsGeoJSON.features.length === 0
) {
  throw new Error("Invalid or empty campus stops GeoJSON");
}

const stops = stopsGeoJSON.features
  .map((feature) => {
    if (
      feature.type !== "Feature" ||
      feature.geometry?.type !== "Point" ||
      !feature.properties?.id ||
      typeof feature.properties.stopOrder !== "number" ||
      !Array.isArray(feature.geometry.coordinates) ||
      feature.geometry.coordinates.length !== 2
    ) {
      throw new Error("Invalid stop feature in campus stops GeoJSON");
    }

    const [longitude, latitude] = feature.geometry.coordinates;

    if (
      !Number.isFinite(longitude) ||
      !Number.isFinite(latitude) ||
      longitude < -180 ||
      longitude > 180 ||
      latitude < -90 ||
      latitude > 90
    ) {
      throw new Error(`Invalid coordinates for stop ${feature.properties.id}`);
    }

    return {
      id: feature.properties.id,
      nameTh: feature.properties.nameTh,
      nameEn: feature.properties.nameEn,
      latitude,
      longitude,
      stopOrder: feature.properties.stopOrder,
    };
  })
  .sort((a, b) => a.stopOrder - b.stopOrder);

const stopIds = stops.map((stop) => stop.id);

if (new Set(stopIds).size !== stopIds.length) {
  throw new Error("Duplicate stop IDs found in campus stops GeoJSON");
}

if (new Set(stops.map((stop) => stop.stopOrder)).size !== stops.length) {
  throw new Error("Duplicate stop orders found in campus stops GeoJSON");
}

// --------------------------------------------------
// 2. Read campus route geometry from GeoJSON
// --------------------------------------------------

const routeGeometry = JSON.parse(
  readFileSync(join(__dirname, "../geojson/rsu-campus-loop.geojson"), "utf8")
) as {
  type: string;
  coordinates: number[][];
};

if (
  routeGeometry.type !== "LineString" ||
  !Array.isArray(routeGeometry.coordinates) ||
  routeGeometry.coordinates.length < 2 ||
  routeGeometry.coordinates.some(
    (coordinate) =>
      !Array.isArray(coordinate) ||
      coordinate.length < 2 ||
      !Number.isFinite(coordinate[0]) ||
      !Number.isFinite(coordinate[1])
  )
) {
  throw new Error("Invalid campus route GeoJSON");
}

const geometry = routeGeometry as Prisma.InputJsonValue;

// --------------------------------------------------
// 3. Route configuration
// --------------------------------------------------

const routes = [
  {
    id: "rsu-campus-loop",
    name: "RSU Campus Loop",
    color: "#2563EB",
    stopIds,
  },
];

// --------------------------------------------------
// 4. Vehicle configuration
// --------------------------------------------------

const vehicles = [
  {
    id: "rsu-shuttle-01",
    name: "RSU Shuttle Bus 01",
    type: "bus",
    assignedRouteId: "rsu-campus-loop",
    status: "active" as const,
  },
  {
    id: "rsu-shuttle-02",
    name: "RSU Shuttle Bus 02",
    type: "bus",
    assignedRouteId: "rsu-campus-loop",
    status: "active" as const,
  },
  {
    id: "rsu-shuttle-03",
    name: "RSU Shuttle Bus 03",
    type: "bus",
    assignedRouteId: "rsu-campus-loop",
    status: "active" as const,
  },
];

// --------------------------------------------------
// 5. Main seed process
// --------------------------------------------------

async function main() {
  const username = process.env.ADMIN_USERNAME?.trim();
  const password = process.env.ADMIN_PASSWORD;

  if (!username || !password || password.length < 12) {
    throw new Error(
      "Set ADMIN_USERNAME and an ADMIN_PASSWORD of at least 12 characters before seeding"
    );
  }

  // Provision admin if missing. Existing account remains unchanged.
  const passwordHash = await hash(password, 12);

  await prisma.user.upsert({
    where: { username },
    create: {
      username,
      passwordHash,
      role: "ADMIN",
    },
    update: {},
  });

  if (process.argv.includes("--admin-only")) {
    console.info(
      `Admin ${username} provisioned if missing; existing account unchanged.`
    );
    return;
  }

  // ------------------------------------------------
  // 6. Upsert all stops from GeoJSON
  // ------------------------------------------------

  for (const stop of stops) {
    const { stopOrder, ...stopData } = stop;

    await prisma.stop.upsert({
      where: { id: stop.id },
      create: {
        ...stopData,
        status: "active",
      },
      update: {
        nameTh: stop.nameTh,
        nameEn: stop.nameEn,
        latitude: stop.latitude,
        longitude: stop.longitude,
        status: "active",
      },
    });
  }

  // ------------------------------------------------
  // 7. Upsert route and its geometry
  // ------------------------------------------------

  for (const route of routes) {
    await prisma.route.upsert({
      where: { id: route.id },
      create: {
        id: route.id,
        name: route.name,
        color: route.color,
        status: "active",
        geometry,
      },
      update: {
        name: route.name,
        color: route.color,
        status: "active",
        geometry,
      },
    });

    // Move existing route-stop orders temporarily to avoid
    // collisions with the unique routeId + stopOrder constraint.

    const existingRouteStops = await prisma.routeStop.findMany({
      where: { routeId: route.id },
      select: { id: true, stopOrder: true },
      orderBy: { stopOrder: "asc" },
    });

    const highestExistingOrder = Math.max(
      0,
      ...existingRouteStops.map((item) => item.stopOrder)
    );

    const temporaryOrderStart =
      Math.max(highestExistingOrder, route.stopIds.length) +
      existingRouteStops.length +
      1;

    for (let index = 0; index < existingRouteStops.length; index++) {
      await prisma.routeStop.update({
        where: { id: existingRouteStops[index]!.id },
        data: { stopOrder: temporaryOrderStart + index },
      });
    }

    // Assign stops in GeoJSON stopOrder sequence.

    for (let index = 0; index < route.stopIds.length; index++) {
      const stopId = route.stopIds[index]!;

      await prisma.routeStop.upsert({
        where: {
          routeId_stopId: {
            routeId: route.id,
            stopId,
          },
        },
        create: {
          routeId: route.id,
          stopId,
          stopOrder: index + 1,
        },
        update: {
          stopOrder: index + 1,
        },
      });
    }

    // Remove old route-stop links not present in the GeoJSON.

    await prisma.routeStop.deleteMany({
      where: {
        routeId: route.id,
        stopId: { notIn: route.stopIds },
      },
    });
  }

  // ------------------------------------------------
  // 8. Upsert vehicles
  // ------------------------------------------------

  for (const vehicle of vehicles) {
    await prisma.vehicle.upsert({
      where: { id: vehicle.id },
      create: vehicle,
      update: {
        name: vehicle.name,
        type: vehicle.type,
        assignedRouteId: vehicle.assignedRouteId,
        status: vehicle.status,
      },
    });
  }

  // ------------------------------------------------
  // 9. Remove obsolete seeded records
  // ------------------------------------------------

  const obsoleteRoutes = await prisma.route.findMany({
    where: {
      id: { notIn: routes.map((route) => route.id) },
    },
    select: {
      id: true,
      _count: { select: { trips: true } },
    },
  });

  let preservedRoutes = 0;

  for (const oldRoute of obsoleteRoutes) {
    if (oldRoute._count.trips > 0) {
      preservedRoutes++;
      continue;
    }

    await prisma.routeStop.deleteMany({
      where: { routeId: oldRoute.id },
    });

    await prisma.route.delete({
      where: { id: oldRoute.id },
    });
  }

  const obsoleteVehicles = await prisma.vehicle.findMany({
    where: {
      id: { notIn: vehicles.map((vehicle) => vehicle.id) },
    },
    select: {
      id: true,
      _count: { select: { trips: true } },
    },
  });

  let preservedVehicles = 0;

  for (const oldVehicle of obsoleteVehicles) {
    if (oldVehicle._count.trips > 0) {
      preservedVehicles++;
      continue;
    }

    await prisma.vehicle.delete({
      where: { id: oldVehicle.id },
    });
  }

  // Delete stops that are no longer configured and have no route links.
  // Stops referenced by trip history may still need additional protection.

  await prisma.stop.deleteMany({
    where: {
      id: { notIn: stops.map((stop) => stop.id) },
      routeStops: { none: {} },
    },
  });

  console.info("--------------------------------");
  console.info("RSU Campus data seeded successfully");
  console.info(`Route: ${routes.length}`);
  console.info(`Stops: ${stops.length}`);
  console.info(`Route coordinates: ${routeGeometry.coordinates.length}`);
  console.info(`Vehicles: ${vehicles.length}`);
  console.info(`Preserved historical routes: ${preservedRoutes}`);
  console.info(`Preserved historical vehicles: ${preservedVehicles}`);
  console.info("--------------------------------");
}

// --------------------------------------------------
// 10. Execute and disconnect
// --------------------------------------------------

main()
  .catch((error) => {
    console.error("Seed failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
