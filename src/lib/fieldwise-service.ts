import type { ActionStatus, Recommendation } from "@/types/fieldwise";
import { dashboardSnapshot } from "./fieldwise-seed";

export function getRecommendationById(id: string) {
  return dashboardSnapshot.recommendations.find((item) => item.id === id);
}

export function updateRecommendationStatus(id: string, status: ActionStatus) {
  const item = dashboardSnapshot.recommendations.find((recommendation) => recommendation.id === id);

  if (!item) {
    return undefined;
  }

  item.status = status;
  return item;
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
