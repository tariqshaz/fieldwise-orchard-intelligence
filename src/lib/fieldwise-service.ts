import type { ActionStatus, DashboardSnapshot, Recommendation } from "@/types/fieldwise";
import { dashboardSnapshot } from "./fieldwise-seed";

export interface ActionLogEntry {
  id: string;
  recommendationId: string;
  action: ActionStatus;
  createdAt: string;
}

const actionLog: ActionLogEntry[] = [];

export function getFieldwiseSnapshot(): DashboardSnapshot {
  return {
    ...dashboardSnapshot,
    drone: { ...dashboardSnapshot.drone },
    kpis: { ...dashboardSnapshot.kpis },
    sectors: dashboardSnapshot.sectors.map((item) => ({ ...item })),
    sensorNodes: dashboardSnapshot.sensorNodes.map((item) => ({ ...item })),
    recommendations: dashboardSnapshot.recommendations.map((item) => ({ ...item })),
    alerts: dashboardSnapshot.alerts.map((item) => ({ ...item })),
  };
}

export function getActionLog(): ActionLogEntry[] {
  return actionLog.map((entry) => ({ ...entry }));
}

export function getRecommendationById(id: string) {
  return dashboardSnapshot.recommendations.find((item) => item.id === id);
}

export function updateRecommendationStatus(id: string, status: ActionStatus) {
  const item = dashboardSnapshot.recommendations.find((recommendation) => recommendation.id === id);

  if (!item || !isAllowedTransition(item.status, status)) {
    return undefined;
  }

  item.status = status;
  actionLog.unshift({
    id: `${id}-${Date.now()}`,
    recommendationId: id,
    action: status,
    createdAt: new Date().toISOString(),
  });
  return item;
}

function isAllowedTransition(current: ActionStatus, next: ActionStatus) {
  const transitions: Record<ActionStatus, ActionStatus[]> = {
    pending: ["approved", "rejected"],
    approved: ["dispatched", "rejected"],
    dispatched: ["completed"],
    completed: [],
    rejected: [],
  };
  return transitions[current].includes(next);
}

export function getPendingRecommendations(): Recommendation[] {
  return dashboardSnapshot.recommendations.filter((recommendation) => recommendation.status === "pending");
}

export function getRecommendationCounts() {
  return {
    total: dashboardSnapshot.recommendations.length,
    pending: getPendingRecommendations().length,
    approved: dashboardSnapshot.recommendations.filter((recommendation) => recommendation.status === "approved").length,
  };
}

export function getFieldwiseSummary() {
  return {
    estateName: dashboardSnapshot.estate.name,
    activeNodes: dashboardSnapshot.sensorNodes.filter((node) => node.status === "ok").length,
    totalNodes: dashboardSnapshot.sensorNodes.length,
    pendingRecommendations: getPendingRecommendations().length,
    riskSectors: dashboardSnapshot.sectors.filter((sector) => sector.status !== "healthy").length,
  };
}
