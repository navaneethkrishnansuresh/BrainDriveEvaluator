/**
 * BrainDrive Evaluator Type Definitions
 * 
 * ARCHITECTURE: This plugin evaluates BrainDrive plugins (starting with WhyFinder).
 * It imports and calls WhyFinder functions directly - NO DUPLICATION.
 */

// =============================================================================
// SERVICE INTERFACES (same as WhyFinder - reuse their types)
// =============================================================================

export interface Services {
  api: ApiService;
  theme: ThemeService;
  settings?: SettingsService;
  pluginState?: PluginStateService;
}

export interface ApiService {
  get: (url: string, options?: any) => Promise<any>;
  post: (url: string, data: any, options?: any) => Promise<any>;
  put?: (url: string, data: any, options?: any) => Promise<any>;
  delete?: (url: string, options?: any) => Promise<any>;
  postStreaming?: (url: string, data: any, onChunk: (chunk: string) => void, options?: any) => Promise<void>;
}

export interface ThemeService {
  getCurrentTheme: () => string;
  addThemeChangeListener: (listener: (theme: string) => void) => void;
  removeThemeChangeListener: (listener: (theme: string) => void) => void;
}

export interface SettingsService {
  getSetting: (key: string) => Promise<any>;
  setSetting: (key: string, value: any) => Promise<void>;
}

export interface PluginStateService {
  save: (data: any) => Promise<void>;
  load: () => Promise<any>;
}

// =============================================================================
// COMPONENT PROPS & STATE
// =============================================================================

export interface BrainDriveEvaluatorProps {
  services: Services;
  moduleId?: string;
  instanceId?: string;
  config?: Record<string, any>;
}

export interface BrainDriveEvaluatorState {
  // Theme
  currentTheme: string;
  isInitializing: boolean;
  error: string | null;

  // Plugin status
  pluginStatus: PluginStatusMap;
  
  // OpenAI API Key (for synthetic user and judge)
  openaiApiKey: string;
  isApiKeySaved: boolean;
  showApiKeyInput: boolean;
  
  // Active plugin section
  activeSection: SupportedPlugin | null;
  
  // Model selection
  availableModels: ModelInfo[];
  selectedCandidateModels: ModelInfo[];
  syntheticUserModel: ModelInfo | null;
  judgeModel: ModelInfo | null;
  isLoadingModels: boolean;
  
  // Evaluation config
  config: EvaluationConfig;
  
  // Run state
  isRunning: boolean;
  isPaused: boolean;
  progress: RunProgress | null;
  
  // Results
  leaderboard: LeaderboardEntry[];
  completedRuns: EvaluationRun[];
  runHistory: EvaluationRunSummary[];
  selectedRunDetail: EvaluationRunDetail | null;
  
  // Modals
  showRunDetail: boolean;
  showTranscriptViewer: boolean;
  selectedTranscriptRun: EvaluationRun | null;
}

// =============================================================================
// SUPPORTED PLUGINS
// =============================================================================

export type SupportedPlugin = 'whyfinder';

export interface PluginStatusMap {
  whyfinder: PluginStatus;
}

export interface PluginStatus {
  installed: boolean;
  version: string | null;
  error: string | null;
}

export const PLUGIN_INFO: Record<SupportedPlugin, { name: string; icon: string; description: string }> = {
  whyfinder: {
    name: 'WhyFinder',
    icon: 'WF',
    description: 'Discover your Why with AI coaching',
  },
};

// =============================================================================
// MODEL TYPES
// =============================================================================

export interface ModelInfo {
  id: string;
  name: string;
  provider: string;
  providerId?: string;
  serverName?: string;
  serverId?: string;
}

