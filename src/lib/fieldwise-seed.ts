import type {
  AlertRecord,
  DashboardSnapshot,
  Drone,
  Estate,
  KpiSnapshot,
  Recommendation,
  Sector,
  SensorNode,
} from "@/types/fieldwise";

export const estate: Estate = {
  id: "estate-bahria-kasur",
  name: "Bahria Estates",
  location: "Kasur, Punjab",
  timezone: "UTC+05:00",
  acreage: 500,
  cropFocus: "Citrus and orchard management",
};

export const sectors: Sector[] = [
  { id: "sector-1", estateId: estate.id, name: "Sector 1", acreage: 42, cropType: "Citrus", ndvi: 0.72, moisture: 26, status: "healthy", riskLevel: "low", locationLabel: "Northwest block" },
  { id: "sector-2", estateId: estate.id, name: "Sector 2", acreage: 38, cropType: "Citrus", ndvi: 0.57, moisture: 18, status: "watch", riskLevel: "medium", locationLabel: "North central valley" },
  { id: "sector-3", estateId: estate.id, name: "Sector 3", acreage: 44, cropType: "Mango", ndvi: 0.79, moisture: 29, status: "healthy", riskLevel: "low", locationLabel: "Central irrigation lane" },
  { id: "sector-4", estateId: estate.id, name: "Sector 4", acreage: 46, cropType: "Citrus", ndvi: 0.34, moisture: 21, status: "critical", riskLevel: "high", locationLabel: "Southwest rust pocket" },
  { id: "sector-5", estateId: estate.id, name: "Sector 5", acreage: 49, cropType: "Mango", ndvi: 0.69, moisture: 24, status: "healthy", riskLevel: "low", locationLabel: "Western ridge" },
  { id: "sector-6", estateId: estate.id, name: "Sector 6", acreage: 41, cropType: "Guava", ndvi: 0.64, moisture: 27, status: "healthy", riskLevel: "low", locationLabel: "North east slope" },
  { id: "sector-7", estateId: estate.id, name: "Sector 7", acreage: 52, cropType: "Mango", ndvi: 0.76, moisture: 28, status: "healthy", riskLevel: "low", locationLabel: "Southern maturity zone" },
  { id: "sector-8", estateId: estate.id, name: "Sector 8", acreage: 40, cropType: "Citrus", ndvi: 0.58, moisture: 17, status: "watch", riskLevel: "medium", locationLabel: "Low-lying moisture stress" },
  { id: "sector-9", estateId: estate.id, name: "Sector 9", acreage: 45, cropType: "Citrus", ndvi: 0.61, moisture: 23, status: "healthy", riskLevel: "low", locationLabel: "River-side block" },
  { id: "sector-10", estateId: estate.id, name: "Sector 10", acreage: 48, cropType: "Mango", ndvi: 0.7, moisture: 25, status: "healthy", riskLevel: "low", locationLabel: "East compact field" },
  { id: "sector-11", estateId: estate.id, name: "Sector 11", acreage: 55, cropType: "Orchard mix", ndvi: 0.48, moisture: 19, status: "watch", riskLevel: "medium", locationLabel: "Northern wind shear band" },
];

export const drone: Drone = {
  id: "drone-uav-01",
  name: "UAV-01 · Sirius",
  status: "autonomous",
  battery: 42,
  payloadLevel: 68,
  altitude: 42,
  speed: 8.4,
  signalDbm: -61,
};

export const sensorNodes: SensorNode[] = [
  { id: "sensor-1", sectorId: "sector-1", name: "S1-01", status: "ok", moisture: 28, temperature: 27.4, salinity: 1.7, batteryLevel: 92, rssi: -71 },
  { id: "sensor-2", sectorId: "sector-1", name: "S1-02", status: "ok", moisture: 31, temperature: 26.9, salinity: 1.6, batteryLevel: 89, rssi: -73 },
  { id: "sensor-3", sectorId: "sector-2", name: "S2-01", status: "warn", moisture: 18, temperature: 30.1, salinity: 2.1, batteryLevel: 58, rssi: -82 },
  { id: "sensor-4", sectorId: "sector-2", name: "S2-02", status: "ok", moisture: 19, temperature: 29.7, salinity: 2.0, batteryLevel: 74, rssi: -77 },
  { id: "sensor-5", sectorId: "sector-3", name: "S3-01", status: "ok", moisture: 30, temperature: 26.5, salinity: 1.5, batteryLevel: 94, rssi: -68 },
  { id: "sensor-6", sectorId: "sector-4", name: "S4-01", status: "warn", moisture: 22, temperature: 31.2, salinity: 2.4, batteryLevel: 63, rssi: -86 },
  { id: "sensor-7", sectorId: "sector-4", name: "S4-02", status: "ok", moisture: 21, temperature: 31.6, salinity: 2.3, batteryLevel: 61, rssi: -84 },
  { id: "sensor-8", sectorId: "sector-5", name: "S5-01", status: "ok", moisture: 26, temperature: 28.4, salinity: 1.8, batteryLevel: 87, rssi: -75 },
  { id: "sensor-9", sectorId: "sector-6", name: "S6-01", status: "ok", moisture: 29, temperature: 27.2, salinity: 1.6, batteryLevel: 90, rssi: -70 },
  { id: "sensor-10", sectorId: "sector-6", name: "S6-02", status: "warn", moisture: 24, temperature: 28.6, salinity: 2.0, batteryLevel: 56, rssi: -88 },
  { id: "sensor-11", sectorId: "sector-7", name: "S7-01", status: "ok", moisture: 32, temperature: 26.8, salinity: 1.5, batteryLevel: 95, rssi: -69 },
  { id: "sensor-12", sectorId: "sector-8", name: "S8-01", status: "warn", moisture: 17, temperature: 30.9, salinity: 2.2, batteryLevel: 59, rssi: -89 },
  { id: "sensor-13", sectorId: "sector-9", name: "S9-01", status: "ok", moisture: 25, temperature: 28.7, salinity: 1.8, batteryLevel: 88, rssi: -72 },
  { id: "sensor-14", sectorId: "sector-10", name: "S10-01", status: "ok", moisture: 27, temperature: 27.9, salinity: 1.7, batteryLevel: 91, rssi: -74 },
  { id: "sensor-15", sectorId: "sector-11", name: "S11-01", status: "warn", moisture: 19, temperature: 29.5, salinity: 2.1, batteryLevel: 60, rssi: -80 },
  { id: "sensor-16", sectorId: "sector-11", name: "S11-02", status: "offline", moisture: 0, temperature: 0, salinity: 0, batteryLevel: 0, rssi: -100 },
];

