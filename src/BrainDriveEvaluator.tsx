/**
 * BrainDrive Evaluator
 * 
 * Automated evaluation plugin for BrainDrive plugins.
 * Currently supports: WhyFinder
 * 
 * This plugin calls WhyFinder functions DIRECTLY - no duplication.
 */

import React, { Component } from 'react';
import './BrainDriveEvaluator.css';

import {
  BrainDriveEvaluatorProps,
  BrainDriveEvaluatorState,
  Services,
  ModelInfo,
  EvaluationConfig,
  EvaluationRun,
  LeaderboardEntry,
  RunProgress,
  SupportedPlugin,
  PluginStatusMap,
  PLUGIN_INFO,
  OPENAI_MODELS,
  DEFAULT_CONFIG,
  DEFAULT_SYNTHETIC_MODEL,
  DEFAULT_JUDGE_MODEL,
} from './types';

import { defaultScenarios } from './data/scenarioBank';
import { 
  PluginChecker, 
  ModelService, 
  EvaluationService 
} from './services';

import { Leaderboard } from './components/Leaderboard';
import { RunDetail } from './components/RunDetail';
import { ProgressPanel } from './components/ProgressPanel';

// Initial state
const INITIAL_STATE: BrainDriveEvaluatorState = {
  currentTheme: 'dark',
  isInitializing: true,
  error: null,
  pluginStatus: {
    whyfinder: { installed: false, version: null, error: null },
  },
  openaiApiKey: '',
  isApiKeySaved: false,
  showApiKeyInput: false,
  activeSection: null,
  availableModels: [],
  selectedCandidateModels: [],
  syntheticUserModel: DEFAULT_SYNTHETIC_MODEL,
  judgeModel: DEFAULT_JUDGE_MODEL,
  isLoadingModels: false,
  config: { ...DEFAULT_CONFIG },
  isRunning: false,
  isPaused: false,
  progress: null,
  leaderboard: [],
  completedRuns: [],
  runHistory: [],
  selectedRunDetail: null,
  showRunDetail: false,
  showTranscriptViewer: false,
  selectedTranscriptRun: null,
};

export class BrainDriveEvaluator extends Component<BrainDriveEvaluatorProps, BrainDriveEvaluatorState> {
  private pluginChecker: PluginChecker | null = null;
  private modelService: ModelService | null = null;
  private evaluationService: EvaluationService | null = null;
  private themeListener: ((theme: string) => void) | null = null;
  
  // Token refresh timer - keeps session alive during long evaluations
  private tokenRefreshInterval: ReturnType<typeof setInterval> | null = null;
  // Refresh token every 4 minutes (token typically expires in 15 min)
  private static readonly TOKEN_REFRESH_INTERVAL_MS = 4 * 60 * 1000;

  constructor(props: BrainDriveEvaluatorProps) {
    super(props);
    this.state = { ...INITIAL_STATE };
  }

  async componentDidMount() {
    await this.initialize();
  }

  componentWillUnmount() {
    console.log(`[BrainDriveEvaluator] ⚠️ Component UNMOUNTING (this may be due to token refresh)`);
    console.log(`[BrainDriveEvaluator] Current state: isRunning=${this.state.isRunning}, completedRuns=${this.state.completedRuns.length}, leaderboard=${this.state.leaderboard.length}`);
    
    // Stop token refresh timer
    this.stopTokenRefreshTimer();
    
    if (this.themeListener && this.props.services?.theme) {
      this.props.services.theme.removeThemeChangeListener(this.themeListener);
    }
  }
  
  // ===========================================================================
  // TOKEN REFRESH MANAGEMENT - Keeps session alive during long evaluations
  // ===========================================================================
  
  private startTokenRefreshTimer() {
    // Clear any existing timer
    this.stopTokenRefreshTimer();
    
    console.log(`[BrainDriveEvaluator] 🔄 Starting periodic token refresh (every ${BrainDriveEvaluator.TOKEN_REFRESH_INTERVAL_MS / 1000 / 60} minutes)`);
    
    this.tokenRefreshInterval = setInterval(async () => {
      if (this.state.isRunning) {
        console.log(`[BrainDriveEvaluator] 🔄 Refreshing auth token to keep session alive...`);
        await this.refreshAuthToken();
      }
    }, BrainDriveEvaluator.TOKEN_REFRESH_INTERVAL_MS);
  }
  
