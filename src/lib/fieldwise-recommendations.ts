import type { Recommendation } from "@/types/fieldwise";
import { dashboardSnapshot, sectors, sensorNodes } from "./fieldwise-seed";

export function getFieldwiseRecommendations(): Recommendation[] {
  return dashboardSnapshot.recommendations.map((recommendation) => ({ ...recommendation }));
}

export function getStressedSectors() {
  return sectors
    .filter((sector) => sector.ndvi < 0.5 || sector.moisture < 20)
    .map((sector) => ({
      ...sector,
      sensorCount: sensorNodes.filter((node) => node.sectorId === sector.id).length,
    }));
}

export function generateRuleBasedRecommendations(): Recommendation[] {
  return [
    ...sectors
      .filter((sector) => sector.moisture < 20)
      .map((sector) => ({
        id: `rule-${sector.id}`,
        sectorId: sector.id,
        type: "irrigation" as const,
        title: `Irrigation trigger for ${sector.name}`,
        description: `${sector.name} is below moisture threshold and needs localized irrigation support.`,
        confidence: 0.86,
        status: "pending" as const,
        createdAt: new Date().toISOString(),
      })),
    ...sectors
      .filter((sector) => sector.ndvi < 0.5)
      .map((sector) => ({
        id: `risk-${sector.id}`,
        sectorId: sector.id,
        type: "spray" as const,
        title: `Targeted review for ${sector.name}`,
        description: `${sector.name} is showing elevated stress and may require a targeted agri intervention.`,
        confidence: 0.9,
        status: "pending" as const,
        createdAt: new Date().toISOString(),
      })),
  ];
}
