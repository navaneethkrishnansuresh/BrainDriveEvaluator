/**
 * Model Service for BrainDrive Evaluator
 * 
 * Handles model fetching and API calls for:
 * 1. Candidate models (OpenRouter/Ollama via BrainDrive API) - models being evaluated
 * 2. Judge model (OpenAI direct API) - evaluates quality
 * 3. Synthetic user model (OpenAI direct API) - simulates human user
 * 
 * IMPORTANT: Uses same constants as BrainDriveOpenRouter plugin for compatibility
 */

import { Services, ModelInfo, OPENAI_MODELS } from '../types';

// Constants - matching BrainDriveChat
const USER_ID = 'current';

// Provider -> settings_id mapping (same as BrainDriveChat)
const PROVIDER_SETTINGS_ID_MAP: Record<string, string> = {
  ollama: 'ollama_servers_settings',
  openai: 'openai_api_keys_settings',
  openrouter: 'openrouter_api_keys_settings',
  claude: 'claude_api_keys_settings',
  groq: 'groq_api_keys_settings',
};

// OpenAI API endpoint
const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';

// Settings configuration for OpenAI API key (stored via backend settings API)
const OPENAI_SETTINGS = {
  DEFINITION_ID: 'evaluator_openai_api_settings',
  CATEGORY: 'Evaluator',
  DEFAULT_VALUE: {
    apiKey: '',
    enabled: true,
  }
};

// Fallback localStorage key (for backup)
const OPENAI_KEY_STORAGE_KEY = 'braindrive_evaluator_openai_key';

// OpenRouter model cache key (same as OpenRouter plugin uses)
const OPENROUTER_CACHE_KEY = 'braindrive.openrouter.models.cache';

// Local cache
interface ModelCache {
  models: ModelInfo[];
  timestamp: number;
}
let localCache: ModelCache | null = null;
const CACHE_TTL = 60000; // 1 minute

export class ModelService {
  private services: Services;
  private openaiApiKey: string | null = null;
  private currentUserId: string | null = null;
  
  // Token usage tracking
  private lastTokenUsage: { input: number; output: number } = { input: 0, output: 0 };
  private totalTokenUsage = {
    syntheticInput: 0,
    syntheticOutput: 0,
    candidateInput: 0,
    candidateOutput: 0,
    judgeInput: 0,
    judgeOutput: 0,
  };
  private phaseTokenUsage: {
    whyFinder: { candidateInput: number; candidateOutput: number; syntheticInput: number; syntheticOutput: number };
    ikigai: { candidateInput: number; candidateOutput: number; syntheticInput: number; syntheticOutput: number };
    decisionHelper: { candidateInput: number; candidateOutput: number; syntheticInput: number; syntheticOutput: number };
    judge: { input: number; output: number };
  } = {
    whyFinder: { candidateInput: 0, candidateOutput: 0, syntheticInput: 0, syntheticOutput: 0 },
    ikigai: { candidateInput: 0, candidateOutput: 0, syntheticInput: 0, syntheticOutput: 0 },
    decisionHelper: { candidateInput: 0, candidateOutput: 0, syntheticInput: 0, syntheticOutput: 0 },
    judge: { input: 0, output: 0 },
  };
  private currentPhase: 'whyFinder' | 'ikigai' | 'decisionHelper' | 'judge' = 'whyFinder';

  constructor(services: Services) {
    this.services = services;
    this.initializeUserId();
  }
  
  // Set current phase for token tracking
  setCurrentPhase(phase: 'whyFinder' | 'ikigai' | 'decisionHelper' | 'judge'): void {
    this.currentPhase = phase;
  }
  
  // Reset token tracking for a new run
  resetTokenTracking(): void {
    this.totalTokenUsage = {
      syntheticInput: 0, syntheticOutput: 0,
      candidateInput: 0, candidateOutput: 0,
      judgeInput: 0, judgeOutput: 0,
    };
    this.phaseTokenUsage = {
      whyFinder: { candidateInput: 0, candidateOutput: 0, syntheticInput: 0, syntheticOutput: 0 },
      ikigai: { candidateInput: 0, candidateOutput: 0, syntheticInput: 0, syntheticOutput: 0 },
      decisionHelper: { candidateInput: 0, candidateOutput: 0, syntheticInput: 0, syntheticOutput: 0 },
      judge: { input: 0, output: 0 },
    };
  }
  
