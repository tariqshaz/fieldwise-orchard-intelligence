export type SensorStatus = "ok" | "warn" | "offline";
export type ActionStatus = "pending" | "approved" | "dispatched" | "completed" | "rejected";
export type AlertKind = "anomaly" | "irrigation" | "harvest";

export interface Estate {
  id: string;
  name: string;
  location: string;
  timezone: string;
  acreage: number;
  cropFocus: string;
}

export interface Sector {
  id: string;
  estateId: string;
  name: string;
  acreage: number;
  cropType: string;
  ndvi: number;
  moisture: number;
  status: "healthy" | "watch" | "critical";
  riskLevel: "low" | "medium" | "high";
  locationLabel: string;
}

export interface Drone {
  id: string;
  name: string;
  status: "autonomous" | "idle" | "returning";
  battery: number;
  payloadLevel: number;
  altitude: number;
  speed: number;
  signalDbm: number;
}

export interface SensorNode {
  id: string;
  sectorId: string;
  name: string;
  status: SensorStatus;
  moisture: number;
  temperature: number;
  salinity: number;
  batteryLevel: number;
  rssi: number;
}

export interface Recommendation {
  id: string;
  sectorId: string;
  type: "spray" | "irrigation" | "harvest" | "inspection";
  title: string;
  description: string;
  confidence: number;
  status: ActionStatus;
  createdAt: string;
}

export interface AlertRecord {
  id: string;
  sectorId: string;
  kind: AlertKind;
  title: string;
  message: string;
  confidence: number;
  createdAt: string;
  actionLabel?: string;
  severity: "low" | "medium" | "high";
}

export interface KpiSnapshot {
  inputOptimization: number;
  waterEfficiency: number;
  fleetCoverage: number;
  acreageScanned: number;
  pesticideSavedLiters: number;
  irrigationSavingsPercent: number;
}

export interface DashboardSnapshot {
  estate: Estate;
  drone: Drone;
  sectors: Sector[];
  sensorNodes: SensorNode[];
  recommendations: Recommendation[];
  alerts: AlertRecord[];
  kpis: KpiSnapshot;
}
