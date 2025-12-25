/**
 * Evaluation Service for BrainDrive Evaluator
 * 
 * Orchestrates the full evaluation pipeline:
 * 1. Run evaluations across multiple models and scenarios
 * 2. Collect results and judge each run
 * 3. Aggregate into leaderboard
 */

import { 
  Services, 
  ModelInfo, 
  Scenario, 
  EvaluationConfig,
  EvaluationRun,
  LeaderboardEntry,
  RunProgress,
  generateId
} from '../types';

import { OrchestratorService } from './orchestratorService';
import { JudgeService } from './judgeService';
import { RunsStorageService } from './runsStorageService';
import { ModelService } from './modelService';

// Storage key for incremental saves
// Using sessionStorage: persists during page refreshes but clears when tab is closed
const INCREMENTAL_RESULTS_KEY = 'braindrive_evaluator_results';
// Timeout for results to be considered valid (30 minutes)
const RESULTS_TTL_MS = 30 * 60 * 1000;

export class EvaluationService {
  private services: Services;
  private orchestrator: OrchestratorService;
  private judge: JudgeService;
  private storage: RunsStorageService;
  private modelService: ModelService;
  
  private isRunning = false;
  private isPaused = false;
  private abortRequested = false;

  constructor(services: Services) {
    this.services = services;
    this.orchestrator = new OrchestratorService(services);
    this.judge = new JudgeService(services);
    this.storage = new RunsStorageService(services);
    this.modelService = new ModelService(services);
  }

  /**
   * Set the model service (for sharing API key state)
   */
  setModelService(modelService: ModelService): void {
    this.modelService = modelService;
    this.orchestrator.setModelService(modelService);
    this.judge.setModelService(modelService);
  }

  /**
   * Save results to sessionStorage after each model's judgment completes
   * sessionStorage: persists across page refreshes within the same tab, clears when tab closes
   * This is exactly what we want - temporary storage that survives unexpected refreshes
   */
  private saveIncrementalResults(runs: EvaluationRun[], models: ModelInfo[]): void {
    try {
      const leaderboard = this.buildLeaderboard(runs, models);
      const data = {
        runs,
        leaderboard,
        timestamp: Date.now(),
        status: 'in_progress',
      };
      
      // Use sessionStorage - survives page refresh, clears on tab close
      sessionStorage.setItem(INCREMENTAL_RESULTS_KEY, JSON.stringify(data));
      console.log(`[EvaluationService] 💾 SAVED ${runs.length} runs to sessionStorage`);
      console.log(`[EvaluationService] 💾 Leaderboard has ${leaderboard.length} entries`);
      
      // Verify the save worked
      const verify = sessionStorage.getItem(INCREMENTAL_RESULTS_KEY);
      if (verify) {
        console.log(`[EvaluationService] ✅ Save verified (${verify.length} bytes)`);
      }
    } catch (error) {
      console.error('[EvaluationService] ❌ FAILED to save results:', error);
    }
  }

  /**
   * Mark results as complete in sessionStorage
   */
  private markResultsComplete(runs: EvaluationRun[], leaderboard: LeaderboardEntry[]): void {
    try {
      const data = {
        runs,
        leaderboard,
        timestamp: Date.now(),
        status: 'completed',
      };
      sessionStorage.setItem(INCREMENTAL_RESULTS_KEY, JSON.stringify(data));
      console.log(`[EvaluationService] ✅ COMPLETE: ${runs.length} runs, ${leaderboard.length} leaderboard entries saved`);
    } catch (error) {
      console.error('[EvaluationService] ❌ FAILED to mark complete:', error);
    }
  }