  // Get token usage for current run
  getTokenUsage(): typeof this.phaseTokenUsage & { total: { input: number; output: number; grand: number } } {
    const totalInput = this.totalTokenUsage.syntheticInput + this.totalTokenUsage.candidateInput + this.totalTokenUsage.judgeInput;
    const totalOutput = this.totalTokenUsage.syntheticOutput + this.totalTokenUsage.candidateOutput + this.totalTokenUsage.judgeOutput;
    return {
      ...this.phaseTokenUsage,
      total: {
        input: totalInput,
        output: totalOutput,
        grand: totalInput + totalOutput,
      },
    };
  }

  private userIdInitPromise: Promise<void> | null = null;

  /**
   * Initialize user ID from auth endpoint (same as BrainDriveChat)
   */
  private async initializeUserId(): Promise<void> {
    try {
      if (this.services?.api?.get) {
        const response = await this.services.api.get('/api/v1/auth/me');
        if (response && response.id) {
          this.currentUserId = response.id;
          console.log('[ModelService] Got current user ID:', this.currentUserId);
        }
      }
    } catch (error) {
      console.warn('[ModelService] Could not get current user ID:', error);
    }
  }

  /**
   * Ensure user ID is initialized before making requests
   */
  async ensureUserIdInitialized(): Promise<void> {
    if (this.currentUserId) return;
    
    if (!this.userIdInitPromise) {
      this.userIdInitPromise = this.initializeUserId();
    }
    await this.userIdInitPromise;
  }

  /**
   * Get current user ID (actual ID, not 'current')
   */
  getCurrentUserId(): string {
    return this.currentUserId || 'current';
  }

  // ===========================================================================
  // OPENAI API KEY MANAGEMENT (for synthetic user and judge)
  // ===========================================================================

  setOpenAIApiKey(key: string): void {
    this.openaiApiKey = key;
  }

  getOpenAIApiKey(): string | null {
    return this.openaiApiKey;
  }

  hasOpenAIApiKey(): boolean {
    return !!this.openaiApiKey && this.openaiApiKey.trim() !== '';
  }

  /**
   * Save OpenAI API key to backend settings API (persists across restarts)
   * Falls back to localStorage if API is unavailable
   */
  async saveOpenAIApiKey(key: string): Promise<void> {
    this.openaiApiKey = key;
    
    // Try to save via backend settings API (persists in database)
    if (this.services?.api?.post) {
      try {
        // First, try to find existing instance
        let existingId: string | null = null;
        try {
          const findResp = await this.services.api.get('/api/v1/settings/instances', {
            params: {
              definition_id: OPENAI_SETTINGS.DEFINITION_ID,
              user_id: 'current',
              scope: 'user'
            }
          });
          
          let instance: any = null;
          if (Array.isArray(findResp) && findResp.length > 0) instance = findResp[0];
          else if (findResp?.data) instance = Array.isArray(findResp.data) ? findResp.data[0] : findResp.data;
          
          if (instance && instance.id) {
            existingId = instance.id;
          }
        } catch (findErr) {
          console.warn('[ModelService] Could not query existing settings instance:', findErr);
        }

        // Save to backend
        const payload: any = {
          definition_id: OPENAI_SETTINGS.DEFINITION_ID,
          name: 'Evaluator OpenAI API Settings',
          value: { ...OPENAI_SETTINGS.DEFAULT_VALUE, apiKey: key.trim(), enabled: !!key },
          scope: 'user',
          user_id: 'current'
        };
        if (existingId) payload.id = existingId;

        await this.services.api.post('/api/v1/settings/instances', payload);
        console.log('[ModelService] OpenAI API key saved to backend settings');
        
        // Also save to localStorage as backup
        try {
          localStorage.setItem(OPENAI_KEY_STORAGE_KEY, key);
        } catch (e) { /* ignore */ }
        
        return;
      } catch (error) {
        console.warn('[ModelService] Could not save to backend settings:', error);
      }
    }
    
    // Fallback to localStorage
    try {
      localStorage.setItem(OPENAI_KEY_STORAGE_KEY, key);
      console.log('[ModelService] OpenAI API key saved to localStorage (fallback)');
    } catch (error) {
      console.warn('[ModelService] Could not save to localStorage:', error);
    }
  }

