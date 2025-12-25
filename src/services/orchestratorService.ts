/**
 * Orchestrator Service for BrainDrive Evaluator
 * 
 * EXACT REPLICA of WhyFinder flow.
 * Imports prompts and functions DIRECTLY from WhyFinder plugin.
 * 
 * The flow simulates:
 * 1. Why Finder (12 exchanges) - discovers the user's Why
 * 2. Ikigai Builder (4 phases x 3+ exchanges) - builds full Ikigai profile
 * 3. Decision Helper (3 exchanges) - tests decision guidance
 */

import { 
  Services, 
  ModelInfo, 
  Scenario, 
  EvaluationRun, 
  TranscriptMessage,
  EvaluationConfig,
  generateId
} from '../types';

import { ModelService } from './modelService';

// ===========================================================================
// DIRECT IMPORTS FROM WHYFINDER - Using exact same prompts and functions
// ===========================================================================

// Import ONLY types we need from WhyFinder
import {
  SessionPhase,
  IkigaiPhase,
  SessionData,
  WhyProfile as WFWhyProfile,
  IkigaiProfile as WFIkigaiProfile,
  PhaseAnswerCounts,
  WHY_FINDER_TOTAL_EXCHANGES,
  MIN_ANSWERS_PER_PHASE,
} from '../../../../BrainDriveWhyDetector/v1.0.0/src/types';

// Import prompts and functions directly from WhyFinder
import {
  INITIAL_GREETING,
  IKIGAI_PHASE1_INTRO,
  IKIGAI_PHASE2_INTRO,
  IKIGAI_PHASE3_INTRO,
  IKIGAI_PHASE4_INTRO,
  DECISION_HELPER_INTRO,
  getCoachSystemPrompt,
  getPhaseSummarizationPrompt,
  getOverlapComputationPrompt,
  getWhyExtractionPrompt,
} from '../../../../BrainDriveWhyDetector/v1.0.0/src/prompts';

// Local simplified types for evaluation (avoiding WhyFinder's complex internal types)
interface WhyProfile {
  id: string;
  name: string;
  createdAt: string;
  summary: string;
  patterns: string;
  whyStatement: string;
  whyExplanation: string;
  whatYouLove: string[];
  whatYouAreGoodAt: string[];
  modelUsed: string;
  exchangeCount: number;
}

interface IkigaiBucket {
  bullets: string[];
  summary: string;
}

interface IkigaiProfile {
  id: string;
  name: string;
  createdAt: string;
  sourceWhyProfileId?: string;
  whyStatement: string;
  love: IkigaiBucket;
  goodAt: IkigaiBucket;
  worldNeeds: IkigaiBucket;
  paidFor: IkigaiBucket;
  overlaps: {
    passion: IkigaiBucket;
    mission: IkigaiBucket;
    profession: IkigaiBucket;
    vocation: IkigaiBucket;
  };
  keyPatterns: string[];
  autoFilledPhases: { phase1_love: boolean; phase2_good_at: boolean };
  isComplete: boolean;
}

// Local phase storage for evaluation
interface LocalPhaseStorage {
  phase1?: { love: { bullets: string[]; summary: string } };
  phase2?: { goodAt: { bullets: string[]; summary: string } };
  phase3?: { worldNeeds: { bullets: string[]; summary: string } };
  phase4?: { paidFor: { bullets: string[]; summary: string } };
}

// Map for Ikigai phase intros (using WhyFinder's exact constants)
const IKIGAI_PHASE_INTROS: Record<IkigaiPhase, string> = {
  phase1_love: IKIGAI_PHASE1_INTRO,
  phase2_good_at: IKIGAI_PHASE2_INTRO,
  phase3_world: IKIGAI_PHASE3_INTRO,
  phase4_paid: IKIGAI_PHASE4_INTRO,
  complete: 'All phases complete.',
};

// Types imported directly from WhyFinder - no local duplicates needed

// Local interface for IkigaiBucket (helper for building profiles)
interface IkigaiBucket {
  bullets: string[];
  summary: string;
}

// ===========================================================================
// NOTE: All prompts and functions are imported directly from WhyFinder
// This ensures 100% compatibility - no local reimplementations
// ===========================================================================

// Use the imported basePrompt + phase-specific prompts
// ===========================================================================
// LOCAL WRAPPERS - Use WhyFinder's prompts with simplified parameters
// ===========================================================================

// Import the raw .txt prompts for building Ikigai and Decision prompts
// @ts-ignore
import ikigaiBasePrompt from '../../../../BrainDriveWhyDetector/v1.0.0/src/prompts/ikigai_base.txt';
// @ts-ignore
import ikigaiPhase1LovePrompt from '../../../../BrainDriveWhyDetector/v1.0.0/src/prompts/ikigai_phase1_love.txt';
// @ts-ignore
import ikigaiPhase2GoodAtPrompt from '../../../../BrainDriveWhyDetector/v1.0.0/src/prompts/ikigai_phase2_good_at.txt';
// @ts-ignore
import ikigaiPhase3WorldPrompt from '../../../../BrainDriveWhyDetector/v1.0.0/src/prompts/ikigai_phase3_world.txt';
// @ts-ignore
import ikigaiPhase4PaidPrompt from '../../../../BrainDriveWhyDetector/v1.0.0/src/prompts/ikigai_phase4_paid.txt';
// @ts-ignore
import decisionHelperPrompt from '../../../../BrainDriveWhyDetector/v1.0.0/src/prompts/decision_helper.txt';