  /**
   * Get stored results from sessionStorage (for recovery after page refresh)
   * This is a STATIC method so it can be called from the component before the service is initialized
   */
  static getStoredResults(): { runs: EvaluationRun[]; leaderboard: LeaderboardEntry[]; status: string } | null {
    try {
      console.log(`[EvaluationService] 🔍 Checking sessionStorage for stored results...`);
      const stored = sessionStorage.getItem(INCREMENTAL_RESULTS_KEY);
      
      if (stored) {
        console.log(`[EvaluationService] 📦 Found data (${stored.length} bytes)`);
        const data = JSON.parse(stored);
        const age = Date.now() - data.timestamp;
        const ageMinutes = Math.round(age / 1000 / 60);
        
        console.log(`[EvaluationService] 📊 Stored results:`);
        console.log(`  - Runs: ${data.runs?.length || 0}`);
        console.log(`  - Leaderboard: ${data.leaderboard?.length || 0}`);
        console.log(`  - Status: ${data.status}`);
        console.log(`  - Age: ${ageMinutes} minutes`);
        
        // Only return if within TTL
        if (age < RESULTS_TTL_MS) {
          console.log(`[EvaluationService] ✅ Results valid, returning for display`);
          return { runs: data.runs || [], leaderboard: data.leaderboard || [], status: data.status || 'unknown' };
        } else {
          console.log(`[EvaluationService] ⏰ Results expired (>${RESULTS_TTL_MS / 60000} min old)`);
          sessionStorage.removeItem(INCREMENTAL_RESULTS_KEY);
        }
      } else {
        console.log(`[EvaluationService] 📭 No stored results found`);
      }
    } catch (error) {
      console.error('[EvaluationService] ❌ Error loading stored results:', error);
    }
    return null;
  }

  /**
   * Clear stored results from sessionStorage
   */
  static clearStoredResults(): void {
    try {
      sessionStorage.removeItem(INCREMENTAL_RESULTS_KEY);
      console.log('[EvaluationService] 🗑️ Cleared stored results');
    } catch (error) {
      // Ignore
    }
  }

