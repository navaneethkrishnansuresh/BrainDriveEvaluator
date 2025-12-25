# BrainDrive Evaluator Plugin

Automates end-to-end evaluation of open-source and closed-source models using the WhyFinder-IKIGAI plugin flow.

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

## Requirements (Mandatory)

- BrainDrive Core with the WhyFinder plugin installed
- OpenAI API key (for synthetic user and judge)
- Models configured in BrainDrive (OpenRouter, Ollama, etc.)


## Configuration

| Setting | Description | Default |
|---------|-------------|---------|
| Temperature | Model creativity (0 = deterministic) | 0 |
| Synthetic User | Model for simulating human responses | gpt-4o |
| Judge Model | Model for evaluation scoring | gpt-4o |

## License

MIT License - see [LICENSE](LICENSE) for details.

## Author

BrainDrive - Navaneeth Krishnan 

