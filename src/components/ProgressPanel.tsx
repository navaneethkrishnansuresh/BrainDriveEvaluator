/**
 * Progress Panel Component for BrainDrive Evaluator
 * 
 * Shows real-time evaluation progress without emojis.
 */

import React from 'react';
import { RunProgress } from '../types';

interface ProgressPanelProps {
  progress: RunProgress;
  onPause?: () => void;
  onResume?: () => void;
  onAbort?: () => void;
  isPaused?: boolean;
}

export const ProgressPanel: React.FC<ProgressPanelProps> = ({
  progress,
  onPause,
  onResume,
  onAbort,
  isPaused = false,
}) => {
  const percentage = progress.totalRuns > 0
    ? Math.round((progress.completedRuns / progress.totalRuns) * 100)
    : 0;

  const getPhaseLabel = (phase?: string): string => {
    switch (phase) {
      case 'why_finder': return 'Why Finder';
      case 'ikigai': return 'Ikigai Builder';
      case 'decision_helper': return 'Decision Helper';
      case 'judging': return 'Judging';
      default: return 'Preparing...';
    }
  };

  const getStatusColor = (status: string): string => {
    switch (status) {
      case 'running': return 'var(--accent-color)';
      case 'paused': return 'var(--status-warning-color)';
      case 'completed': return 'var(--status-success-color)';
      case 'error': return 'var(--status-error-color)';
      default: return 'var(--text-muted)';
    }
  };

  const getStatusText = (): string => {
    if (progress.status === 'completed') return 'Completed';
    if (progress.status === 'error') return 'Error';
    if (isPaused) return 'Paused';
    return 'Running';
  };

  return (
    <div className="progress-panel">
      <div className="progress-header">
        <h4>Evaluation Progress</h4>
        <span 
          className="progress-status"
          style={{ color: getStatusColor(progress.status) }}
        >
          {getStatusText()}
        </span>
      </div>

      <div className="progress-bar-container">
        <div 
          className="progress-bar"
          style={{ width: `${percentage}%` }}
        />
        <span className="progress-text">
          {progress.completedRuns} / {progress.totalRuns} ({percentage}%)
        </span>
      </div>

      {progress.status === 'running' && (
        <div className="progress-details">
          <div className="detail-row">
            <span className="detail-label">Model</span>
            <span className="detail-value">{progress.currentModel || '-'}</span>
          </div>
          <div className="detail-row">
            <span className="detail-label">Scenario</span>
            <span className="detail-value">{progress.currentScenario || '-'}</span>
          </div>
          <div className="detail-row">
            <span className="detail-label">Phase</span>
            <span className="detail-value">{getPhaseLabel(progress.currentPhase)}</span>
          </div>
          {progress.currentExchange !== undefined && progress.totalExchanges && (
            <div className="detail-row">
              <span className="detail-label">Exchange</span>
              <span className="detail-value">
                {progress.currentExchange} / {progress.totalExchanges}
              </span>
            </div>
          )}
        </div>
      )}

      {progress.errorMessage && (
        <div className="progress-error">
          <span className="error-icon">[!]</span>
          <span className="error-message">{progress.errorMessage}</span>
        </div>
      )}

      {progress.status === 'running' && (
        <div className="progress-controls">
          {isPaused ? (
            <button className="resume-btn" onClick={onResume}>
              Resume
            </button>
          ) : (
            <button className="pause-btn" onClick={onPause}>
              Pause
            </button>
          )}
          <button className="abort-btn" onClick={onAbort}>
            Abort
          </button>
        </div>
      )}
    </div>
  );
};

export default ProgressPanel;