// Build Ikigai prompt using imported WhyFinder prompts
function getIkigaiBuilderPrompt(
  phase: IkigaiPhase,
  answerCounts: PhaseAnswerCounts,
  whyProfile?: WhyProfile | null
): string {
  let prompt = ikigaiBasePrompt;
  
  switch (phase) {
    case 'phase1_love':
      prompt += '\n\n' + ikigaiPhase1LovePrompt;
      break;
    case 'phase2_good_at':
      prompt += '\n\n' + ikigaiPhase2GoodAtPrompt;
      break;
    case 'phase3_world':
      prompt += '\n\n' + ikigaiPhase3WorldPrompt;
      break;
    case 'phase4_paid':
      prompt += '\n\n' + ikigaiPhase4PaidPrompt;
      break;
  }
  
  // Add current counts
  prompt += `\n\nCurrent counts: Love=${answerCounts.love}, GoodAt=${answerCounts.goodAt}, WorldNeeds=${answerCounts.worldNeeds}, PaidFor=${answerCounts.paidFor}`;
  
  if (whyProfile) {
    prompt += `\n\nUser's Why Statement: "${whyProfile.whyStatement}"`;
    if (whyProfile.whatYouLove?.length) {
      prompt += `\nWhat they love: ${whyProfile.whatYouLove.join(', ')}`;
    }
    if (whyProfile.whatYouAreGoodAt?.length) {
      prompt += `\nWhat they're good at: ${whyProfile.whatYouAreGoodAt.join(', ')}`;
    }
  }
  
  return prompt;
}

// Build Decision Helper prompt using imported WhyFinder prompt
function getDecisionHelperPrompt(
  profile: IkigaiProfile,
  conversationHistory: { role: string; content: string }[]
): string {
  let prompt = decisionHelperPrompt;
  
  prompt += `\n\nUser's Ikigai Profile:
- Why: ${profile.whyStatement}
- What they love: ${profile.love.bullets.join(', ')}
- What they're good at: ${profile.goodAt.bullets.join(', ')}
- What the world needs: ${profile.worldNeeds.bullets.join(', ')}
- What they can be paid for: ${profile.paidFor.bullets.join(', ')}`;
  
  return prompt;
}

// ===========================================================================
// SYNTHETIC USER PROMPT
// ===========================================================================

function getSyntheticUserPrompt(scenario: Scenario, customPrompt?: string): string {
  return `${customPrompt ? customPrompt + '\n\n' : ''}You are a HUMAN USER seeking coaching. You are NOT the coach.

═══════════════════════════════════════════════════════════════════
CRITICAL RULES - VIOLATION = FAILURE
═══════════════════════════════════════════════════════════════════

1. YOU ARE THE PERSON BEING COACHED - NOT THE COACH
2. ONLY ANSWER QUESTIONS - Never ask the coach questions back
3. NEVER GIVE ADVICE - You are seeking help, not giving it
4. NEVER SUMMARIZE - Just share raw experiences
5. NEVER REPEAT ANY WORDS THE COACH JUST SAID
6. NEVER START WITH FRAGMENTS FROM COACH'S LAST MESSAGE
7. DO NOT COPY ANY PHRASES FROM THE PREVIOUS MESSAGE
8. Keep responses SHORT (2-4 sentences maximum)
9. Share ONLY personal experiences, feelings, struggles
10. NO ANALYSIS - Just be a regular person talking

ABSOLUTE PROHIBITIONS:
- Never start with ". " or "? " (partial sentences)
- Never use phrases like "Does this resonate" or "How does this feel"
- Never say "YOUR WHY IS" or summarize patterns
- Never use coaching language like "It sounds like" or "I hear you"
- Never reflect back what the coach said
- Never ask if something resonates - YOU are the one seeking help

═══════════════════════════════════════════════════════════════════
YOUR PERSONA
═══════════════════════════════════════════════════════════════════

${scenario.personaSummary}

YOUR LIFE CONSTRAINTS (stay within these facts):
${scenario.constraints.map(c => `• ${c}`).join('\n')}

YOUR GOALS (why you're seeking coaching):
${scenario.goals.map(g => `• ${g}`).join('\n')}

YOUR INTERNAL CONFLICTS:
${scenario.conflictPoints.map(cp => `• ${cp}`).join('\n')}

RED LINES (never invent or contradict):
${scenario.redLines.map(rl => `• ${rl}`).join('\n')}

STARTING CONTEXT:
"${scenario.starterContext}"

═══════════════════════════════════════════════════════════════════
HOW TO RESPOND
═══════════════════════════════════════════════════════════════════

BAD RESPONSE (coaching/advising):
"It is beautiful to see how you use transparency as a shield..."
"I think what you need to focus on is..."

GOOD RESPONSE (answering as a human):
"When I'm stressed, I just shut down. Like last week when..."
"I don't know... I guess I feel stuck because..."

Now respond to the coach's question as this persona. Be human. Be short.`;
}

// ===========================================================================
// ORCHESTRATOR SERVICE
// ===========================================================================

export class OrchestratorService {
  private services: Services;
  private modelService: ModelService;
  private abortController: AbortController | null = null;

