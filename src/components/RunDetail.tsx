/**
 * Run Detail Component for BrainDrive Evaluator
 * 
 * Shows detailed view of a single evaluation run.
 */

import React from 'react';
import { EvaluationRun } from '../types';

interface RunDetailProps {
  run: EvaluationRun;
  onClose?: () => void;
  onViewTranscript?: () => void;
}

export const RunDetail: React.FC<RunDetailProps> = ({
  run,
  onClose,
  onViewTranscript,
}) => {
  const formatDuration = (ms: number): string => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    
    if (minutes > 0) {
      return `${minutes}m ${remainingSeconds}s`;
    }
    return `${seconds}s`;
  };

  const getStatusText = (status: string): string => {
    switch (status) {
      case 'completed': return 'Completed';
      case 'failed': return 'Failed';
      case 'running': return 'Running';
      default: return status;
    }
  };

  return (
    <div className="run-detail">
      <div className="run-detail-header">
        <div className="run-info">
          <h4>{run.modelName}</h4>
          <span className="run-scenario">{run.scenarioName}</span>
        </div>
        {onClose && (
          <button className="close-btn" onClick={onClose}>X</button>
        )}
      </div>

      <div className="run-meta">
        <div className="meta-item">
          <span className="meta-label">Status</span>
          <span className={`meta-value status-${run.status}`}>
            {getStatusText(run.status)}
          </span>
        </div>
        <div className="meta-item">
          <span className="meta-label">Duration</span>
          <span className="meta-value">{formatDuration(run.duration)}</span>
        </div>
        <div className="meta-item">
          <span className="meta-label">Messages</span>
          <span className="meta-value">{run.transcript.length}</span>
        </div>
      </div>

      {run.judgeReport && (
        <div className="run-scores">
          <h5>Judge Scores</h5>
          <div className="scores-grid">
            <div className="score-item">
              <span className="score-label">Overall</span>
              <span className="score-value">{run.judgeReport.overallScore.toFixed(1)}</span>
            </div>
          </div>

          {run.judgeReport.generalComments && run.judgeReport.generalComments.length > 0 && (
            <div className="judge-comments">
              <h6>Comments</h6>
              <ul>
                {run.judgeReport.generalComments.map((comment, idx) => (
                  <li key={idx}>{comment}</li>
                ))}
              </ul>
            </div>
          )}

          {run.judgeReport.pinpointedIssues && run.judgeReport.pinpointedIssues.length > 0 && (
            <div className="failure-examples">
              <h6>Pinpointed Issues</h6>
              {run.judgeReport.pinpointedIssues.map((issue, idx) => (
                <div key={idx} className={`failure-item severity-${issue.severity}`}>
                  <span className="failure-type">{issue.location}</span>
                  <p className="failure-description">{issue.issue}</p>
                  {issue.suggestion && (
                    <p className="failure-suggestion">Suggestion: {issue.suggestion}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {onViewTranscript && (
        <div className="run-actions">
          <button className="view-transcript-btn" onClick={onViewTranscript}>
            View Full Transcript
          </button>
        </div>
      )}
    </div>
  );
};

export default RunDetail;
