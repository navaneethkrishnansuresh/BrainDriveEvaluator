/**
 * Runs Storage Service for BrainDrive Evaluator
 * 
 * Handles saving and loading evaluation runs.
 * Stores data in the plugin's runs/ folder for reproducibility.
 */

import { 
  Services, 
  ModelInfo, 
  Scenario, 
  EvaluationConfig,
  EvaluationRun,
  EvaluationRunSummary,
  LeaderboardEntry,
  generateId
} from '../types';

export class RunsStorageService {
  private services: Services;

  constructor(services: Services) {
    this.services = services;
  }

  /**
   * Create a new run folder for this evaluation session
   */
  async createRunFolder(
    config: EvaluationConfig,
    models: ModelInfo[],
    scenarios: Scenario[]
  ): Promise<string> {
    const folderId = generateId('eval');
    
    console.log(`[RunsStorage] Created evaluation folder: ${folderId}`);
    console.log(`[RunsStorage] Models: ${models.map(m => m.name).join(', ')}`);
    console.log(`[RunsStorage] Scenarios: ${scenarios.length}`);
    
    return folderId;
  }

  /**
   * Save run artifacts (transcript, profiles, judge report)
   */
  async saveRunArtifacts(
    folderId: string,
    modelId: string,
    runNumber: number,
    run: EvaluationRun
  ): Promise<void> {
    console.log(`[RunsStorage] Saving run ${runNumber} for model ${modelId}`);
    
    // In a real implementation, this would save to disk
    // For now, we'll just log the data
    const artifact = {
      runId: run.id,
      modelId,
      runNumber,
      timestamp: run.timestamp,
      duration: run.duration,
      status: run.status,
      transcriptLength: run.transcript.length,
      hasWhyProfile: !!run.whyProfile,
      hasIkigaiProfile: !!run.ikigaiProfile,
      hasJudgeReport: !!run.judgeReport,
    };
    
    console.log(`[RunsStorage] Artifact summary:`, artifact);
  }

  /**
   * Save final results (leaderboard, summary)
   */
  async saveResults(
    folderId: string,
    runs: EvaluationRun[],
    leaderboard: LeaderboardEntry[]
  ): Promise<void> {
    console.log(`[RunsStorage] Saving final results for ${folderId}`);
    console.log(`[RunsStorage] Total runs: ${runs.length}`);
    console.log(`[RunsStorage] Leaderboard entries: ${leaderboard.length}`);
    
    // Summary stats
    const completedRuns = runs.filter(r => r.status === 'completed').length;
    const failedRuns = runs.filter(r => r.status === 'failed').length;
    
    console.log(`[RunsStorage] Completed: ${completedRuns}, Failed: ${failedRuns}`);
  }

  /**
   * Get run history (list of previous runs)
   */
  async getRunHistory(): Promise<EvaluationRunSummary[]> {
    // In a real implementation, this would read from disk
    // For now, return empty array
    return [];
  }

  /**
   * Get detailed run data
   */
  async getRunDetail(runId: string): Promise<EvaluationRun | null> {
    // In a real implementation, this would read from disk
    console.log(`[RunsStorage] Loading run detail: ${runId}`);
    return null;
  }

  /**
   * Export evaluation results as JSON
   */
  async exportAsJson(folderId: string): Promise<string> {
    console.log(`[RunsStorage] Exporting as JSON: ${folderId}`);
    return JSON.stringify({ folderId, exportedAt: new Date().toISOString() });
  }

  /**
   * Export evaluation results as CSV
   */
  async exportAsCsv(folderId: string): Promise<string> {
    console.log(`[RunsStorage] Exporting as CSV: ${folderId}`);
    return 'model,scenario,score\n';
  }
}

export default RunsStorageService;