  /**
   * Run full evaluation across multiple candidate models
   */
  async runEvaluation(
    candidateModels: ModelInfo[],
    syntheticUserModel: ModelInfo,
    judgeModel: ModelInfo,
    scenarios: Scenario[],
    config: EvaluationConfig,
    onProgress: (progress: RunProgress) => void
  ): Promise<{ runs: EvaluationRun[]; leaderboard: LeaderboardEntry[] }> {
    this.isRunning = true;
    this.isPaused = false;
    this.abortRequested = false;

    const allRuns: EvaluationRun[] = [];
    // Total runs = number of models × scenarios per model
    const totalRuns = candidateModels.length * config.scenariosPerModel;
    let completedRuns = 0;
    
    console.log(`[EvaluationService] Starting evaluation: ${candidateModels.length} models × ${config.scenariosPerModel} scenarios = ${totalRuns} total runs`);

    // Create run folder
    const runFolderId = await this.storage.createRunFolder(config, candidateModels, scenarios);

    try {
      for (const model of candidateModels) {
        // Select scenarios for this model
        const selectedScenarios = this.selectScenarios(scenarios, config);

        for (let runIdx = 0; runIdx < selectedScenarios.length; runIdx++) {
          // Check for pause/abort
          while (this.isPaused && !this.abortRequested) {
            await new Promise(resolve => setTimeout(resolve, 100));
          }

          if (this.abortRequested) {
            break;
          }

          const scenario = selectedScenarios[runIdx];

          onProgress({
            status: 'running',
            totalRuns,
            completedRuns,
            currentModel: model.name,
            currentScenario: scenario.name,
            currentPhase: 'why_finder',
            currentExchange: 0,
            totalExchanges: 12,
          });

          // Run single evaluation
          console.log(`[EvaluationService] Starting run ${runIdx + 1} for model ${model.name} on scenario ${scenario.name}`);
          
          const run = await this.orchestrator.runSingleEvaluation(
            model,
            syntheticUserModel,
            scenario,
            config,
            (phase, exchange, total) => {
              onProgress({
                status: 'running',
                totalRuns,
                completedRuns,
                currentModel: model.name,
                currentScenario: scenario.name,
                currentPhase: phase as any,
                currentExchange: exchange,
                totalExchanges: total,
              });
            }
          );

          console.log(`[EvaluationService] Run completed with status: ${run.status}, transcript length: ${run.transcript.length}`);

          // Only judge runs that completed successfully with actual content
          if (run.status === 'completed' && run.transcript.length > 0) {
            // Judge the run
            onProgress({
              status: 'running',
              totalRuns,
              completedRuns,
              currentModel: model.name,
              currentScenario: scenario.name,
              currentPhase: 'judging',
            });

            // Set phase to judge for token tracking
            this.modelService.setCurrentPhase('judge');
            const judgeReport = await this.judge.judgeRun(run, judgeModel);
            run.judgeReport = judgeReport;
            
            // Update phaseTokenUsage with judge tokens
            const currentTokenUsage = this.modelService.getTokenUsage();
            if (!run.phaseTokenUsage) {
              run.phaseTokenUsage = currentTokenUsage;
            } else {
              run.phaseTokenUsage.judge = currentTokenUsage.judge;
              run.phaseTokenUsage.total = currentTokenUsage.total;
            }
            
            console.log(`[EvaluationService] Judging completed for run ${run.id}`);
          } else {
            // Get error message if available
            const errorMsg = (run.metadata as any)?.errorMessage || 'Unknown error';
            console.warn(`[EvaluationService] Skipping judging for failed/empty run ${run.id}: ${errorMsg}`);
            
            // Update progress to show the error
            onProgress({
              status: 'running',
              totalRuns,
              completedRuns,
              currentModel: model.name,
              currentScenario: scenario.name,
              currentPhase: 'why_finder',
              errorMessage: `Run failed: ${errorMsg}`,
            });
          }

          // Save run artifacts
          await this.storage.saveRunArtifacts(runFolderId, model.id, runIdx + 1, run);

          allRuns.push(run);
          completedRuns++;

          // SAVE INCREMENTALLY after each run to survive token refresh
          this.saveIncrementalResults(allRuns, candidateModels);
        }

        if (this.abortRequested) break;
      }

      // Build leaderboard
      const leaderboard = this.buildLeaderboard(allRuns, candidateModels);

      // Save final results
      await this.storage.saveResults(runFolderId, allRuns, leaderboard);

      // Mark results as complete in sessionStorage
      this.markResultsComplete(allRuns, leaderboard);

      onProgress({
        status: 'completed',
        totalRuns,
        completedRuns,
      });

      return { runs: allRuns, leaderboard };

    } catch (error) {
      onProgress({
        status: 'error',
        totalRuns,
        completedRuns,
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Select scenarios based on config
   * scenariosPerModel determines how many different scenarios each model will be tested on
   */
  private selectScenarios(scenarios: Scenario[], config: EvaluationConfig): Scenario[] {
    // Use scenariosPerModel (previously runsPerModel)
    const count = Math.min(config.scenariosPerModel, scenarios.length);
    
    console.log(`[EvaluationService] Selecting ${count} scenarios from ${scenarios.length} available`);
    
    if (count === 0) {
      console.warn('[EvaluationService] No scenarios to select!');
      return [];
    }
    
    if (config.randomScenario) {
      // Shuffle and take first N
      const shuffled = [...scenarios].sort(() => Math.random() - 0.5);
      return shuffled.slice(0, count);
    }
    
    return scenarios.slice(0, count);
  }

  /**
   * Build leaderboard from evaluation runs
   */
  private buildLeaderboard(runs: EvaluationRun[], models: ModelInfo[]): LeaderboardEntry[] {
    console.log(`[EvaluationService] Building leaderboard from ${runs.length} runs and ${models.length} models`);
    
    const modelResults: Map<string, EvaluationRun[]> = new Map();

    // Group runs by model
    for (const run of runs) {
      console.log(`[EvaluationService] Run ${run.id}: modelId=${run.modelId}, modelName=${run.modelName}`);
      if (!modelResults.has(run.modelId)) {
        modelResults.set(run.modelId, []);
      }
      modelResults.get(run.modelId)!.push(run);
    }

    console.log(`[EvaluationService] Grouped into ${modelResults.size} unique models`);
    modelResults.forEach((runs, modelId) => {
      console.log(`[EvaluationService]   Model ${modelId}: ${runs.length} runs`);
    });

    // Build entries - iterate over ALL unique model IDs from runs, not just models array
    const entries: LeaderboardEntry[] = [];
    
    // Get all unique model IDs from both runs and models
    const allModelIds = new Set<string>();
    runs.forEach(r => allModelIds.add(r.modelId));
    models.forEach(m => allModelIds.add(m.id));
    
    console.log(`[EvaluationService] Total unique model IDs: ${allModelIds.size}`);

    for (const modelId of Array.from(allModelIds)) {
      const modelRuns = modelResults.get(modelId) || [];
      if (modelRuns.length === 0) {
        console.log(`[EvaluationService] Skipping model ${modelId}: no runs found`);
        continue;
      }
      
      // Get model info from models array or from run
      const model = models.find(m => m.id === modelId);
      const modelName = model?.name || modelRuns[0]?.modelName || 'Unknown Model';
      const modelProvider = model?.provider || 'unknown';

      const scores = modelRuns
        .filter(r => r.judgeReport)
        .map(r => r.judgeReport!);

      if (scores.length === 0) {
        console.log(`[EvaluationService] Skipping model ${modelId}: no judged runs`);
        continue;
      }

      console.log(`[EvaluationService] Building entry for model ${modelId} (${modelName}) with ${scores.length} scored runs`);

      // Calculate averages
      const avgOverall = scores.reduce((sum, s) => sum + s.overallScore, 0) / scores.length;

      // Aggregate metric scores using the 7 core metrics
      const metrics = {
        clarity: this.avgMetricFromMetrics(scores, 'clarity'),
        structuralCorrectness: this.avgMetricFromMetrics(scores, 'structuralCorrectness'),
        consistency: this.avgMetricFromMetrics(scores, 'consistency'),
        coverage: this.avgMetricFromMetrics(scores, 'coverage'),
        hallucination: this.avgMetricFromMetrics(scores, 'hallucination'),
        decisionExpertise: this.avgMetricFromMetrics(scores, 'decisionExpertise'),
        safety: this.avgMetricFromMetrics(scores, 'safety'),
      };

      // Count failures from pinpointed issues
      const failureCount = scores.reduce((sum, s) => sum + (s.pinpointedIssues?.length || 0), 0);

      // Aggregate pros, cons, and pinpointed issues across all runs
      const allPros = scores.flatMap(s => s.pros || []);
      const allCons = scores.flatMap(s => s.cons || []);
      const allIssues = scores.flatMap(s => 
        (s.pinpointedIssues || []).map(issue => {
          // Handle both old and new issue formats
          const location = issue.exchange ? `Exchange ${issue.exchange}` : (issue.location || 'Unknown');
          const phrase = issue.exactPhrase ? `: "${issue.exactPhrase.substring(0, 50)}..."` : '';
          return `[${issue.severity}] ${location}${phrase}: ${issue.issue}`;
        })
      );
      
      // Get top unique items
      const topPros = this.getTopItems(allPros, 5);
      const topCons = this.getTopItems(allCons, 5);
      const pinpointedIssues = this.getTopItems(allIssues, 5);

      // Build scenario-wise scores WITH per-scenario comments and token usage
      const scenarioScores = modelRuns
        .filter(r => r.judgeReport)
        .map(r => {
          const report = r.judgeReport!;
          // Format pinpointed issues for this scenario
          const formattedIssues = (report.pinpointedIssues || []).map(issue => {
            const location = issue.exchange ? `Exchange ${issue.exchange}` : (issue.location || 'Unknown');
            const phrase = issue.exactPhrase ? `: "${issue.exactPhrase.substring(0, 50)}..."` : '';
            return `[${issue.severity}] ${location}${phrase}: ${issue.issue}`;
          });
          
          // Get token usage for this run
          const phaseTokenUsage = r.phaseTokenUsage;
          const tokenUsage = phaseTokenUsage ? {
            whyFinder: phaseTokenUsage.whyFinder,
            ikigai: phaseTokenUsage.ikigai,
            decisionHelper: phaseTokenUsage.decisionHelper,
            judge: phaseTokenUsage.judge,
            total: phaseTokenUsage.total,
          } : undefined;
          
          return {
            scenarioId: r.scenarioId,
            scenarioName: r.scenarioName,
            overallScore: report.overallScore,
            metrics: {
              clarity: report.metrics?.clarity?.score || 0,
              structuralCorrectness: report.metrics?.structuralCorrectness?.score || 0,
              consistency: report.metrics?.consistency?.score || 0,
              coverage: report.metrics?.coverage?.score || 0,
              hallucination: report.metrics?.hallucination?.score || 0,
              decisionExpertise: report.metrics?.decisionExpertise?.score || 0,
              safety: report.metrics?.safety?.score || 0,
            },
            runId: r.id,
            // Per-scenario comments
            generalComments: report.generalComments || [],
            pros: report.pros || [],
            cons: report.cons || [],
            pinpointedIssues: formattedIssues,
            // Per-scenario token usage
            tokenUsage,
          };
        });

      entries.push({
        rank: 0, // Will be set after sorting
        modelId: modelId,
        modelName: modelName,
        modelProvider: modelProvider,
        overallScore: avgOverall,
        metrics,
        runCount: modelRuns.length,
        failureCount,
        scenarioScores,
        topPros,
        topCons,
        pinpointedIssues,
        runIds: modelRuns.map(r => r.id),
      });
    }

    // Sort by overall score descending
    entries.sort((a, b) => b.overallScore - a.overallScore);

    // Assign ranks
    entries.forEach((entry, idx) => {
      entry.rank = idx + 1;
    });

    return entries;
  }

  /**
   * Calculate average of a specific metric from the new metrics structure
   */
  private avgMetricFromMetrics(scores: any[], metricKey: string): number {
    const values = scores
      .map(s => s.metrics?.[metricKey]?.score || 0)
      .filter(v => v > 0);

    if (values.length === 0) return 0;
    return values.reduce((a, b) => a + b, 0) / values.length;
  }

  /**
   * Calculate average of a specific metric across all scores (legacy)
   */
  private avgMetric(scores: any[], metricKey: string): number {
    const values = scores
      .map(s => (s.profileScores as any)?.[metricKey]?.score || 0)
      .filter(v => v > 0);

    if (values.length === 0) return 0;
    return values.reduce((a, b) => a + b, 0) / values.length;
  }

  /**
   * Calculate variance of a set of values
   */
  private calculateVariance(values: number[]): number {
    if (values.length === 0) return 0;
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const squaredDiffs = values.map(v => Math.pow(v - mean, 2));
    return squaredDiffs.reduce((a, b) => a + b, 0) / values.length;
  }

  /**
   * Get top failure modes across all scores
   */
  private getTopFailureModes(scores: any[]): string[] {
    const failureCounts: Map<string, number> = new Map();

    for (const score of scores) {
      for (const failure of score.failureExamples || []) {
        const type = failure.type || 'unknown';
        failureCounts.set(type, (failureCounts.get(type) || 0) + 1);
      }
    }

    return Array.from(failureCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([type]) => type);
  }

  /**
   * Get top unique items from a list (deduplicated and sorted by frequency)
   */
  private getTopItems(items: string[], count: number): string[] {
    if (!items || items.length === 0) return [];
    
    // Normalize and count frequency
    const counts: Map<string, number> = new Map();
    for (const item of items) {
      const normalized = item.trim().toLowerCase();
      if (normalized) {
        counts.set(normalized, (counts.get(normalized) || 0) + 1);
      }
    }

    // Sort by frequency and get top N unique items
    const sorted = Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, count);

    // Return original casing from first occurrence
    return sorted.map(([normalized]) => {
      const original = items.find(i => i.trim().toLowerCase() === normalized);
      return original || normalized;
    });
  }

  /**
   * Pause evaluation
   */
  pause(): void {
    this.isPaused = true;
  }

  /**
   * Resume evaluation
   */
  resume(): void {
    this.isPaused = false;
  }

  /**
   * Abort evaluation
   */
  abort(): void {
    this.abortRequested = true;
    this.orchestrator.abort();
  }

  /**
   * Get run detail
   */
  async getRunDetail(runId: string): Promise<EvaluationRun | null> {
    return this.storage.getRunDetail(runId);
  }

  /**
   * Check if evaluation is running
   */
  getIsRunning(): boolean {
    return this.isRunning;
  }
}

export default EvaluationService;