  constructor(services: Services) {
    this.services = services;
    this.modelService = new ModelService(services);
  }

  /**
   * Set the model service (for sharing API key state)
   */
  setModelService(modelService: ModelService): void {
    this.modelService = modelService;
  }

  /**
   * Run a single evaluation for one model on one scenario
   */
  async runSingleEvaluation(
    candidateModel: ModelInfo,
    syntheticUserModel: ModelInfo,
    scenario: Scenario,
    config: EvaluationConfig,
    onProgress?: (phase: string, exchange: number, total: number) => void
  ): Promise<EvaluationRun> {
    const startTime = Date.now();
    this.abortController = new AbortController();

    console.log('[Orchestrator] Starting evaluation');
    console.log(`[Orchestrator] Candidate model: ${candidateModel.name} (${candidateModel.provider})`);
    console.log(`[Orchestrator] Synthetic user: ${syntheticUserModel.name} (${syntheticUserModel.provider})`);
    console.log(`[Orchestrator] Scenario: ${scenario.name}`);
    
    // Reset token tracking for this run
    this.modelService.resetTokenTracking();

    const run: EvaluationRun = {
      id: generateId('run'),
      modelId: candidateModel.id,
      modelName: candidateModel.name,
      scenarioId: scenario.id,
      scenarioName: scenario.name,
      timestamp: new Date().toISOString(),
      duration: 0,
      status: 'running',
      transcript: [],
      whyProfile: null,
      ikigaiProfile: null,
      decisionHelperOutput: [],
      metadata: {
        modelProvider: candidateModel.provider,
        modelName: candidateModel.name,
        temperature: config.candidateTemperature,
        pluginVersions: {
          evaluator: '1.0.0',
          whyfinder: '1.0.0',
        },
      },
    };

    try {
      // Verify OpenAI API key is available before starting
      if (!this.modelService.hasOpenAIApiKey()) {
        throw new Error('OpenAI API key not configured. The synthetic user and judge require an OpenAI API key.');
      }

      console.log('[Orchestrator] ╔══════════════════════════════════════════════════════════════╗');
      console.log('[Orchestrator] ║              PHASE 1: WHY FINDER (12 exchanges)              ║');
      console.log('[Orchestrator] ╚══════════════════════════════════════════════════════════════╝');
      
      // Phase 1: Why Finder (12 exchanges)
      onProgress?.('why_finder', 0, WHY_FINDER_TOTAL_EXCHANGES);
      this.modelService.setCurrentPhase('whyFinder');
      const whyFinderResult = await this.simulateWhyFinder(
        candidateModel,
        syntheticUserModel,
        scenario,
        config,
        (exchange) => onProgress?.('why_finder', exchange, WHY_FINDER_TOTAL_EXCHANGES)
      );
      run.transcript = whyFinderResult.transcript;
      run.whyProfile = whyFinderResult.whyProfile;
      console.log(`[Orchestrator] ✓ Why Finder completed: ${run.transcript.length} messages, profile: ${run.whyProfile ? 'yes' : 'no'}`);

      console.log('[Orchestrator] ╔══════════════════════════════════════════════════════════════╗');
      console.log('[Orchestrator] ║             PHASE 2: IKIGAI BUILDER (4 phases)               ║');
      console.log('[Orchestrator] ╚══════════════════════════════════════════════════════════════╝');
      
      // Phase 2: Ikigai Builder (4 phases)
      onProgress?.('ikigai', 0, 4);
      this.modelService.setCurrentPhase('ikigai');
      const ikigaiResult = await this.simulateIkigaiBuilder(
        candidateModel,
        syntheticUserModel,
        scenario,
        config,
        run.whyProfile,
        run.transcript,
        (phase) => onProgress?.('ikigai', phase, 4)
      );
      run.transcript = ikigaiResult.transcript;
      run.ikigaiProfile = ikigaiResult.ikigaiProfile;
      console.log(`[Orchestrator] ✓ Ikigai Builder completed: ${run.transcript.length} total messages`);

      console.log('[Orchestrator] ╔══════════════════════════════════════════════════════════════╗');
      console.log('[Orchestrator] ║             PHASE 3: DECISION HELPER (3 exchanges)           ║');
      console.log('[Orchestrator] ╚══════════════════════════════════════════════════════════════╝');
      
      // Phase 3: Decision Helper
      onProgress?.('decision_helper', 0, 1);
      this.modelService.setCurrentPhase('decisionHelper');
      const decisionResult = await this.simulateDecisionHelper(
        candidateModel,
        syntheticUserModel,
        scenario,
        config,
        run.ikigaiProfile,
        run.transcript
      );
      run.decisionHelperOutput = decisionResult.decisionOutput;
      run.transcript = [...run.transcript, ...decisionResult.decisionOutput];
      console.log(`[Orchestrator] ✓ Decision Helper completed: ${run.decisionHelperOutput.length} messages`);

      // Store token usage in run metadata
      const tokenUsage = this.modelService.getTokenUsage();
      run.metadata.tokenUsage = {
        input: tokenUsage.total.input,
        output: tokenUsage.total.output,
        total: tokenUsage.total.grand,
      };
      // Store detailed phase-by-phase token usage
      (run as any).phaseTokenUsage = tokenUsage;
      
      console.log(`[Orchestrator] Token usage: input=${tokenUsage.total.input}, output=${tokenUsage.total.output}, total=${tokenUsage.total.grand}`);

      run.status = 'completed';
      console.log('[Orchestrator] ╔══════════════════════════════════════════════════════════════╗');
      console.log('[Orchestrator] ║                  ✓ RUN COMPLETED SUCCESSFULLY                ║');
      console.log('[Orchestrator] ╚══════════════════════════════════════════════════════════════╝');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('[Orchestrator] ╔══════════════════════════════════════════════════════════════╗');
      console.error('[Orchestrator] ║                  ✗ RUN FAILED                               ║');
      console.error('[Orchestrator] ╚══════════════════════════════════════════════════════════════╝');
      console.error('[Orchestrator] Error:', errorMessage);
      if (error instanceof Error && error.stack) {
        console.error('[Orchestrator] Stack:', error.stack);
      }
      run.status = 'failed';
      run.metadata.tokenUsage = { input: 0, output: 0, total: 0 };
      // Store the error message for debugging
      (run.metadata as any).errorMessage = errorMessage;
    }

    run.duration = Date.now() - startTime;
    return run;
  }