  private stopTokenRefreshTimer() {
    if (this.tokenRefreshInterval) {
      console.log(`[BrainDriveEvaluator] ⏹️ Stopping periodic token refresh`);
      clearInterval(this.tokenRefreshInterval);
      this.tokenRefreshInterval = null;
    }
  }

  // ===========================================================================
  // INITIALIZATION
  // ===========================================================================

  private async initialize() {
    const { services } = this.props;

    // =========================================================================
    // STEP 1: RESTORE RESULTS IMMEDIATELY (before any async operations!)
    // This ensures results are shown even if something fails during init
    // =========================================================================
    console.log(`[BrainDriveEvaluator] 🔍 Checking for stored evaluation results...`);
    const storedResults = EvaluationService.getStoredResults();
    
    if (storedResults && storedResults.runs.length > 0) {
      console.log(`[BrainDriveEvaluator] ✅ RESTORING previous evaluation results:`);
      console.log(`  - Runs: ${storedResults.runs.length}`);
      console.log(`  - Leaderboard entries: ${storedResults.leaderboard.length}`);
      console.log(`  - Status: ${storedResults.status}`);
      
      // Set state synchronously - this will be visible immediately after initialization
      this.setState({ 
        leaderboard: storedResults.leaderboard,
        completedRuns: storedResults.runs,
        isRunning: false,
        progress: {
          status: 'completed',
          totalRuns: storedResults.runs.length,
          completedRuns: storedResults.runs.length,
        },
        activeSection: 'whyfinder' as any,
        // Show a message that results were restored
        error: storedResults.status === 'completed' 
          ? null 
          : `⚠️ Restored ${storedResults.runs.length} runs from previous session. Some may be incomplete.`,
      });
      
      console.log(`[BrainDriveEvaluator] ✅ Results restored, setting isInitializing=false`);
      this.setState({ isInitializing: false });
      
      // Continue with background initialization but don't block UI
      this.initializeServices(services);
      return; // Exit early - results are already shown
    }
    
    console.log(`[BrainDriveEvaluator] No stored results to restore, proceeding with normal init`);

    // =========================================================================
    // STEP 2: Normal initialization (only if no results to restore)
    // =========================================================================
    await this.initializeServices(services);
    this.setState({ isInitializing: false });
    console.log(`[BrainDriveEvaluator] Initialization complete`);
  }
  
  private async initializeServices(services: Services | undefined) {
    // Initialize theme
    if (services?.theme) {
      const theme = services.theme.getCurrentTheme();
      this.setState({ currentTheme: theme });

      this.themeListener = (newTheme: string) => {
        this.setState({ currentTheme: newTheme });
      };
      services.theme.addThemeChangeListener(this.themeListener);
    }

    // Initialize services
    if (services) {
      this.pluginChecker = new PluginChecker(services);
      this.modelService = new ModelService(services);
      this.evaluationService = new EvaluationService(services);
      
      // Share model service instance
      this.evaluationService.setModelService(this.modelService);
    }

    // Check installed plugins (don't wait if we have results)
    this.checkPlugins().catch(err => console.warn('Plugin check failed:', err));

    // Load saved OpenAI API key (from backend settings)
    await this.loadSavedApiKey();

    // Load models
    await this.loadModels();
  }

  private async checkPlugins() {
    if (!this.pluginChecker) return;

    try {
      const status = await this.pluginChecker.checkAllPlugins();
      this.setState({ pluginStatus: status });
    } catch (error) {
      console.error('Error checking plugins:', error);
    }
  }