  /**
   * Load OpenAI API key from backend settings API
   * Falls back to localStorage if API is unavailable
   */
  async loadOpenAIApiKey(): Promise<string | null> {
    // Try to load from backend settings API first
    if (this.services?.api?.get) {
      try {
        const response = await this.services.api.get('/api/v1/settings/instances', {
          params: {
            definition_id: OPENAI_SETTINGS.DEFINITION_ID,
            user_id: 'current',
            scope: 'user'
          }
        });
        
        let instance: any = null;
        if (Array.isArray(response) && response.length > 0) instance = response[0];
        else if (response?.data) instance = Array.isArray(response.data) ? response.data[0] : response.data;
        
        if (instance?.value) {
          let parsed = instance.value;
          if (typeof instance.value === 'string') {
            try {
              parsed = JSON.parse(instance.value);
            } catch (e) {
              parsed = { apiKey: instance.value };
            }
          }
          
          const key = parsed?.apiKey || '';
          if (key) {
            this.openaiApiKey = key;
            console.log('[ModelService] OpenAI API key loaded from backend settings');
            
            // Also save to localStorage as backup
            try {
              localStorage.setItem(OPENAI_KEY_STORAGE_KEY, key);
            } catch (e) { /* ignore */ }
            
            return key;
          }
        }
      } catch (error) {
        console.warn('[ModelService] Could not load from backend settings:', error);
      }
    }
    
    // Fallback to localStorage
    try {
      const key = localStorage.getItem(OPENAI_KEY_STORAGE_KEY);
      if (key) {
        this.openaiApiKey = key;
        console.log('[ModelService] OpenAI API key loaded from localStorage (fallback)');
        return key;
      }
    } catch (error) {
      console.warn('[ModelService] Could not load from localStorage:', error);
    }
    
    return null;
  }

  /**
   * Clear OpenAI API key from all storage
   */
  async clearOpenAIApiKey(): Promise<void> {
    this.openaiApiKey = null;
    
    // Try to clear from backend
    if (this.services?.api?.get) {
      try {
        const response = await this.services.api.get('/api/v1/settings/instances', {
          params: {
            definition_id: OPENAI_SETTINGS.DEFINITION_ID,
            user_id: 'current',
            scope: 'user'
          }
        });
        
        let instance: any = null;
        if (Array.isArray(response) && response.length > 0) instance = response[0];
        else if (response?.data) instance = Array.isArray(response.data) ? response.data[0] : response.data;
        
        if (instance?.id && this.services.api.post) {
          // Save with empty key
          await this.services.api.post('/api/v1/settings/instances', {
            id: instance.id,
            definition_id: OPENAI_SETTINGS.DEFINITION_ID,
            name: 'Evaluator OpenAI API Settings',
            value: { ...OPENAI_SETTINGS.DEFAULT_VALUE, apiKey: '', enabled: false },
            scope: 'user',
            user_id: 'current'
          });
          console.log('[ModelService] OpenAI API key cleared from backend settings');
        }
      } catch (error) {
        console.warn('[ModelService] Could not clear from backend settings:', error);
      }
    }
    
    // Clear from localStorage
    try {
      localStorage.removeItem(OPENAI_KEY_STORAGE_KEY);
    } catch (error) {
      console.warn('[ModelService] Could not clear localStorage:', error);
    }
  }