// OpenAI models (direct API) - for synthetic user and judge
export const OPENAI_MODELS: ModelInfo[] = [
  { id: 'gpt-4o', name: 'GPT-4o (Recommended)', provider: 'openai' },
  { id: 'gpt-4o-mini', name: 'GPT-4o Mini', provider: 'openai' },
  { id: 'gpt-4-turbo', name: 'GPT-4 Turbo', provider: 'openai' },
  { id: 'gpt-4', name: 'GPT-4', provider: 'openai' },
  { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo', provider: 'openai' },
  // o1 reasoning series
  { id: 'o1', name: 'o1', provider: 'openai' },
  { id: 'o1-mini', name: 'o1 Mini', provider: 'openai' },
  { id: 'o1-preview', name: 'o1 Preview', provider: 'openai' },
];

// Default models - use GPT-4o for best results
export const DEFAULT_SYNTHETIC_MODEL = OPENAI_MODELS.find(m => m.id === 'gpt-4o') || OPENAI_MODELS[0];
export const DEFAULT_JUDGE_MODEL = OPENAI_MODELS.find(m => m.id === 'gpt-4o') || OPENAI_MODELS[0];

// =============================================================================
// EVALUATION CONFIG
// =============================================================================

export interface EvaluationConfig {
  scenariosPerModel: number;     // How many scenarios each model runs through (default: 3)
  randomScenario: boolean;       // Shuffle scenarios randomly (default: true)
  candidateTemperature: number;  // Temperature for candidate model (default: 0.7)
  judgeTemperature: number;      // Always 0 for consistency
  syntheticUserPrompt: string;   // Custom system prompt override
}

export const DEFAULT_CONFIG: EvaluationConfig = {
  scenariosPerModel: 3,          // Each model runs through 3 scenarios
  randomScenario: true,
  candidateTemperature: 0,       // Default to 0 for deterministic evaluation
  judgeTemperature: 0,
  syntheticUserPrompt: '',
};

// =============================================================================
// SCENARIO TYPES
// =============================================================================

export interface Scenario {
  id: string;
  name: string;
  personaSummary: string;
  constraints: string[];
  goals: string[];
  conflictPoints: string[];
  redLines: string[];
  starterContext: string;
}

// =============================================================================
// RUN & RESULTS TYPES
// =============================================================================

export interface RunProgress {
  status: 'running' | 'paused' | 'completed' | 'error';
  totalRuns: number;
  completedRuns: number;
  currentModel?: string;
  currentScenario?: string;
  currentPhase?: 'why_finder' | 'ikigai' | 'decision_helper' | 'judging';
  currentExchange?: number;
  totalExchanges?: number;
  errorMessage?: string;
}

export interface TranscriptMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  phase?: string;
  exchangeNumber?: number;
}

export interface EvaluationRun {
  id: string;
  modelId: string;
  modelName: string;
  scenarioId: string;
  scenarioName: string;
  timestamp: string;
  duration: number;
  status: 'running' | 'completed' | 'failed';
  transcript: TranscriptMessage[];
  whyProfile: any | null;
  ikigaiProfile: any | null;
  decisionHelperOutput: TranscriptMessage[];
  judgeReport?: JudgeReport;
  metadata: {
    modelProvider: string;
    modelName: string;
    temperature: number;
    pluginVersions: { evaluator: string; whyfinder: string };
    tokenUsage?: { input: number; output: number; total: number };
  };
  // Detailed phase-by-phase token usage
  phaseTokenUsage?: PhaseTokenBreakdown;
}

export interface PhaseTokenBreakdown {
  whyFinder: {
    candidateInput: number;
    candidateOutput: number;
    syntheticInput: number;
    syntheticOutput: number;
  };
  ikigai: {
    candidateInput: number;
    candidateOutput: number;
    syntheticInput: number;
    syntheticOutput: number;
  };
  decisionHelper: {
    candidateInput: number;
    candidateOutput: number;
    syntheticInput: number;
    syntheticOutput: number;
  };
  judge: {
    input: number;
    output: number;
  };
  total: {
    input: number;
    output: number;
    grand: number;
  };
}

export interface EvaluationRunSummary {
  id: string;
  modelName: string;
  scenarioName: string;
  timestamp: string;
  overallScore: number;
  status: string;
}

export interface EvaluationRunDetail extends EvaluationRun {
  // Full run with all details
}

// =============================================================================
// JUDGE TYPES
// =============================================================================

export interface JudgeReport {
  runId: string;
  modelName: string;
  scenarioName: string;
  timestamp: string;
  // The 7 core metrics
  metrics: EvaluationMetrics;
  overallScore: number;
  // Comments section (for Comments button)
  generalComments: string[];
  pros: string[];
  cons: string[];
  pinpointedIssues: PinpointedIssue[];
  // Token usage breakdown (shown in comments section)
  tokenUsage?: TokenUsageBreakdown;
}

export interface TokenUsageBreakdown {
  whyFinder: PhaseTokenUsage;
  ikigai: PhaseTokenUsage;
  decisionHelper: PhaseTokenUsage;
  judge: PhaseTokenUsage;
  total: {
    candidateInput: number;
    candidateOutput: number;
    syntheticInput: number;
    syntheticOutput: number;
    judgeInput: number;
    judgeOutput: number;
    totalInput: number;
    totalOutput: number;
    grandTotal: number;
  };
}

export interface PhaseTokenUsage {
  candidateInput: number;
  candidateOutput: number;
  syntheticInput: number;
  syntheticOutput: number;
}

export interface PinpointedIssue {
  exchange?: number | string;  // Exchange number or phase name
  speaker?: string;            // Who made the error (Coach, User, Profile)
  exactPhrase?: string;        // The exact problematic phrase
  location?: string;           // Legacy: Where in transcript
  issue: string;               // What went wrong
  severity: 'low' | 'medium' | 'high' | 'critical';
  suggestion?: string;         // How to fix it
  expectedBehavior?: string;   // What should have been done
}

