/**
 * Leaderboard Component for BrainDrive Evaluator
 * 
 * Displays evaluation results with:
 * - Ranked table with 7 core metrics (CLR, STR, CON, COV, HAL, DEC, SAF)
 * - 3 action buttons: Transcript, Comments, Scenarios
 * - Scenario dropdown for switching between runs
 * - Token usage breakdown
 * 
 * NOTE: Using class component to avoid React singleton issues with Module Federation.
 */

import React, { Component } from 'react';
import { LeaderboardEntry, ScenarioScore, METRIC_LABELS } from '../types';

interface LeaderboardProps {
  entries: LeaderboardEntry[];
  onViewTranscript?: (runId: string) => void;
  onViewComments?: (entry: LeaderboardEntry) => void;
}

interface LeaderboardState {
  expandedModel: string | null;
  activeTab: 'scenarios' | 'comments' | null;
  selectedScenarioIndex: { [modelId: string]: number };
}

export class Leaderboard extends Component<LeaderboardProps, LeaderboardState> {
  constructor(props: LeaderboardProps) {
    super(props);
    this.state = {
      expandedModel: null,
      activeTab: null,
      selectedScenarioIndex: {},
    };
  }

  private getRankDisplay = (rank: number): string => {
    // No emojis, just numbers with ordinal suffix
    if (rank === 1) return '1st';
    if (rank === 2) return '2nd';
    if (rank === 3) return '3rd';
    return `${rank}th`;
  };

  private toggleExpand = (modelId: string, tab: 'scenarios' | 'comments') => {
    this.setState(prev => {
      if (prev.expandedModel === modelId && prev.activeTab === tab) {
        return { expandedModel: null, activeTab: null };
      }
      return { expandedModel: modelId, activeTab: tab };
    });
  };

  private formatScore = (score: number): string => {
    return score.toFixed(1);
  };

  private getScoreClass = (score: number): string => {
    if (score >= 8) return 'score-high';
    if (score >= 6) return 'score-medium';
    return 'score-low';
  };

  private handleScenarioChange = (modelId: string, index: number) => {
    this.setState(prev => ({
      selectedScenarioIndex: {
        ...prev.selectedScenarioIndex,
        [modelId]: index,
      },
    }));
  };

  private getSelectedScenarioIndex = (modelId: string, maxIndex: number): number => {
    const idx = this.state.selectedScenarioIndex[modelId];
    if (idx !== undefined && idx < maxIndex) return idx;
    return 0;
  };