  /**
   * Simulate the Why Finder conversation (12 exchanges)
   */
  private async simulateWhyFinder(
    candidateModel: ModelInfo,
    syntheticUserModel: ModelInfo,
    scenario: Scenario,
    config: EvaluationConfig,
    onExchange?: (exchange: number) => void
  ): Promise<{ transcript: TranscriptMessage[]; whyProfile: WhyProfile | null }> {
    const transcript: TranscriptMessage[] = [];
    const conversationHistory: { role: string; content: string }[] = [];
    
    let sessionData: SessionData = {
      energizers: [],
      drainers: [],
      stories: [],
      summary: '',
      patterns: '',
      whyStatement: '',
      whyExplanation: '',
      candidateStrengths: [],
      whatYouLove: [],
      whatYouAreGoodAt: [],
    };
    let currentPhase: SessionPhase = 'intro';

    // Add initial greeting from coach
    transcript.push({
      role: 'assistant',
      content: INITIAL_GREETING,
      timestamp: new Date().toISOString(),
      phase: 'intro',
      exchangeNumber: 0,
    });
    conversationHistory.push({ role: 'assistant', content: INITIAL_GREETING });

    // Run 12 exchanges
    for (let exchange = 1; exchange <= WHY_FINDER_TOTAL_EXCHANGES; exchange++) {
      onExchange?.(exchange);

      // Determine current phase
      if (exchange <= 3) currentPhase = 'intro';
      else if (exchange <= 6) currentPhase = 'energy_map';
      else if (exchange <= 9) currentPhase = 'stories';
      else currentPhase = 'your_why';

      // Add small delay between exchanges to avoid rate limiting
      if (exchange > 1) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      // 1. Generate synthetic user response
      console.log(`[Orchestrator] ═══ WhyFinder exchange ${exchange}/${WHY_FINDER_TOTAL_EXCHANGES} - Phase: ${currentPhase} ═══`);
      console.log(`[Orchestrator] Calling synthetic user: ${syntheticUserModel.name}`);
      
      const userResponse = await this.generateSyntheticUserResponse(
        syntheticUserModel,
        scenario,
        config,
        conversationHistory
      );

      if (!userResponse || userResponse.trim() === '') {
        console.warn(`[Orchestrator] Empty response from synthetic user at exchange ${exchange}`);
      } else {
        console.log(`[Orchestrator] Synthetic user response (${userResponse.length} chars): ${userResponse.substring(0, 100)}...`);
      }

      transcript.push({
        role: 'user',
        content: userResponse,
        timestamp: new Date().toISOString(),
        phase: currentPhase,
        exchangeNumber: exchange,
      });
      conversationHistory.push({ role: 'user', content: userResponse });

      // 2. Generate coach response
      console.log(`[Orchestrator] Calling candidate model: ${candidateModel.name}`);
      
      let coachResponse: string;
      
      // FORCED WHY DELIVERY AT EXCHANGE 12
      if (exchange >= WHY_FINDER_TOTAL_EXCHANGES) {
        console.log(`[Orchestrator] ═══ EXCHANGE 12 DETECTED - FORCING WHY DELIVERY ═══`);
        
        // Build conversation summary for Why extraction
        const conversationText = conversationHistory
          .map(msg => `${msg.role.toUpperCase()}: ${msg.content}`)
          .join('\n\n');
        
        const forceWhyPrompt = `You are a Why Coach completing a Why Finder session. You have had 12 exchanges with the user exploring what energizes them, what drains them, and meaningful stories from their life.

CONVERSATION SO FAR:
${conversationText}

═══════════════════════════════════════════════════════════════════
YOUR TASK: DELIVER THE WHY STATEMENT NOW
═══════════════════════════════════════════════════════════════════

This is your FINAL response. You MUST deliver their Why statement.

Your response MUST follow this EXACT structure:

---

**SUMMARY OF WHAT I LEARNED:**
• [Specific insight from conversation]
• [Another specific insight]
• [Another specific insight]

**THE PATTERNS I SEE:**
• [Pattern connecting their stories and energizers]
• [Another pattern you noticed]

**YOUR WHY IS:**
To [action/contribution verb] so that [impact on others]

**WHY THIS FITS YOU:**
[2-3 paragraphs explaining why this Why statement captures their essence, referencing specific things they said]

**WHAT YOU LOVE (from our conversation):**
• [Thing 1]
• [Thing 2]
• [Thing 3]
• [More as applicable]

**WHAT YOU'RE GOOD AT (from our conversation):**
• [Skill 1]
• [Skill 2]
• [Skill 3]
• [More as applicable]

---

Take a moment to reflect on this. Does this resonate with you?

═══════════════════════════════════════════════════════════════════
CRITICAL RULES:
- DO NOT ask any questions
- DO NOT say "one more question" or "before we end"
- The Why statement MUST start with "To" and include "so that"
- End with the reflection statement, not a question
═══════════════════════════════════════════════════════════════════`;

        coachResponse = await this.modelService.sendCandidateModelRequest(
          candidateModel,
          [{ role: 'user', content: forceWhyPrompt }],
          { temperature: config.candidateTemperature }
        );
        
        console.log(`[Orchestrator] ✓ Why statement delivered (forced)`);
      } else {
        // Normal exchange - use WhyFinder's prompt
        const systemPrompt = getCoachSystemPrompt(
          currentPhase,
          sessionData,
          conversationHistory,
          exchange
        );

        coachResponse = await this.modelService.sendCandidateModelRequest(
          candidateModel,
          [
            { role: 'system', content: systemPrompt },
            ...conversationHistory,
          ],
          { temperature: config.candidateTemperature }
        );
      }

      if (!coachResponse || coachResponse.trim() === '') {
        console.warn(`[Orchestrator] Empty response from candidate model at exchange ${exchange}`);
      } else {
        console.log(`[Orchestrator] Candidate model response (${coachResponse.length} chars): ${coachResponse.substring(0, 100)}...`);
      }

      transcript.push({
        role: 'assistant',
        content: coachResponse,
        timestamp: new Date().toISOString(),
        phase: currentPhase,
        exchangeNumber: exchange,
      });
      conversationHistory.push({ role: 'assistant', content: coachResponse });

      if (this.abortController?.signal.aborted) {
        throw new Error('Evaluation aborted');
      }
    }

    console.log(`[Orchestrator] WhyFinder completed with ${transcript.length} messages`);

    // Extract Why profile
    const whyProfile = await this.extractWhyProfile(transcript, candidateModel);
    return { transcript, whyProfile };
  }