  async validateOpenAIApiKey(key: string): Promise<{ valid: boolean; error?: string }> {
    try {
      const response = await fetch(OPENAI_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${key}`,
        },
        body: JSON.stringify({
          model: 'gpt-3.5-turbo',
          messages: [{ role: 'user', content: 'Hi' }],
          max_tokens: 5,
        }),
      });

      if (response.ok) {
        return { valid: true };
      }

      const error = await response.json();
      return { 
        valid: false, 
        error: error?.error?.message || `HTTP ${response.status}` 
      };
    } catch (error) {
      return { 
        valid: false, 
        error: error instanceof Error ? error.message : 'Network error' 
      };
    }
  }

  // ===========================================================================
  // OPENAI MODELS (for Judge and Synthetic User)
  // ===========================================================================

  getOpenAIModels(): ModelInfo[] {
    return OPENAI_MODELS;
  }

  getOpenAIModelById(modelId: string): ModelInfo | null {
    return OPENAI_MODELS.find(m => m.id === modelId) || null;
  }

  // ===========================================================================
  // TRY TO READ OPENROUTER CACHE (from OpenRouter plugin's localStorage)
  // ===========================================================================

  private getOpenRouterCache(): ModelInfo[] | null {
    try {
      const serialized = localStorage.getItem(OPENROUTER_CACHE_KEY);
      if (!serialized) {
        console.log('[ModelService] No OpenRouter cache found');
        return null;
      }

      const payload = JSON.parse(serialized);
      if (!payload?.timestamp || !Array.isArray(payload.models)) {
        return null;
      }

      // Check if cache is still valid (5 minutes TTL like OpenRouter plugin)
      const FIVE_MINUTES = 5 * 60 * 1000;
      if (Date.now() - payload.timestamp > FIVE_MINUTES) {
        console.log('[ModelService] OpenRouter cache expired');
        return null;
      }

      console.log(`[ModelService] Found ${payload.models.length} models in OpenRouter cache`);
      return payload.models.map((m: any) => ({
        id: m.id || '',
        name: m.name || m.id || '',
        provider: 'openrouter',
        providerId: PROVIDER_SETTINGS_ID_MAP['openrouter'],
        serverId: m.server_id || m.serverId || 'openrouter_default_server',
      }));
    } catch (error) {
      console.warn('[ModelService] Could not read OpenRouter cache:', error);
      return null;
    }
  }

  // ===========================================================================
  // CANDIDATE MODELS (OpenRouter + Ollama via BrainDrive)
  // Following the exact pattern from BrainDriveOpenRouter plugin
  // ===========================================================================

  /**
   * Fetch all candidate models using the SAME approach as BrainDriveChat
   * Uses /api/v1/ai/providers/all-models endpoint
   */
  async fetchCandidateModels(forceRefresh = false): Promise<ModelInfo[]> {
    // Check local cache first
    if (!forceRefresh && localCache && Date.now() - localCache.timestamp < CACHE_TTL) {
      console.log(`[ModelService] Using local cache (${localCache.models.length} models)`);
      return localCache.models;
    }

    if (!this.services?.api?.get) {
      console.error('[ModelService] API service unavailable');
      return [];
    }

    try {
      // Use SAME endpoint as BrainDriveChat: /api/v1/ai/providers/all-models
      console.log('[ModelService] Fetching ALL models from /api/v1/ai/providers/all-models...');

      const resp = await this.services.api.get('/api/v1/ai/providers/all-models');
      
      // Extract models array in a tolerant way (same as BrainDriveChat)
      const raw = (resp && (resp as any).models)
        || (resp && (resp as any).data && (resp as any).data.models)
        || (Array.isArray(resp) ? resp : []);

      console.log(`[ModelService] Raw models count: ${Array.isArray(raw) ? raw.length : 0}`);
      
      if (raw.length > 0) {
        console.log('[ModelService] First model sample:', JSON.stringify(raw[0]).substring(0, 300));
      }

      // Normalize models EXACTLY like BrainDriveChat does
      const models: ModelInfo[] = Array.isArray(raw)
        ? raw.map((m: any) => {
            const provider = m.provider || 'ollama';
            const providerId = PROVIDER_SETTINGS_ID_MAP[provider] || provider;
            const serverId = m.server_id || m.serverId || 'unknown';
            const serverName = m.server_name || m.serverName || 'Unknown Server';
            const name = m.name || m.id || '';
            const id = m.id || m.name || '';
            
            return {
              id,
              name,
              provider,
              providerId,
              serverName,
              serverId,
            } as ModelInfo;
          })
        : [];

      console.log(`[ModelService] Normalized ${models.length} models`);
      
      // Log a few sample models for debugging
      if (models.length > 0) {
        console.log('[ModelService] Sample model:', JSON.stringify(models[0]));
      }

      if (models.length > 0) {
        localCache = { models, timestamp: Date.now() };
      }

      return models;

    } catch (error) {
      console.error('[ModelService] Error fetching models:', error);
      
      // Fallback: Try to load from OpenRouter cache
      const openRouterCache = this.getOpenRouterCache();
      if (openRouterCache && openRouterCache.length > 0) {
        console.log(`[ModelService] Using OpenRouter cache fallback (${openRouterCache.length} models)`);
        return openRouterCache;
      }
      
      return [];
    }
  }

  // ===========================================================================
  // AI CALLS
  // ===========================================================================

  /**
   * Send chat request to OpenAI directly (for synthetic user and judge)
   */
  async sendOpenAIRequest(
    model: ModelInfo,
    messages: { role: string; content: string }[],
    options: {
      temperature?: number;
      maxTokens?: number;
    } = {}
  ): Promise<string> {
    if (!this.openaiApiKey) {
      console.error('[ModelService] OpenAI API key is not set!');
      throw new Error('OpenAI API key not configured. Please add your API key in the settings.');
    }

    const { temperature = 0, maxTokens = 4096 } = options;
    const modelId = model.id;

    console.log(`[ModelService] Calling OpenAI API: ${modelId}`);
    console.log(`[ModelService] Messages count: ${messages.length}, Temperature: ${temperature}`);

    try {
      const requestBody = {
        model: modelId,
        messages,
        temperature,
        max_tokens: maxTokens,
      };

      const response = await fetch(OPENAI_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.openaiApiKey}`,
        },
        body: JSON.stringify(requestBody),
      });