  render() {
    const { entries, onViewTranscript, onViewComments } = this.props;
    const { expandedModel, activeTab } = this.state;

    if (entries.length === 0) {
      return (
        <div className="leaderboard-empty">
          <p>No evaluation results yet. Run an evaluation to see the leaderboard.</p>
        </div>
      );
    }

    return (
      <div className="leaderboard">
        <table className="leaderboard-table">
          <thead>
            <tr>
              <th>Rank</th>
              <th>Model</th>
              <th>Overall</th>
              <th title="Clarity">CLR</th>
              <th title="Structural Correctness">STR</th>
              <th title="Consistency">CON</th>
              <th title="Coverage">COV</th>
              <th title="Hallucination (10=none)">HAL</th>
              <th title="Decision Expertise">DEC</th>
              <th title="Safety">SAF</th>
              <th>Runs</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => {
              const scenarios = entry.scenarioScores || [];
              const selectedIdx = this.getSelectedScenarioIndex(entry.modelId, scenarios.length);
              const selectedScenario = scenarios[selectedIdx];
              
              return (
                <React.Fragment key={entry.modelId}>
                  <tr className={`leaderboard-row ${expandedModel === entry.modelId ? 'expanded' : ''}`}>
                    <td className="rank-cell">
                      <span className="rank-badge">{this.getRankDisplay(entry.rank)}</span>
                    </td>
                    <td className="model-cell">
                      <div className="model-info">
                        <span className="model-name">{entry.modelName}</span>
                        <span className="model-provider">{entry.modelProvider}</span>
                      </div>
                    </td>
                    <td className={`score-cell overall ${this.getScoreClass(entry.overallScore)}`}>
                      <strong>{this.formatScore(entry.overallScore)}</strong>
                    </td>
                    <td className={`score-cell ${this.getScoreClass(entry.metrics.clarity)}`}>
                      {this.formatScore(entry.metrics.clarity)}
                    </td>
                    <td className={`score-cell ${this.getScoreClass(entry.metrics.structuralCorrectness)}`}>
                      {this.formatScore(entry.metrics.structuralCorrectness)}
                    </td>
                    <td className={`score-cell ${this.getScoreClass(entry.metrics.consistency)}`}>
                      {this.formatScore(entry.metrics.consistency)}
                    </td>
                    <td className={`score-cell ${this.getScoreClass(entry.metrics.coverage)}`}>
                      {this.formatScore(entry.metrics.coverage)}
                    </td>
                    <td className={`score-cell ${this.getScoreClass(entry.metrics.hallucination)}`}>
                      {this.formatScore(entry.metrics.hallucination)}
                    </td>
                    <td className={`score-cell ${this.getScoreClass(entry.metrics.decisionExpertise)}`}>
                      {this.formatScore(entry.metrics.decisionExpertise)}
                    </td>
                    <td className={`score-cell ${this.getScoreClass(entry.metrics.safety)}`}>
                      {this.formatScore(entry.metrics.safety)}
                    </td>
                    <td className="count-cell">{entry.runCount}</td>
                    <td className="action-cell">
                      <div className="action-buttons">
                        {/* Scenario dropdown for transcript */}
                        {scenarios.length > 0 && (
                          <div className="scenario-selector">
                            <select
                              className="scenario-dropdown"
                              value={selectedIdx}
                              onChange={(e) => this.handleScenarioChange(entry.modelId, parseInt(e.target.value))}
                              onClick={(e) => e.stopPropagation()}
                            >
                              {scenarios.map((s, idx) => (
                                <option key={s.scenarioId} value={idx}>
                                  {s.scenarioName}
                                </option>
                              ))}
                            </select>
                          </div>
                        )}
                        {onViewTranscript && selectedScenario && (
                          <button 
                            className="action-btn transcript-btn"
                            onClick={(e) => { 
                              e.stopPropagation(); 
                              onViewTranscript(selectedScenario.runId);
                            }}
                            title={`View transcript for ${selectedScenario.scenarioName}`}
                          >
                            Transcript
                          </button>
                        )}
                        <button 
                          className={`action-btn comments-btn ${expandedModel === entry.modelId && activeTab === 'comments' ? 'active' : ''}`}
                          onClick={(e) => { e.stopPropagation(); this.toggleExpand(entry.modelId, 'comments'); }}
                          title="View judge comments, pros/cons, issues"
                        >
                          Comments
                        </button>
                        {scenarios.length > 1 && (
                          <button 
                            className={`action-btn scenarios-btn ${expandedModel === entry.modelId && activeTab === 'scenarios' ? 'active' : ''}`}
                            onClick={(e) => { e.stopPropagation(); this.toggleExpand(entry.modelId, 'scenarios'); }}
                            title="View scenario-wise breakdown"
                          >
                            Scenarios
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                  
                  {/* Expanded details row - Comments */}
                  {expandedModel === entry.modelId && activeTab === 'comments' && (
                    <tr className="leaderboard-details-row">
                      <td colSpan={12}>
                        <div className="judge-feedback">
                          {/* Scenario selector for comments */}
                          {scenarios.length > 1 && (
                            <div className="comments-scenario-selector">
                              <label>Viewing comments for: </label>
                              <select
                                className="scenario-dropdown"
                                value={selectedIdx}
                                onChange={(e) => this.handleScenarioChange(entry.modelId, parseInt(e.target.value))}
                              >
                                {scenarios.map((s, idx) => (
                                  <option key={s.scenarioId} value={idx}>
                                    {s.scenarioName} (Score: {this.formatScore(s.overallScore)})
                                  </option>
                                ))}
                              </select>
                            </div>
                          )}
                          
                          {/* Use selected scenario's comments if available, fallback to aggregated */}
                          {(() => {
                            const scenarioComments = selectedScenario;
                            const pros = scenarioComments?.pros || entry.topPros || [];
                            const cons = scenarioComments?.cons || entry.topCons || [];
                            const issues = scenarioComments?.pinpointedIssues || entry.pinpointedIssues || [];
                            const generalComments = scenarioComments?.generalComments || [];
                            
                            return (
                              <>
                                {/* General Comments section */}
                                {generalComments.length > 0 && (
                                  <div className="feedback-section general">
                                    <h4>General Comments</h4>
                                    <ul>
                                      {generalComments.map((comment, idx) => (
                                        <li key={idx}>{comment}</li>
                                      ))}
                                    </ul>
                                  </div>
                                )}
                                
                                {/* Pros section */}
                                <div className="feedback-section pros">
                                  <h4>Strengths (Pros)</h4>
                                  {pros.length > 0 ? (
                                    <ul>
                                      {pros.map((pro, idx) => (
                                        <li key={idx}>{pro}</li>
                                      ))}
                                    </ul>
                                  ) : (
                                    <p className="no-feedback">No pros recorded</p>
                                  )}
                                </div>
                                
                                {/* Cons section */}
                                <div className="feedback-section cons">
                                  <h4>Weaknesses (Cons)</h4>
                                  {cons.length > 0 ? (
                                    <ul>
                                      {cons.map((con, idx) => (
                                        <li key={idx}>{con}</li>
                                      ))}
                                    </ul>
                                  ) : (
                                    <p className="no-feedback">No cons recorded</p>
                                  )}
                                </div>
                                
                                {/* Pinpointed Issues section */}
                                <div className="feedback-section issues">
                                  <h4>Pinpointed Issues</h4>
                                  {issues.length > 0 ? (
                                    <ul className="issues-list">
                                      {issues.map((issue, idx) => (
                                        <li key={idx} className="issue-item">
                                          {issue}
                                        </li>
                                      ))}
                                    </ul>
                                  ) : (
                                    <p className="no-feedback">No issues pinpointed</p>
                                  )}
                                </div>
                              </>
                            );
                          })()}

                          {/* Token Usage Breakdown - Per Scenario */}
                          <div className="feedback-section token-usage">
                            <h4>Token Usage Breakdown ({selectedScenario?.scenarioName || 'All Scenarios'})</h4>
                            {selectedScenario?.tokenUsage ? (
                              <div className="token-breakdown-grid">
                                <div className="token-phase">
                                  <h5>Why Finder Phase</h5>
                                  <div className="token-row">
                                    <span>Candidate Model:</span>
                                    <span>Input: {selectedScenario.tokenUsage.whyFinder.candidateInput.toLocaleString()} | Output: {selectedScenario.tokenUsage.whyFinder.candidateOutput.toLocaleString()}</span>
                                  </div>
                                  <div className="token-row">
                                    <span>Synthetic User:</span>
                                    <span>Input: {selectedScenario.tokenUsage.whyFinder.syntheticInput.toLocaleString()} | Output: {selectedScenario.tokenUsage.whyFinder.syntheticOutput.toLocaleString()}</span>
                                  </div>
                                </div>
                                <div className="token-phase">
                                  <h5>Ikigai Builder Phase</h5>
                                  <div className="token-row">
                                    <span>Candidate Model:</span>
                                    <span>Input: {selectedScenario.tokenUsage.ikigai.candidateInput.toLocaleString()} | Output: {selectedScenario.tokenUsage.ikigai.candidateOutput.toLocaleString()}</span>
                                  </div>
                                  <div className="token-row">
                                    <span>Synthetic User:</span>
                                    <span>Input: {selectedScenario.tokenUsage.ikigai.syntheticInput.toLocaleString()} | Output: {selectedScenario.tokenUsage.ikigai.syntheticOutput.toLocaleString()}</span>
                                  </div>
                                </div>
                                <div className="token-phase">
                                  <h5>Decision Helper Phase</h5>
                                  <div className="token-row">
                                    <span>Candidate Model:</span>
                                    <span>Input: {selectedScenario.tokenUsage.decisionHelper.candidateInput.toLocaleString()} | Output: {selectedScenario.tokenUsage.decisionHelper.candidateOutput.toLocaleString()}</span>
                                  </div>
                                  <div className="token-row">
                                    <span>Synthetic User:</span>
                                    <span>Input: {selectedScenario.tokenUsage.decisionHelper.syntheticInput.toLocaleString()} | Output: {selectedScenario.tokenUsage.decisionHelper.syntheticOutput.toLocaleString()}</span>
                                  </div>
                                </div>
                                <div className="token-phase">
                                  <h5>Judge Phase</h5>
                                  <div className="token-row">
                                    <span>Judge Model:</span>
                                    <span>Input: {selectedScenario.tokenUsage.judge.input.toLocaleString()} | Output: {selectedScenario.tokenUsage.judge.output.toLocaleString()}</span>
                                  </div>
                                </div>
                                <div className="token-total">
                                  <h5>Total for Scenario</h5>
                                  <div className="token-row total">
                                    <span>All Phases:</span>
                                    <span>{selectedScenario.tokenUsage.total.grand.toLocaleString()} tokens</span>
                                  </div>
                                  <div className="token-row">
                                    <span>Input / Output:</span>
                                    <span>{selectedScenario.tokenUsage.total.input.toLocaleString()} / {selectedScenario.tokenUsage.total.output.toLocaleString()}</span>
                                  </div>
                                </div>
                              </div>
                            ) : (
                              <p className="token-note">Token usage data not available for this scenario. Select a scenario to view detailed breakdown.</p>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                  
                  {/* Scenario breakdown row */}
                  {expandedModel === entry.modelId && activeTab === 'scenarios' && scenarios.length > 0 && (
                    <tr className="leaderboard-details-row">
                      <td colSpan={12}>
                        <div className="scenario-breakdown">
                          <h4>Scenario-wise Scores</h4>
                          <table className="scenario-table">
                            <thead>
                              <tr>
                                <th>Scenario</th>
                                <th>Overall</th>
                                <th>CLR</th>
                                <th>STR</th>
                                <th>CON</th>
                                <th>COV</th>
                                <th>HAL</th>
                                <th>DEC</th>
                                <th>SAF</th>
                                <th>Action</th>
                              </tr>
                            </thead>
                            <tbody>
                              {scenarios.map((scenario, idx) => (
                                <tr key={scenario.scenarioId}>
                                  <td className="scenario-name">{scenario.scenarioName}</td>
                                  <td className={`score-cell ${this.getScoreClass(scenario.overallScore)}`}>
                                    {this.formatScore(scenario.overallScore)}
                                  </td>
                                  <td className="score-cell">{this.formatScore(scenario.metrics.clarity)}</td>
                                  <td className="score-cell">{this.formatScore(scenario.metrics.structuralCorrectness)}</td>
                                  <td className="score-cell">{this.formatScore(scenario.metrics.consistency)}</td>
                                  <td className="score-cell">{this.formatScore(scenario.metrics.coverage)}</td>
                                  <td className="score-cell">{this.formatScore(scenario.metrics.hallucination)}</td>
                                  <td className="score-cell">{this.formatScore(scenario.metrics.decisionExpertise)}</td>
                                  <td className="score-cell">{this.formatScore(scenario.metrics.safety)}</td>
                                  <td>
                                    {onViewTranscript && (
                                      <button
                                        className="action-btn small"
                                        onClick={() => onViewTranscript(scenario.runId)}
                                      >
                                        View
                                      </button>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }
}

export default Leaderboard;