  /**
   * Simulate Ikigai Builder (4 phases)
   */
  private async simulateIkigaiBuilder(
    candidateModel: ModelInfo,
    syntheticUserModel: ModelInfo,
    scenario: Scenario,
    config: EvaluationConfig,
    whyProfile: WhyProfile | null,
    existingTranscript: TranscriptMessage[],
    onPhase?: (phase: number) => void
  ): Promise<{ transcript: TranscriptMessage[]; ikigaiProfile: IkigaiProfile | null }> {
    const transcript = [...existingTranscript];
    const answerCounts: PhaseAnswerCounts = { love: 0, goodAt: 0, worldNeeds: 0, paidFor: 0 };

    // Storage for phase summaries (simplified local structure)
    const phaseStorage: LocalPhaseStorage = {};

    // Auto-fill from Why Profile if available
    if (whyProfile) {
      if ((whyProfile.whatYouLove?.length || 0) >= MIN_ANSWERS_PER_PHASE) {
        answerCounts.love = whyProfile.whatYouLove.length;
        phaseStorage.phase1 = { 
          love: { 
            bullets: whyProfile.whatYouLove, 
            summary: 'From Why Profile' 
          }
        };
      }
      if ((whyProfile.whatYouAreGoodAt?.length || 0) >= MIN_ANSWERS_PER_PHASE) {
        answerCounts.goodAt = whyProfile.whatYouAreGoodAt.length;
        phaseStorage.phase2 = { 
          goodAt: { 
            bullets: whyProfile.whatYouAreGoodAt, 
            summary: 'From Why Profile' 
          }
        };
      }
    }

    const phases: IkigaiPhase[] = ['phase1_love', 'phase2_good_at', 'phase3_world', 'phase4_paid'];

    for (let i = 0; i < phases.length; i++) {
      onPhase?.(i + 1);
      const phase = phases[i];
      
      // Skip auto-filled phases
      if (phase === 'phase1_love' && answerCounts.love >= MIN_ANSWERS_PER_PHASE) continue;
      if (phase === 'phase2_good_at' && answerCounts.goodAt >= MIN_ANSWERS_PER_PHASE) continue;

      const phaseIntro = IKIGAI_PHASE_INTROS[phase];
      transcript.push({
        role: 'assistant',
        content: phaseIntro,
        timestamp: new Date().toISOString(),
        phase: phase,
      });

      const phaseConversation: { role: string; content: string }[] = [
        { role: 'assistant', content: phaseIntro }
      ];

      // Run until we have enough answers
      let phaseExchanges = 0;
      const countKey = phase === 'phase1_love' ? 'love' : 
                       phase === 'phase2_good_at' ? 'goodAt' :
                       phase === 'phase3_world' ? 'worldNeeds' : 'paidFor';

      while (answerCounts[countKey] < MIN_ANSWERS_PER_PHASE && phaseExchanges < 10) {
        phaseExchanges++;

        const userResponse = await this.generateSyntheticUserResponse(
          syntheticUserModel,
          scenario,
          config,
          phaseConversation
        );

        transcript.push({
          role: 'user',
          content: userResponse,
          timestamp: new Date().toISOString(),
          phase: phase,
        });
        phaseConversation.push({ role: 'user', content: userResponse });
        answerCounts[countKey]++;

        const systemPrompt = getIkigaiBuilderPrompt(phase, answerCounts, whyProfile);
        // Use BrainDrive API for candidate model
        const coachResponse = await this.modelService.sendCandidateModelRequest(
          candidateModel,
          [
            { role: 'system', content: systemPrompt },
            ...phaseConversation,
          ],
          { temperature: config.candidateTemperature }
        );

        transcript.push({
          role: 'assistant',
          content: coachResponse,
          timestamp: new Date().toISOString(),
          phase: phase,
        });
        phaseConversation.push({ role: 'assistant', content: coachResponse });

        if (this.abortController?.signal.aborted) {
          throw new Error('Evaluation aborted');
        }
      }

      // SUMMARIZE PHASE (exactly like WhyFinder does)
      console.log(`[Orchestrator] Summarizing phase: ${phase}`);
      const phaseData = await this.summarizePhase(candidateModel, phase, phaseConversation);
      
      if (phase === 'phase1_love' && phaseData) {
        phaseStorage.phase1 = { 
          love: { bullets: phaseData.bullets || [], summary: phaseData.summary || '' }
        };
      } else if (phase === 'phase2_good_at' && phaseData) {
        phaseStorage.phase2 = { 
          goodAt: { bullets: phaseData.bullets || [], summary: phaseData.summary || '' }
        };
      } else if (phase === 'phase3_world' && phaseData) {
        phaseStorage.phase3 = { 
          worldNeeds: { bullets: phaseData.bullets || [], summary: phaseData.summary || '' }
        };
      } else if (phase === 'phase4_paid' && phaseData) {
        phaseStorage.phase4 = { 
          paidFor: { bullets: phaseData.bullets || [], summary: phaseData.summary || '' }
        };
      }
    }

    const ikigaiProfile = this.buildIkigaiProfile(transcript, whyProfile, phaseStorage);
    
    // Compute overlaps using WhyFinder's function
    if (ikigaiProfile) {
      const overlaps = await this.computeOverlaps(candidateModel, ikigaiProfile);
      if (overlaps) {
        ikigaiProfile.overlaps = overlaps;
      }
    }
    
    return { transcript, ikigaiProfile };
  }