export const recommendations: Recommendation[] = [
  {
    id: "rec-001",
    sectorId: "sector-4",
    type: "spray",
    title: "Approve rust mitigation dispatch",
    description: "NDVI decline indicates localized fungal stress. A targeted spray is more efficient than broad application.",
    confidence: 0.94,
    status: "pending",
    createdAt: "2026-06-02T14:32:08Z",
  },
  {
    id: "rec-002",
    sectorId: "sector-2",
    type: "irrigation",
    title: "Open valve for 45-minute localized watering",
    description: "Soil moisture is below optimal threshold and stress risk is rising in this sector.",
    confidence: 0.88,
    status: "approved",
    createdAt: "2026-06-02T14:29:51Z",
  },
  {
    id: "rec-003",
    sectorId: "sector-7",
    type: "harvest",
    title: "Schedule harvest preparation",
    description: "Biomass maturity is approaching the recommended window for harvest staging.",
    confidence: 0.81,
    status: "pending",
    createdAt: "2026-06-02T14:18:02Z",
  },
];

export const alerts: AlertRecord[] = [
  {
    id: "alert-1",
    sectorId: "sector-4",
    kind: "anomaly",
    title: "Critical anomaly detected",
    message: "Suspected rust disease in Sector 4. Drone spot-spray mission generated. Awaiting approval.",
    confidence: 0.94,
    createdAt: "2026-06-02T14:32:08Z",
    actionLabel: "Approve dispatch",
    severity: "high",
  },
  {
    id: "alert-2",
    sectorId: "sector-2",
    kind: "irrigation",
    title: "Localized irrigation trigger",
    message: "Soil moisture dropped below 20%. Opening IoT valve 03 for 45 minutes.",
    confidence: 0.88,
    createdAt: "2026-06-02T14:29:51Z",
    severity: "medium",
  },
  {
    id: "alert-3",
    sectorId: "sector-7",
    kind: "harvest",
    title: "Harvest window forecast",
    message: "Biomass growth analysis indicates peak maturity in 14 days. Prepare logistics.",
    confidence: 0.81,
    createdAt: "2026-06-02T14:18:02Z",
    actionLabel: "View schedule",
    severity: "low",
  },
  {
    id: "alert-4",
    sectorId: "sector-11",
    kind: "anomaly",
    title: "Wind shear advisory",
    message: "Gusts above 6.2 m/s expected over Sector 11. Auto-rerouting waypoints 7–9.",
    confidence: 0.76,
    createdAt: "2026-06-02T14:11:37Z",
    severity: "medium",
  },
];

export const kpis: KpiSnapshot = {
  inputOptimization: 34,
  waterEfficiency: -28,
  fleetCoverage: 90,
  acreageScanned: 450,
  pesticideSavedLiters: 120,
  irrigationSavingsPercent: 28,
};

export const dashboardSnapshot: DashboardSnapshot = {
  estate,
  drone,
  sectors,
  sensorNodes,
  recommendations,
  alerts,
  kpis,
};

export const activeSensorNodes = sensorNodes.filter((node) => node.status === "ok").length;

export function getDashboardSnapshot(): DashboardSnapshot {
  return {
    ...dashboardSnapshot,
    sectors: dashboardSnapshot.sectors.map((sector) => ({ ...sector })),
    sensorNodes: dashboardSnapshot.sensorNodes.map((node) => ({ ...node })),
    recommendations: dashboardSnapshot.recommendations.map((item) => ({ ...item })),
    alerts: dashboardSnapshot.alerts.map((alert) => ({ ...alert })),
  };
}

export function getRecommendationSummary() {
  return {
    total: recommendations.length,
    pending: recommendations.filter((item) => item.status === "pending").length,
    approved: recommendations.filter((item) => item.status === "approved").length,
  };
}

export function getSectorStatusCounts() {
  return sectors.reduce(
    (acc, sector) => {
      acc[sector.status] = (acc[sector.status] ?? 0) + 1;
      return acc;
    },
    { healthy: 0, watch: 0, critical: 0 } as Record<string, number>,
  );
}

export function getActiveSensorNodeCount() {
  return sensorNodes.filter((node) => node.status === "ok").length;
}

export function getTelemetrySummary() {
  return {
    activeNodes: getActiveSensorNodeCount(),
    totalNodes: sensorNodes.length,
    droneBattery: drone.battery,
    dronePayload: drone.payloadLevel,
    averageMoisture: sensorNodes.reduce((sum, node) => sum + node.moisture, 0) / sensorNodes.length,
  };
}

export const seedInventory = {
  estate,
  sectors,
  drone,
  sensorNodes,
  recommendations,
  alerts,
  kpis,
};

export default dashboardSnapshot;




















































































































































































