  private async loadSavedApiKey() {
    if (!this.modelService) return;

    try {
      const savedKey = await this.modelService.loadOpenAIApiKey();
      if (savedKey) {
        this.setState({ 
          openaiApiKey: savedKey,
          isApiKeySaved: true,
        });
        console.log('[BrainDriveEvaluator] OpenAI API key loaded successfully');
      }
    } catch (error) {
      console.error('[BrainDriveEvaluator] Error loading API key:', error);
    }
  }

  private handleApiKeyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    this.setState({ openaiApiKey: e.target.value, isApiKeySaved: false });
  };

  private handleSaveApiKey = async () => {
    if (!this.modelService) return;

    const { openaiApiKey } = this.state;
    
    if (!openaiApiKey || openaiApiKey.trim() === '') {
      this.setState({ error: 'Please enter your OpenAI API key.' });
      return;
    }

    // Validate the key
    this.setState({ error: null });
    const validation = await this.modelService.validateOpenAIApiKey(openaiApiKey);
    
    if (!validation.valid) {
      this.setState({ error: `Invalid API key: ${validation.error}` });
      return;
    }

    // Save it (async - persists to backend)
    try {
      await this.modelService.saveOpenAIApiKey(openaiApiKey);
      this.setState({ isApiKeySaved: true, showApiKeyInput: false });
      console.log('[BrainDriveEvaluator] OpenAI API key saved successfully');
    } catch (error) {
      console.error('[BrainDriveEvaluator] Error saving API key:', error);
      this.setState({ error: 'Failed to save API key. Please try again.' });
    }
  };

  private handleClearApiKey = async () => {
    if (!this.modelService) return;
    try {
      await this.modelService.clearOpenAIApiKey();
      this.setState({ openaiApiKey: '', isApiKeySaved: false });
    } catch (error) {
      console.error('[BrainDriveEvaluator] Error clearing API key:', error);
    }
  };

  private handleToggleApiKeyInput = () => {
    this.setState(prev => ({ showApiKeyInput: !prev.showApiKeyInput }));
  };

  private async loadModels() {
    if (!this.modelService) return;

    this.setState({ isLoadingModels: true });

    try {
      const models = await this.modelService.fetchCandidateModels();
      this.setState({ availableModels: models });
    } catch (error) {
      console.error('Error loading models:', error);
    }

    this.setState({ isLoadingModels: false });
  }

  // ===========================================================================
  // EVENT HANDLERS
  // ===========================================================================

  private handleSectionClick = (section: SupportedPlugin) => {
    const status = this.state.pluginStatus[section];
    if (!status.installed) {
      this.setState({
        error: `${PLUGIN_INFO[section].name} plugin is not installed. Please install it from the Plugin Manager.`,
      });
      return;
    }
    this.setState({ activeSection: section, error: null });
  };

  private handleBackToSections = () => {
    this.setState({ activeSection: null });
  };

  private handleCandidateModelToggle = (model: ModelInfo) => {
    this.setState(prev => {
      const isSelected = prev.selectedCandidateModels.some(m => m.id === model.id);
      if (isSelected) {
        return {
          selectedCandidateModels: prev.selectedCandidateModels.filter(m => m.id !== model.id),
        };
      } else {
        return {
          selectedCandidateModels: [...prev.selectedCandidateModels, model],
        };
      }
    });
  };

  private handleRemoveCandidateModel = (modelId: string) => {
    this.setState(prev => ({
      selectedCandidateModels: prev.selectedCandidateModels.filter(m => m.id !== modelId),
    }));
  };

  private handleSyntheticModelChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const model = OPENAI_MODELS.find(m => m.id === e.target.value);
    if (model) {
      this.setState({ syntheticUserModel: model });
    }
  };

  private handleJudgeModelChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const model = OPENAI_MODELS.find(m => m.id === e.target.value);
    if (model) {
      this.setState({ judgeModel: model });
    }
  };

  private handleConfigChange = (key: keyof EvaluationConfig, value: any) => {
    this.setState(prev => ({
      config: { ...prev.config, [key]: value },
    }));
  };

  /**
   * Pre-emptively refresh auth token before long-running evaluation
   * This prevents token expiration during the evaluation
   */
  private async refreshAuthToken(): Promise<boolean> {
    try {
      if (this.props.services?.api?.post) {
        console.log('[BrainDriveEvaluator] Pre-emptively refreshing auth token...');
        await this.props.services.api.post('/api/v1/auth/refresh', {});
        console.log('[BrainDriveEvaluator] Auth token refreshed successfully');
        return true;
      }
    } catch (error) {
      console.warn('[BrainDriveEvaluator] Could not refresh auth token:', error);
    }
    return false;
  }

  private handleStartEvaluation = async () => {
    const { 
      selectedCandidateModels, 
      syntheticUserModel, 
      judgeModel, 
      config,
      isApiKeySaved,
    } = this.state;

    // Check for OpenAI API key first
    if (!isApiKeySaved || !this.modelService?.hasOpenAIApiKey()) {
      this.setState({ 
        error: '🔑 OpenAI API key required for synthetic user & judge. Please add your key in the settings above.' 
      });
      return;
    }

    if (selectedCandidateModels.length === 0) {
      this.setState({ error: 'Please select at least one candidate model to evaluate.' });
      return;
    }

    if (!syntheticUserModel || !judgeModel) {
      this.setState({ error: 'Please select synthetic user and judge models.' });
      return;
    }

    if (!this.evaluationService) {
      this.setState({ error: 'Evaluation service not initialized.' });
      return;
    }

    // Clear any previously stored results from EvaluationService
    EvaluationService.clearStoredResults();

    // PRE-EMPTIVELY REFRESH AUTH TOKEN before long-running evaluation
    // This prevents token expiration during the evaluation
    await this.refreshAuthToken();
    
    // START PERIODIC TOKEN REFRESH to keep session alive during long evaluation
    this.startTokenRefreshTimer();

    // Calculate total runs: models × scenarios per model
    const totalRuns = selectedCandidateModels.length * config.scenariosPerModel;
    
    console.log(`[BrainDriveEvaluator] Starting evaluation:`);
    console.log(`  - Models: ${selectedCandidateModels.length} (${selectedCandidateModels.map(m => m.name).join(', ')})`);
    console.log(`  - Scenarios per model: ${config.scenariosPerModel}`);
    console.log(`  - Total runs: ${totalRuns}`);
    
    this.setState({ 
      isRunning: true, 
      error: null,
      progress: {
        status: 'running',
        totalRuns,
        completedRuns: 0,
      },
      leaderboard: [],
      completedRuns: [],
    });

    try {
      // Pass all available scenarios - evaluationService will select based on scenariosPerModel
      const scenarios = defaultScenarios;
      
      console.log('[BrainDriveEvaluator] Starting evaluation...');
      console.log('[BrainDriveEvaluator] Available scenarios:', scenarios.length);
      
      const result = await this.evaluationService.runEvaluation(
        selectedCandidateModels,
        syntheticUserModel,
        judgeModel,
        scenarios,
        config,
        (progress) => {
          console.log(`[BrainDriveEvaluator] Progress: ${progress.status}, ${progress.completedRuns}/${progress.totalRuns}`, progress.currentPhase || '', progress.errorMessage || '');
          this.setState({ progress });
        }
      );

      // STOP TOKEN REFRESH TIMER - evaluation complete
      this.stopTokenRefreshTimer();

      console.log('[BrainDriveEvaluator] ✅ Evaluation completed');
      console.log('[BrainDriveEvaluator] Runs:', result.runs.length, 'completed, statuses:', result.runs.map(r => r.status));
      console.log('[BrainDriveEvaluator] Leaderboard entries:', result.leaderboard.length);

      // Results are already saved by EvaluationService incrementally

      // Check if all runs failed
      const failedRuns = result.runs.filter(r => r.status === 'failed');
      if (failedRuns.length > 0 && failedRuns.length === result.runs.length) {
        // All runs failed - show the first error
        const firstError = (failedRuns[0].metadata as any)?.errorMessage || 'Unknown error';
        this.setState({
          error: `All runs failed. First error: ${firstError}`,
          leaderboard: result.leaderboard,
          completedRuns: result.runs,
          isRunning: false,
        });
      } else {
        this.setState({
          leaderboard: result.leaderboard,
          completedRuns: result.runs,
          isRunning: false,
        });
      }

    } catch (error) {
      // STOP TOKEN REFRESH TIMER on error too
      this.stopTokenRefreshTimer();
      
      console.error('[BrainDriveEvaluator] Evaluation failed:', error);
      this.setState({
        error: `Evaluation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        isRunning: false,
      });
    }
  };

  private handlePauseEvaluation = () => {
    if (this.evaluationService) {
      this.evaluationService.pause();
      this.setState({ isPaused: true });
    }
  };

  private handleResumeEvaluation = () => {
    if (this.evaluationService) {
      this.evaluationService.resume();
      this.setState({ isPaused: false });
    }
  };

  private handleAbortEvaluation = () => {
    if (this.evaluationService) {
      this.evaluationService.abort();
      this.stopTokenRefreshTimer();
      this.setState({ isRunning: false, isPaused: false });
    }
  };

  private handleDismissError = () => {
    this.setState({ error: null });
  };

  private handleViewRunDetail = (run: EvaluationRun) => {
    this.setState({ 
      selectedTranscriptRun: run, 
      showTranscriptViewer: true 
    });
  };

  private handleCloseTranscriptViewer = () => {
    this.setState({ 
      showTranscriptViewer: false, 
      selectedTranscriptRun: null 
    });
  };

  // ===========================================================================
  // RENDER METHODS
  // ===========================================================================

  render() {
    const { currentTheme, isInitializing, error, activeSection, leaderboard, completedRuns } = this.state;
    const themeClass = currentTheme === 'dark' ? 'dark-theme' : 'light-theme';

    // Log render state for debugging
    console.log(`[BrainDriveEvaluator] Render called: isInitializing=${isInitializing}, activeSection=${activeSection}, leaderboard=${leaderboard.length}, completedRuns=${completedRuns.length}`);

    if (isInitializing) {
      console.log(`[BrainDriveEvaluator] Showing loading spinner...`);
      return (
        <div className={`evaluator ${themeClass}`}>
          <div className="evaluator-loading">
            <div className="loading-spinner" />
            <p>Loading BrainDrive Evaluator...</p>
          </div>
        </div>
      );
    }

    return (
      <div className={`evaluator ${themeClass}`}>
        {error && (
          <div className="evaluator-error-banner">
            <span>{error}</span>
            <button onClick={this.handleDismissError}>×</button>
          </div>
        )}

        {activeSection ? (
          this.renderPluginEvaluator()
        ) : (
          this.renderPluginSections()
        )}

        {/* Transcript Viewer Modal */}
        {this.state.showTranscriptViewer && this.state.selectedTranscriptRun && (
          this.renderTranscriptViewer()
        )}
      </div>
    );
  }

  // ===========================================================================
  // RENDER: TRANSCRIPT VIEWER
  // ===========================================================================

  private renderTranscriptViewer() {
    const { selectedTranscriptRun } = this.state;
    if (!selectedTranscriptRun) return null;

    const whyFinderMessages = selectedTranscriptRun.transcript.filter(m => 
      m.phase && ['intro', 'energy_map', 'stories', 'your_why'].includes(m.phase)
    );
    const ikigaiMessages = selectedTranscriptRun.transcript.filter(m => 
      m.phase && m.phase.startsWith('phase')
    );
    const decisionMessages = selectedTranscriptRun.decisionHelperOutput || [];

    return (
      <div className="transcript-viewer-overlay" onClick={this.handleCloseTranscriptViewer}>
        <div className="transcript-viewer-modal" onClick={e => e.stopPropagation()}>
          <div className="transcript-viewer-header">
            <h3>Evaluation Transcript</h3>
            <div className="transcript-meta">
              <span>Model: {selectedTranscriptRun.modelName}</span>
              <span>Scenario: {selectedTranscriptRun.scenarioName}</span>
            </div>
            <button className="close-btn" onClick={this.handleCloseTranscriptViewer}>×</button>
          </div>

          <div className="transcript-viewer-content">
            {/* Error Section if run failed */}
            {selectedTranscriptRun.status === 'failed' && (
              <section className="transcript-section error-section">
                <h4>Run Failed</h4>
                <div className="error-details">
                  <p><strong>Error:</strong> {(selectedTranscriptRun.metadata as any)?.errorMessage || 'Unknown error'}</p>
                  <p><strong>Status:</strong> {selectedTranscriptRun.status}</p>
                  <p><strong>Transcript messages collected:</strong> {selectedTranscriptRun.transcript.length}</p>
                </div>
              </section>
            )}

            {/* Why Finder Section */}
            <section className="transcript-section">
              <h4>Why Finder ({whyFinderMessages.length} messages)</h4>
              <div className="transcript-messages">
                {whyFinderMessages.map((msg, idx) => (
                  <div key={idx} className={`transcript-message ${msg.role}`}>
                    <div className="message-header">
                      <span className="role">{msg.role === 'user' ? 'Synthetic User' : 'Candidate Model'}</span>
                      {msg.exchangeNumber && <span className="exchange">Exchange {msg.exchangeNumber}</span>}
                    </div>
                    <div className="message-content">{msg.content}</div>
                  </div>
                ))}
              </div>
            </section>

            {/* Ikigai Section */}
            <section className="transcript-section">
              <h4>Ikigai Builder ({ikigaiMessages.length} messages)</h4>
              <div className="transcript-messages">
                {ikigaiMessages.map((msg, idx) => (
                  <div key={idx} className={`transcript-message ${msg.role}`}>
                    <div className="message-header">
                      <span className="role">{msg.role === 'user' ? 'Synthetic User' : 'Candidate Model'}</span>
                      <span className="phase">{msg.phase}</span>
                    </div>
                    <div className="message-content">{msg.content}</div>
                  </div>
                ))}
              </div>
            </section>

            {/* Decision Helper Section */}
            <section className="transcript-section">
              <h4>Decision Helper ({decisionMessages.length} messages)</h4>
              <div className="transcript-messages">
                {decisionMessages.map((msg, idx) => (
                  <div key={idx} className={`transcript-message ${msg.role}`}>
                    <div className="message-header">
                      <span className="role">{msg.role === 'user' ? 'Synthetic User' : 'Candidate Model'}</span>
                    </div>
                    <div className="message-content">{msg.content}</div>
                  </div>
                ))}
              </div>
            </section>

            {/* Extracted Profiles */}
            <section className="transcript-section">
              <h4>Extracted Profiles</h4>
              <div className="profiles-grid">
                {selectedTranscriptRun.whyProfile && (
                  <div className="profile-card">
                    <h5>Why Profile</h5>
                    <pre>{JSON.stringify(selectedTranscriptRun.whyProfile, null, 2)}</pre>
                  </div>
                )}
                {selectedTranscriptRun.ikigaiProfile && (
                  <div className="profile-card">
                    <h5>Ikigai Profile</h5>
                    <pre>{JSON.stringify(selectedTranscriptRun.ikigaiProfile, null, 2)}</pre>
                  </div>
                )}
              </div>
            </section>
          </div>
        </div>
      </div>
    );
  }

  // ===========================================================================
  // RENDER: PLUGIN SECTIONS (Home)
  // ===========================================================================

  private renderPluginSections() {
    const { pluginStatus } = this.state;

    return (
      <div className="evaluator-home">
        <header className="evaluator-header">
          <h1>BrainDrive Evaluator</h1>
          <p>Automated evaluation for BrainDrive plugins</p>
        </header>

        <div className="plugin-sections">
          {/* WhyFinder Section */}
          <div 
            className={`plugin-card ${pluginStatus.whyfinder.installed ? '' : 'disabled'}`}
            onClick={() => this.handleSectionClick('whyfinder')}
          >
            <div className="plugin-card-icon">{PLUGIN_INFO.whyfinder.icon}</div>
            <div className="plugin-card-content">
              <h3>{PLUGIN_INFO.whyfinder.name}</h3>
              <p>{PLUGIN_INFO.whyfinder.description}</p>
              <div className={`plugin-status ${pluginStatus.whyfinder.installed ? 'installed' : 'not-installed'}`}>
                {pluginStatus.whyfinder.installed 
                  ? `Installed (v${pluginStatus.whyfinder.version || '?'})` 
                  : 'Not Installed'}
              </div>
            </div>
            <div className="plugin-card-arrow">→</div>
          </div>
        </div>
      </div>
    );
  }

  // ===========================================================================
  // RENDER: PLUGIN EVALUATOR
  // ===========================================================================

  private renderPluginEvaluator() {
    const { 
      isRunning, 
      isPaused, 
      progress, 
      leaderboard,
      availableModels,
      selectedCandidateModels,
      syntheticUserModel,
      judgeModel,
      config,
      isLoadingModels,
      openaiApiKey,
      isApiKeySaved,
      showApiKeyInput,
      completedRuns,
    } = this.state;

    return (
      <div className="evaluator-plugin">
        {/* Header with back button */}
        <header className="evaluator-plugin-header">
          <button className="back-btn" onClick={this.handleBackToSections}>
            ← Back
          </button>
          <div className="header-title">
            <span className="header-icon">{PLUGIN_INFO.whyfinder.icon}</span>
            <h2>{PLUGIN_INFO.whyfinder.name} Evaluator</h2>
          </div>
        </header>

        <div className="evaluator-content">
          {/* OpenAI API Key Settings */}
          <div className={`api-key-section ${isApiKeySaved ? 'configured' : 'not-configured'}`}>
            <div className="api-key-header">
              <div className="api-key-status-info">
                {isApiKeySaved ? (
                  <>
                    <span className="status-icon">[OK]</span>
                    <span>OpenAI API key configured</span>
                  </>
                ) : (
                  <>
                    <span className="status-icon">[!]</span>
                    <span>OpenAI API key required for synthetic user & judge</span>
                  </>
                )}
              </div>
              <button 
                className="api-key-toggle-btn"
                onClick={this.handleToggleApiKeyInput}
              >
                {showApiKeyInput ? 'Close' : 'Configure'}
              </button>
            </div>
            
            {showApiKeyInput && (
              <div className="api-key-input-section">
                <label>OpenAI API Key</label>
                <div className="api-key-input-row">
                  <input
                    type="password"
                    placeholder="sk-..."
                    value={openaiApiKey}
                    onChange={this.handleApiKeyChange}
                    className="api-key-input"
                  />
                  <button 
                    className="save-key-btn"
                    onClick={this.handleSaveApiKey}
                    disabled={!openaiApiKey}
                  >
                    Save
                  </button>
                  {isApiKeySaved && (
                    <button 
                      className="clear-key-btn"
                      onClick={this.handleClearApiKey}
                    >
                      Clear
                    </button>
                  )}
                </div>
                <small className="api-key-hint">
                  Get your API key from <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer">platform.openai.com/api-keys</a>
                </small>
              </div>
            )}
          </div>

          {/* Configuration Panel */}
          <section className="config-section">
            <h3>Configuration</h3>

            {/* Candidate Models Multi-Select */}
            <div className="config-group">
              <label>
                Candidate Models (to evaluate) 
                <span className="model-count">
                  {isLoadingModels ? ' Loading...' : ` (${availableModels.length} available)`}
                </span>
              </label>
              <div className="model-multiselect">
                <div className="model-dropdown-row">
                  <select 
                    className="model-dropdown"
                    onChange={(e) => {
                      const model = availableModels.find(m => m.id === e.target.value);
                      if (model) this.handleCandidateModelToggle(model);
                      e.target.value = ''; // Reset
                    }}
                    disabled={isLoadingModels || isRunning}
                  >
                    <option value="">
                      {isLoadingModels ? 'Loading models...' : '+ Add model to evaluate'}
                    </option>
                    {availableModels
                      .filter(m => !selectedCandidateModels.some(s => s.id === m.id))
                      .map(model => (
                        <option key={model.id} value={model.id}>
                          {model.name} ({model.provider})
                        </option>
                      ))
                    }
                  </select>
                  <button 
                    className="refresh-models-btn"
                    onClick={() => this.loadModels()}
                    disabled={isLoadingModels || isRunning}
                    title="Refresh model list"
                  >
                    Refresh
                  </button>
                </div>
                
                {/* Model loading status */}
                {!isLoadingModels && availableModels.length === 0 && (
                  <div className="no-models-warning">
                    No models found. Make sure you have configured your OpenRouter API key in the <strong>BrainDrive OpenRouter</strong> plugin. 
                    <br/>
                    <small>Check browser console (F12) for debugging info.</small>
                  </div>
                )}
                
                {/* Selected models chips */}
                <div className="selected-models">
                  {selectedCandidateModels.map(model => (
                    <div key={model.id} className="model-chip">
                      <span>{model.name}</span>
                      <button 
                        onClick={() => this.handleRemoveCandidateModel(model.id)}
                        disabled={isRunning}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                  {selectedCandidateModels.length === 0 && availableModels.length > 0 && (
                    <span className="no-models-hint">No models selected</span>
                  )}
                </div>
              </div>
            </div>

            {/* Synthetic User Model */}
            <div className="config-group">
              <label>Synthetic User Model (simulates human)</label>
              <select
                value={syntheticUserModel?.id || ''}
                onChange={this.handleSyntheticModelChange}
                disabled={isRunning}
              >
                {OPENAI_MODELS.map(model => (
                  <option key={model.id} value={model.id}>
                    {model.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Judge Model */}
            <div className="config-group">
              <label>Judge Model (evaluates quality)</label>
              <select
                value={judgeModel?.id || ''}
                onChange={this.handleJudgeModelChange}
                disabled={isRunning}
              >
                {OPENAI_MODELS.map(model => (
                  <option key={model.id} value={model.id}>
                    {model.name}
                  </option>
                ))}
              </select>
              <small className="config-hint">Judge runs at temperature=0 for consistency</small>
            </div>

            {/* Configuration */}
            <div className="config-row">
              <div className="config-group">
                <label>Scenarios per model</label>
                <input
                  type="number"
                  min={1}
                  max={15}
                  value={config.scenariosPerModel}
                  onChange={(e) => this.handleConfigChange('scenariosPerModel', parseInt(e.target.value) || 1)}
                  disabled={isRunning}
                />
                <small className="config-hint">
                  {selectedCandidateModels.length} models × {config.scenariosPerModel} scenarios = {selectedCandidateModels.length * config.scenariosPerModel} total runs
                </small>
              </div>

              <div className="config-group">
                <label>Temperature</label>
                <input
                  type="number"
                  min={0}
                  max={1}
                  step={0.1}
                  value={config.candidateTemperature}
                  onChange={(e) => this.handleConfigChange('candidateTemperature', parseFloat(e.target.value))}
                  disabled={isRunning}
                />
              </div>
            </div>

            {/* Start Button */}
            <div className="config-actions">
              <button
                className="start-btn"
                onClick={this.handleStartEvaluation}
                disabled={isRunning || selectedCandidateModels.length === 0}
              >
                {isRunning ? 'Running...' : 'Start Evaluation'}
              </button>
            </div>
          </section>

          {/* Progress Panel */}
          {progress && (
            <section className="progress-section">
              <ProgressPanel
                progress={progress}
                isPaused={isPaused}
                onPause={this.handlePauseEvaluation}
                onResume={this.handleResumeEvaluation}
                onAbort={this.handleAbortEvaluation}
              />
            </section>
          )}

          {/* Results Section */}
          {leaderboard.length > 0 && (
            <section className="results-section">
              <h3>Results</h3>
              <Leaderboard 
                entries={leaderboard}
                onViewTranscript={(runId: string) => {
                  const run = completedRuns.find(r => r.id === runId);
                  if (run) this.handleViewRunDetail(run);
                }}
              />
            </section>
          )}
        </div>
      </div>
    );
  }
}

export default BrainDriveEvaluator;
