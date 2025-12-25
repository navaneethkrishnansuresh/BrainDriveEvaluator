# BrainDrive Evaluator Plugin

Automates end-to-end evaluation of AI coaching models using the WhyFinder plugin flow.

## Features

- **WhyFinder Simulation**: Complete 12-exchange coaching conversation flow
- **Ikigai Builder**: 4-phase exploration (Love, Good At, World Needs, Paid For)
- **Decision Helper**: Follow-up guidance simulation
- **7-Metric Evaluation System**:
  - Clarity
  - Structural Correctness
  - Consistency
  - Coverage
  - Hallucination Detection
  - Decision Expertise
  - Sensitivity & Safety
- **Detailed Judge Feedback**: Pros, cons, and pinpointed issues with exact quotes
- **Per-Scenario Token Tracking**: Input/output breakdown by phase and role
- **Multi-Model Support**: Evaluate multiple models simultaneously
- **Leaderboard**: Ranked results with scenario-wise score breakdown

## Installation

1. Copy the plugin to your BrainDrive plugins directory:
   ```
   backend/plugins/shared/BrainDriveEvaluator/v1.0.0/
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Build the plugin:
   ```bash
   npm run build
   ```

4. Configure your OpenAI API key in the plugin settings panel

## Usage

1. Open the BrainDrive Evaluator plugin in BrainDrive
2. Select the models you want to evaluate
3. Choose evaluation scenarios
4. Configure the synthetic user and judge models
5. Click "Start Evaluation"
6. View results in the Leaderboard with:
   - **Transcript**: Full conversation with Why and Ikigai profiles
   - **Comments**: Judge feedback, pros/cons, token usage
   - **Scenarios**: Per-scenario score breakdown

## Requirements

- BrainDrive Core with WhyFinder plugin installed
- OpenAI API key (for synthetic user and judge)
- Models configured in BrainDrive (OpenRouter, Ollama, etc.)

## Configuration

| Setting | Description | Default |
|---------|-------------|---------|
| Temperature | Model creativity (0 = deterministic) | 0 |
| Synthetic User | Model for simulating human responses | gpt-4o-mini |
| Judge Model | Model for evaluation scoring | gpt-4o |

## License

MIT License - see [LICENSE](LICENSE) for details.

## Author

Navaneeth Krishnan

