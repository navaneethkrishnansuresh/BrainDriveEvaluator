import { ApiService } from '../types';

const OPENROUTER_SETTINGS_DEFINITION_ID = 'openrouter_api_keys_settings';

interface ApiKeyResult {
  success: boolean;
  apiKey?: string;
  error?: string;
}

export class OpenRouterKeyService {
  constructor(private readonly apiService: ApiService | undefined) {}

  async fetchApiKey(): Promise<ApiKeyResult> {
    if (!this.apiService) {
      return { success: false, error: 'API service not available' };
    }

    try {
      // Query settings instances for OpenRouter API key
      const response = await this.apiService.get('/api/v1/settings/instances', {
        params: {
          definition_id: OPENROUTER_SETTINGS_DEFINITION_ID,
          scope: 'user',
          user_id: 'current',
        },
      });

      let apiKey = '';
      if (Array.isArray(response) && response.length > 0) {
        const instance = response[0];
        if (instance?.value) {
          let parsedValue = instance.value;
          if (typeof parsedValue === 'string') {
            try {
              parsedValue = JSON.parse(parsedValue);
            } catch {
              // Not JSON, use as-is
            }
          }
          apiKey = parsedValue?.apiKey || parsedValue || '';
        }
      }

      if (!apiKey || apiKey.trim() === '') {
        return {
          success: false,
          error: 'OpenRouter API key not configured. Go to "OpenRouter API Keys" page in Plugin Manager.',
        };
      }

      if (!apiKey.startsWith('sk-or-')) {
        return {
          success: false,
          error: 'Invalid OpenRouter API key format. Key must start with "sk-or-".',
        };
      }

      return { success: true, apiKey };
    } catch (error: any) {
      return {
        success: false,
        error: error?.message || 'Failed to fetch OpenRouter API key from settings.',
      };
    }
  }
}