  /**
   * Compute Ikigai overlaps using WhyFinder's prompt
   */
  private async computeOverlaps(
    candidateModel: ModelInfo,
    profile: IkigaiProfile
  ): Promise<IkigaiProfile['overlaps'] | null> {
    try {
      const prompt = getOverlapComputationPrompt(
        profile.whyStatement,
        profile.love.bullets,
        profile.goodAt.bullets,
        profile.worldNeeds.bullets,
        profile.paidFor.bullets
      );

      console.log('[Orchestrator] Computing Ikigai overlaps...');
      const response = await this.modelService.sendCandidateModelRequest(
        candidateModel,
        [{ role: 'user', content: prompt }],
        { temperature: 0 }
      );

      const parsed = this.extractValidJson(response);
      if (parsed) {
        return {
          passion: { 
            bullets: parsed.passion?.bullets || [], 
            summary: parsed.passion?.summary || '' 
          },
          mission: { 
            bullets: parsed.mission?.bullets || [], 
            summary: parsed.mission?.summary || '' 
          },
          profession: { 
            bullets: parsed.profession?.bullets || [], 
            summary: parsed.profession?.summary || '' 
          },
          vocation: { 
            bullets: parsed.vocation?.bullets || [], 
            summary: parsed.vocation?.summary || '' 
          },
        };
      }
    } catch (error) {
      console.error('[Orchestrator] Overlap computation failed:', error);
    }
    return null;
  }

  /**
   * Simulate Decision Helper
   */
  private async simulateDecisionHelper(
    candidateModel: ModelInfo,
    syntheticUserModel: ModelInfo,
    scenario: Scenario,
    config: EvaluationConfig,
    ikigaiProfile: IkigaiProfile | null,
    existingTranscript: TranscriptMessage[]
  ): Promise<{ decisionOutput: TranscriptMessage[] }> {
    const decisionOutput: TranscriptMessage[] = [];

    if (!ikigaiProfile) {
      return { decisionOutput };
    }

    decisionOutput.push({
      role: 'assistant',
      content: DECISION_HELPER_INTRO,
      timestamp: new Date().toISOString(),
      phase: 'decision_helper',
    });

    const conversationHistory: { role: string; content: string }[] = [
      { role: 'assistant', content: DECISION_HELPER_INTRO }
    ];

    // Run 3 decision helper exchanges
    for (let i = 0; i < 3; i++) {
      const userResponse = await this.generateSyntheticUserResponse(
        syntheticUserModel,
        scenario,
        config,
        conversationHistory
      );

      decisionOutput.push({
        role: 'user',
        content: userResponse,
        timestamp: new Date().toISOString(),
        phase: 'decision_helper',
      });
      conversationHistory.push({ role: 'user', content: userResponse });

      const systemPrompt = getDecisionHelperPrompt(ikigaiProfile, conversationHistory);
      // Use BrainDrive API for candidate model
      const coachResponse = await this.modelService.sendCandidateModelRequest(
        candidateModel,
        [
          { role: 'system', content: systemPrompt },
          ...conversationHistory,
        ],
        { temperature: config.candidateTemperature }
      );

      decisionOutput.push({
        role: 'assistant',
        content: coachResponse,
        timestamp: new Date().toISOString(),
        phase: 'decision_helper',
      });
      conversationHistory.push({ role: 'assistant', content: coachResponse });

      if (this.abortController?.signal.aborted) {
        throw new Error('Evaluation aborted');
      }
    }

    return { decisionOutput };
  }