      console.log(`[ModelService] OpenAI response status: ${response.status}`);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = errorData?.error?.message || `HTTP ${response.status}`;
        console.error(`[ModelService] OpenAI API error:`, errorMessage);
        throw new Error(`OpenAI API error: ${errorMessage}`);
      }

      const data = await response.json();
      const text = data?.choices?.[0]?.message?.content || '';
      
      // Track token usage per phase
      const usage = data?.usage;
      if (usage) {
        const inputTokens = usage.prompt_tokens || 0;
        const outputTokens = usage.completion_tokens || 0;
        
        this.lastTokenUsage = { input: inputTokens, output: outputTokens };
        this.totalTokenUsage.syntheticInput += inputTokens;
        this.totalTokenUsage.syntheticOutput += outputTokens;
        
        // Track by phase
        if (this.currentPhase === 'judge') {
          this.phaseTokenUsage.judge.input += inputTokens;
          this.phaseTokenUsage.judge.output += outputTokens;
          this.totalTokenUsage.judgeInput += inputTokens;
          this.totalTokenUsage.judgeOutput += outputTokens;
        } else {
          this.phaseTokenUsage[this.currentPhase].syntheticInput += inputTokens;
          this.phaseTokenUsage[this.currentPhase].syntheticOutput += outputTokens;
        }
        
        console.log(`[ModelService] OpenAI tokens (${this.currentPhase}): input=${inputTokens}, output=${outputTokens}`);
      }
      
      if (!text || text.trim() === '') {
        console.error('[ModelService] OpenAI returned empty response');
        console.error('[ModelService] Full response:', JSON.stringify(data).substring(0, 500));
        throw new Error('OpenAI returned empty response');
      }
      
      console.log(`[ModelService] OpenAI response received (${text.length} chars): ${text.substring(0, 80)}...`);
      return text;

    } catch (error) {
      console.error('[ModelService] OpenAI API call failed:', error);
      if (error instanceof Error) {
        throw new Error(`OpenAI call failed: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Send chat request to candidate model via BrainDrive (for model being evaluated)
   * Uses EXACT same format as BrainDriveChat plugin
   */
  async sendCandidateModelRequest(
    model: ModelInfo,
    messages: { role: string; content: string }[],
    options: {
      temperature?: number;
      maxTokens?: number;
    } = {}
  ): Promise<string> {
    if (!this.services?.api?.post) {
      throw new Error('API service not available');
    }

    // Ensure we have the user ID before making the request
    await this.ensureUserIdInitialized();

    const { temperature = 0, maxTokens = 4096 } = options;

    // Match EXACTLY how BrainDriveChat does it:
    // - Use model.providerId and model.serverId directly
    // - Use model.name for the model field (not model.id)
    // - Use actual user_id (not 'current') - this is critical for finding API keys!
    const requestParams = {
      provider: model.provider || 'ollama',
      settings_id: model.providerId || 'ollama_servers_settings',
      server_id: model.serverId,
      model: model.name, // BrainDriveChat uses model.name, not model.id
      messages: messages.map(msg => ({
        role: msg.role || 'user',
        content: msg.content
      })),
      params: {
        temperature: temperature,
        max_tokens: maxTokens
      },
      stream: false,
      user_id: this.currentUserId || 'current', // Use actual user ID like BrainDriveChat
      conversation_type: 'evaluator',
    };
    
    console.log(`[ModelService] ═══════════════════════════════════════════════════`);
    console.log(`[ModelService] Calling candidate model via BrainDrive`);
    console.log(`[ModelService] Model object:`, JSON.stringify(model));
    console.log(`[ModelService] Request will use:`);
    console.log(`[ModelService]   provider: ${requestParams.provider}`);
    console.log(`[ModelService]   settings_id: ${requestParams.settings_id}`);
    console.log(`[ModelService]   server_id: ${requestParams.server_id}`);
    console.log(`[ModelService]   model: ${requestParams.model}`);
    console.log(`[ModelService]   user_id: ${requestParams.user_id}`);
    console.log(`[ModelService]   messages: ${messages.length} messages`);
    console.log(`[ModelService] ═══════════════════════════════════════════════════`);

    try {
      console.log(`[ModelService] Making POST to /api/v1/ai/providers/chat`);
      console.log(`[ModelService] Full request params:`, JSON.stringify(requestParams, null, 2));
      
      const response = await this.services.api.post(
        '/api/v1/ai/providers/chat',
        requestParams,
        { timeout: 120000 }
      );
      
      console.log(`[ModelService] Raw response type:`, typeof response);
      console.log(`[ModelService] Raw response (first 1000 chars):`, JSON.stringify(response).substring(0, 1000));
      
      // Check for error in response
      if (response?.error) {
        const errorMsg = response.error?.message || response.error || 'Unknown API error';
        console.error(`[ModelService] API returned error:`, errorMsg);
        throw new Error(`Candidate model API error: ${errorMsg}`);
      }
      
      // The response from services.api.post is already response.data (axios extracts it)
      // So we pass response directly, not response.data
      const text = this.extractTextFromResponse(response);
      
      // Track token usage if available in response
      const usage = response?.usage || response?.data?.usage;
      if (usage) {
        const inputTokens = usage.prompt_tokens || usage.input_tokens || 0;
        const outputTokens = usage.completion_tokens || usage.output_tokens || 0;
        
        this.lastTokenUsage = { input: inputTokens, output: outputTokens };
        this.totalTokenUsage.candidateInput += inputTokens;
        this.totalTokenUsage.candidateOutput += outputTokens;
        
        // Track by phase
        if (this.currentPhase !== 'judge') {
          this.phaseTokenUsage[this.currentPhase].candidateInput += inputTokens;
          this.phaseTokenUsage[this.currentPhase].candidateOutput += outputTokens;
        }
        
        console.log(`[ModelService] Candidate tokens (${this.currentPhase}): input=${inputTokens}, output=${outputTokens}`);
      } else {
        // Estimate tokens if not provided (rough: 4 chars = 1 token)
        const estimatedInput = Math.ceil(messages.reduce((sum, m) => sum + m.content.length, 0) / 4);
        const estimatedOutput = Math.ceil(text.length / 4);
        
        this.totalTokenUsage.candidateInput += estimatedInput;
        this.totalTokenUsage.candidateOutput += estimatedOutput;
        
        if (this.currentPhase !== 'judge') {
          this.phaseTokenUsage[this.currentPhase].candidateInput += estimatedInput;
          this.phaseTokenUsage[this.currentPhase].candidateOutput += estimatedOutput;
        }
        
        console.log(`[ModelService] Candidate tokens estimated (${this.currentPhase}): ~${estimatedInput} in, ~${estimatedOutput} out`);
      }
      
      if (!text || text.trim() === '') {
        console.error('[ModelService] ❌ Empty response from candidate model');
        console.error('[ModelService] Response type:', typeof response);
        console.error('[ModelService] Response keys:', response ? Object.keys(response) : 'null');
        console.error('[ModelService] Full response:', JSON.stringify(response).substring(0, 1000));
        
        // Try to provide more helpful error message
        const possibleIssue = response?.error || response?.message || response?.detail;
        if (possibleIssue) {
          throw new Error(`Candidate model (${model.name}) error: ${possibleIssue}`);
        }
        
        throw new Error(`Candidate model (${model.name}) returned empty response. Check if the OpenRouter API key is configured in BrainDrive Settings.`);
      }
      
      console.log(`[ModelService] ✅ Candidate model response (${text.length} chars): ${text.substring(0, 100)}...`);
      return text;
    } catch (error: any) {
      console.error('[ModelService] Candidate model API call failed');
      console.error('[ModelService] Error type:', error?.name);
      console.error('[ModelService] Error message:', error?.message);
      
      // Try to get more details from axios error
      if (error?.response) {
        console.error('[ModelService] Response status:', error.response.status);
        console.error('[ModelService] Response data:', JSON.stringify(error.response.data));
        console.error('[ModelService] Response headers:', JSON.stringify(error.response.headers));
        
        // Extract the actual error message from the backend response
        const backendError = error.response.data?.detail || error.response.data?.message || error.response.data?.error || JSON.stringify(error.response.data);
        throw new Error(`API error (${error.response.status}): ${backendError}`);
      }
      
      if (error?.request) {
        console.error('[ModelService] Request was made but no response received');
        throw new Error(`No response from server for ${model.name}`);
      }
      
      // Re-throw with more context
      if (error instanceof Error) {
        throw new Error(`Failed to call ${model.name}: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Extract text from various response formats
   * Handles all possible response structures from different providers
   */
  private extractTextFromResponse(data: any): string {
    if (!data) {
      console.warn('[ModelService] extractTextFromResponse: data is null/undefined');
      return '';
    }
    
    if (typeof data === 'string') {
      console.log('[ModelService] extractTextFromResponse: data is string');
      return data;
    }
    
    // Log all keys for debugging
    console.log('[ModelService] extractTextFromResponse: data keys:', Object.keys(data));
    
    // Try all possible locations for the content
    // Priority order: text > content > response > message > choices
    
    // Direct text field (Ollama, OpenAI generate)
    if (data.text && typeof data.text === 'string' && data.text.trim()) {
      console.log('[ModelService] extractTextFromResponse: found text field');
      return data.text;
    }
    
    // Direct content field (OpenRouter chat completion)
    if (data.content && typeof data.content === 'string' && data.content.trim()) {
      console.log('[ModelService] extractTextFromResponse: found content field');
      return data.content;
    }
    
    // Response field
    if (data.response && typeof data.response === 'string' && data.response.trim()) {
      console.log('[ModelService] extractTextFromResponse: found response field');
      return data.response;
    }
    
    // Message object with content
    if (data.message?.content && typeof data.message.content === 'string') {
      console.log('[ModelService] extractTextFromResponse: found message.content');
      return data.message.content;
    }
    
    // OpenAI/OpenRouter choices format
    if (data.choices && Array.isArray(data.choices) && data.choices.length > 0) {
      const choice = data.choices[0];
      
      // Standard chat completion: choices[0].message.content
      if (choice.message?.content && typeof choice.message.content === 'string') {
        console.log('[ModelService] extractTextFromResponse: found choices[0].message.content');
        return choice.message.content;
      }
      
      // Streaming delta: choices[0].delta.content  
      if (choice.delta?.content && typeof choice.delta.content === 'string') {
        console.log('[ModelService] extractTextFromResponse: found choices[0].delta.content');
        return choice.delta.content;
      }
      
      // Text completion: choices[0].text
      if (choice.text && typeof choice.text === 'string') {
        console.log('[ModelService] extractTextFromResponse: found choices[0].text');
        return choice.text;
      }
    }
    
    // Last resort: stringify and check if there's any useful content
    console.warn('[ModelService] extractTextFromResponse: could not find text in any known field');
    console.warn('[ModelService] extractTextFromResponse: full data:', JSON.stringify(data).substring(0, 500));
    
    return '';
  }

  /**
   * Clear model cache
   */
  clearCache(): void {
    localCache = null;
  }
}

export default ModelService;