// The 7 core evaluation metrics
export interface EvaluationMetrics {
  clarity: MetricScore;              // CLR - Response clarity and coherence
  structuralCorrectness: MetricScore; // STR - No garbage/broken formatting
  consistency: MetricScore;          // CON - Consistent behavior across turns
  coverage: MetricScore;             // COV - Coverage between transcript and profiles
  hallucination: MetricScore;        // HAL - Hallucination detection (10 = no hallucination)
  decisionExpertise: MetricScore;    // DEC - Quality of coaching/decision guidance
  safety: MetricScore;               // SAF - Sensitivity and safety
}

// Legacy types for backward compatibility
export interface TranscriptScores {
  clarity: MetricScore;
  structuralCorrectness: MetricScore;
  consistency: MetricScore;
  decisionExpertise: MetricScore;
}

export interface ProfileScores {
  coverage: MetricScore;
  hallucination: MetricScore;
  safety: MetricScore;
}

export interface MetricScore {
  score: number;
  comment: string;
  evidence: string[];
}

// Kept for backward compatibility
export interface FailureExample {
  type: string;
  description: string;
  transcript_snippet: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

// Full run data for Transcript button (includes profiles as JSON)
export interface TranscriptData {
  transcript: TranscriptMessage[];
  whyProfile: any | null;
  ikigaiProfile: any | null;
  decisionHelperOutput: TranscriptMessage[];
}

// Metric weights for calculating overall score (7 core metrics)
export const METRIC_WEIGHTS = {
  clarity: 0.15,              // CLR
  structuralCorrectness: 0.10, // STR
  consistency: 0.15,          // CON
  coverage: 0.15,             // COV
  hallucination: 0.20,        // HAL (most important)
  decisionExpertise: 0.15,    // DEC
  safety: 0.10,               // SAF
};

// Short metric labels for UI display
export const METRIC_LABELS = {
  clarity: 'CLR',
  structuralCorrectness: 'STR',
  consistency: 'CON',
  coverage: 'COV',
  hallucination: 'HAL',
  decisionExpertise: 'DEC',
  safety: 'SAF',
};

// =============================================================================
// LEADERBOARD TYPES
// =============================================================================

export interface ScenarioScore {
  scenarioId: string;
  scenarioName: string;
  overallScore: number;
  metrics: {
    clarity: number;
    structuralCorrectness: number;
    consistency: number;
    coverage: number;
    hallucination: number;
    decisionExpertise: number;
    safety: number;
  };
  runId: string;
  // Per-scenario comments from judge
  generalComments?: string[];
  pros?: string[];
  cons?: string[];
  pinpointedIssues?: string[];
  // Per-scenario token usage
  tokenUsage?: ScenarioTokenUsage;
}

export interface ScenarioTokenUsage {
  whyFinder: {
    candidateInput: number;
    candidateOutput: number;
    syntheticInput: number;
    syntheticOutput: number;
  };
  ikigai: {
    candidateInput: number;
    candidateOutput: number;
    syntheticInput: number;
    syntheticOutput: number;
  };
  decisionHelper: {
    candidateInput: number;
    candidateOutput: number;
    syntheticInput: number;
    syntheticOutput: number;
  };
  judge: {
    input: number;
    output: number;
  };
  total: {
    input: number;
    output: number;
    grand: number;
  };
}

export interface LeaderboardEntry {
  rank: number;
  modelId: string;
  modelName: string;
  modelProvider: string;
  overallScore: number;
  // Per-metric scores (averages across all runs)
  metrics: {
    clarity: number;
    structuralCorrectness: number;
    consistency: number;
    coverage: number;
    hallucination: number;
    decisionExpertise: number;
    safety: number;
  };
  runCount: number;
  failureCount: number;
  // Scenario-wise breakdown
  scenarioScores: ScenarioScore[];
  // Judge feedback (aggregated)
  topPros: string[];
  topCons: string[];
  pinpointedIssues: string[];
  // For accessing full data
  runIds: string[];
}

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

export function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

export function calculateWeightedScore(metrics: EvaluationMetrics): number {
  let total = 0;
  let weightSum = 0;
  
  for (const [key, weight] of Object.entries(METRIC_WEIGHTS)) {
    const metric = (metrics as any)[key];
    const score = typeof metric === 'object' ? metric.score : (typeof metric === 'number' ? metric : 0);
    total += score * weight;
    weightSum += weight;
  }
  
  return weightSum > 0 ? total / weightSum : 0;
}

export function calculateOverallScore(metrics: EvaluationMetrics): number {
  const scores = [
    metrics.clarity?.score || 0,
    metrics.structuralCorrectness?.score || 0,
    metrics.consistency?.score || 0,
    metrics.coverage?.score || 0,
    metrics.hallucination?.score || 0,
    metrics.decisionExpertise?.score || 0,
    metrics.safety?.score || 0,
  ];
  return scores.reduce((a, b) => a + b, 0) / scores.length;
}