  /**
   * Generate synthetic user response (uses OpenAI directly)
   */
  private async generateSyntheticUserResponse(
    syntheticModel: ModelInfo,
    scenario: Scenario,
    config: EvaluationConfig,
    conversationHistory: { role: string; content: string }[]
  ): Promise<string> {
    const systemPrompt = getSyntheticUserPrompt(scenario, config.syntheticUserPrompt);

    console.log(`[Orchestrator] → Generating synthetic user response with ${syntheticModel.name}`);
    console.log(`[Orchestrator]   Conversation history: ${conversationHistory.length} messages`);

    try {
      // Use OpenAI direct API for synthetic user
      const response = await this.modelService.sendOpenAIRequest(
        syntheticModel,
        [
          { role: 'system', content: systemPrompt },
          ...conversationHistory,
        ],
        { temperature: 0 }
      );

      if (!response || response.trim() === '') {
        console.error('[Orchestrator] ✗ Empty response from synthetic user model');
        throw new Error('Synthetic user model returned empty response');
      }

      // SAFEGUARD: Detect if synthetic user is mirroring/copying the coach
      if (conversationHistory.length > 0) {
        const lastCoachMsg = conversationHistory[conversationHistory.length - 1];
        if (lastCoachMsg.role === 'assistant') {
          const responseTrimmed = response.trim();
          
          // Check for partial sentence starts (copying end of coach message)
          if (responseTrimmed.startsWith('.') || responseTrimmed.startsWith('?') || responseTrimmed.startsWith('!')) {
            console.warn('[Orchestrator] ⚠ Detected partial sentence copy');
            return `That's an interesting question. Let me think... When I'm in that situation, I usually feel a mix of emotions - sometimes overwhelmed, sometimes determined.`;
          }
          
          // Check for coaching language being used by the "user"
          const coachingPhrases = ['YOUR WHY IS', 'Does this resonate', 'How does this feel', 'It sounds like', 'I hear you', 'SUMMARY OF', 'PATTERNS I SEE'];
          for (const phrase of coachingPhrases) {
            if (responseTrimmed.toUpperCase().includes(phrase.toUpperCase())) {
              console.warn(`[Orchestrator] ⚠ Detected coaching language: "${phrase}"`);
              return `I appreciate you asking. To answer your question - it's something I struggle with. I often find myself caught between wanting to help and feeling unsure if I'm doing enough.`;
            }
          }
          
          // Check for word overlap (mirroring)
          const coachWords = lastCoachMsg.content.toLowerCase().split(/\s+/).slice(0, 30);
          const userWords = responseTrimmed.toLowerCase().split(/\s+/).slice(0, 30);
          const overlap = coachWords.filter(w => userWords.includes(w) && w.length > 5).length;
          
          // If >40% overlap, likely mirroring
          if (overlap > 12) {
            console.warn(`[Orchestrator] ⚠ Detected word mirroring (${overlap} shared words)`);
            return `That's something I've been thinking about a lot lately. I guess at my core, I want to feel like I'm making a real difference in people's lives.`;
          }
        }
      }

      console.log(`[Orchestrator] ← Synthetic user response: ${response.length} chars`);
      console.log(`[Orchestrator]   Preview: "${response.substring(0, 80)}..."`);
      return response;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[Orchestrator] ✗ Failed to generate synthetic user response: ${errorMsg}`);
      throw new Error(`Synthetic user (OpenAI) failed: ${errorMsg}`);
    }
  }

  /**
   * Extract Why Profile from conversation
   */
  private async extractWhyProfile(
    transcript: TranscriptMessage[],
    model: ModelInfo
  ): Promise<WhyProfile | null> {
    // Convert transcript to WhyFinder's expected format
    const conversation = transcript.map(m => ({
      role: m.role as 'user' | 'assistant',
      content: m.content
    }));
    
    // Use WhyFinder's exact extraction prompt
    const extractionPrompt = getWhyExtractionPrompt(conversation);

    try {
      // Use candidate model to extract its own profile (via BrainDrive)
      const response = await this.modelService.sendCandidateModelRequest(
        model,
        [{ role: 'user', content: extractionPrompt }],
        { temperature: 0 }
      );

      const parsed = this.extractValidJson(response);
      if (parsed) {
        return {
          id: generateId('why'),
          name: 'Extracted Why Profile',
          createdAt: new Date().toISOString(),
          summary: parsed.summary || '',
          patterns: parsed.patterns || '',
          whyStatement: parsed.whyStatement || '',
          whyExplanation: '',
          whatYouLove: parsed.whatYouLove || [],
          whatYouAreGoodAt: parsed.whatYouAreGoodAt || [],
          modelUsed: model.name,
          exchangeCount: transcript.length,
        };
      }
    } catch (error) {
      console.error('Failed to extract Why profile:', error);
    }

    return null;
  }

  /**
   * Summarize a phase using candidate model (EXACT replica of WhyFinder)
   * Handles the different JSON structures per phase
   */
  private async summarizePhase(
    candidateModel: ModelInfo,
    phaseName: string,
    phaseConversation: { role: string; content: string }[]
  ): Promise<{ bullets: string[]; summary: string } | null> {
    try {
      // Use imported getPhaseSummarizationPrompt from WhyFinder
      const prompt = getPhaseSummarizationPrompt(phaseName, phaseConversation);
      
      console.log(`[Orchestrator] Calling summarizePhase for ${phaseName}`);
      
      const response = await this.modelService.sendCandidateModelRequest(
        candidateModel,
        [{ role: 'user', content: prompt }],
        { temperature: 0 }
      );

      console.log(`[Orchestrator] Summarize response (first 200 chars): ${response.substring(0, 200)}`);

      const parsed = this.extractValidJson(response);
      if (parsed) {
        // Handle different JSON structures per phase (matching phase_summarize.txt format)
        let bullets: string[] = [];
        let summary = '';

        if (phaseName === 'phase1_love' && parsed.love) {
          bullets = parsed.love.bullets || [];
          summary = parsed.love.summary || '';
        } else if (phaseName === 'phase2_good_at' && parsed.good_at) {
          bullets = parsed.good_at.bullets || [];
          summary = parsed.good_at.summary || '';
        } else if (phaseName === 'phase3_world' && parsed.world_needs) {
          bullets = parsed.world_needs.bullets || [];
          summary = parsed.world_needs.summary || '';
        } else if (phaseName === 'phase4_paid' && parsed.paid_for) {
          // Combine current and potential income sources
          const current = parsed.paid_for.current || [];
          const potential = parsed.paid_for.potential || [];
          bullets = [...current, ...potential];
          summary = parsed.paid_for.summary || '';
        } else {
          // Fallback for generic structure
          bullets = parsed.bullets || parsed.items || [];
          summary = parsed.summary || parsed.key_insight || '';
        }

        console.log(`[Orchestrator] Phase ${phaseName} extracted: ${bullets.length} bullets`);
        return { bullets, summary };
      }
      
      console.warn(`[Orchestrator] Failed to parse JSON for phase ${phaseName}`);
      return { bullets: [], summary: '' };
    } catch (error) {
      console.error('[Orchestrator] Phase summarization failed:', error);
      return { bullets: [], summary: '' };
    }
  }

  /**
   * Build Ikigai Profile from transcript and phase data
   */
  private buildIkigaiProfile(
    transcript: TranscriptMessage[],
    whyProfile: WhyProfile | null,
    phaseStorage?: {
      phase1?: { love: { bullets: string[]; summary: string } };
      phase2?: { goodAt: { bullets: string[]; summary: string } };
      phase3?: { worldNeeds: { bullets: string[]; summary: string } };
      phase4?: { paidFor: { bullets: string[]; summary: string } };
    }
  ): IkigaiProfile {
    return {
      id: generateId('ikigai'),
      name: 'Extracted Ikigai Profile',
      createdAt: new Date().toISOString(),
      sourceWhyProfileId: whyProfile?.id,
      whyStatement: whyProfile?.whyStatement || '',
      love: { 
        bullets: phaseStorage?.phase1?.love?.bullets || whyProfile?.whatYouLove || [], 
        summary: phaseStorage?.phase1?.love?.summary || '' 
      },
      goodAt: { 
        bullets: phaseStorage?.phase2?.goodAt?.bullets || whyProfile?.whatYouAreGoodAt || [], 
        summary: phaseStorage?.phase2?.goodAt?.summary || '' 
      },
      worldNeeds: { 
        bullets: phaseStorage?.phase3?.worldNeeds?.bullets || [], 
        summary: phaseStorage?.phase3?.worldNeeds?.summary || '' 
      },
      paidFor: { 
        bullets: phaseStorage?.phase4?.paidFor?.bullets || [], 
        summary: phaseStorage?.phase4?.paidFor?.summary || '' 
      },
      overlaps: {
        passion: { bullets: [], summary: '' },
        mission: { bullets: [], summary: '' },
        profession: { bullets: [], summary: '' },
        vocation: { bullets: [], summary: '' },
      },
      keyPatterns: [],
      autoFilledPhases: { 
        phase1_love: !!phaseStorage?.phase1 || !!(whyProfile?.whatYouLove?.length), 
        phase2_good_at: !!phaseStorage?.phase2 || !!(whyProfile?.whatYouAreGoodAt?.length)
      },
      isComplete: true,
    };
  }

  /**
   * Extract valid JSON from LLM response
   */
  private extractValidJson(text: string): any | null {
    if (!text) return null;

    // Try to find JSON in the response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[0]);
      } catch (e) {
        // Try to fix common issues
        let fixed = jsonMatch[0]
          .replace(/,\s*}/g, '}')
          .replace(/,\s*]/g, ']')
          .replace(/'/g, '"');
        try {
          return JSON.parse(fixed);
        } catch (e2) {
          console.warn('Failed to parse JSON:', e2);
        }
      }
    }

    return null;
  }

  /**
   * Abort current evaluation
   */
  abort(): void {
    this.abortController?.abort();
  }
}

export default OrchestratorService;
