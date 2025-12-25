import React from 'react';
import BrainDriveEvaluator from './BrainDriveEvaluator';

// Main entry point for BrainDrive Evaluator plugin
export default BrainDriveEvaluator;

// Version information
export const version = '1.0.0';

// Plugin metadata
export const metadata = {
  name: 'BrainDriveEvaluator',
  description: 'Evaluate AI models for WhyFinder coaching effectiveness',
  version: '1.0.0',
  author: 'BrainDrive',
};

// Development mode rendering
if (process.env.NODE_ENV === 'development' && typeof window !== 'undefined') {
  const rootElement = document.getElementById('root');
  if (rootElement) {
    import('react-dom/client').then(({ createRoot }) => {
      const root = createRoot(rootElement);

      // Mock services for development
      const mockServices = {
        api: {
          get: async (url: string, options?: any) => {
            console.log('Mock API GET:', url, options);
            // Mock settings
            if (url.includes('/settings/instances')) {
              return [{ value: { apiKey: '' } }];
            }
            // Mock models list
            if (url.includes('/providers/models') || url.includes('/all-models')) {
              return {
                models: [
                  { id: 'openai/gpt-4o', name: 'GPT-4o', provider: 'openrouter' },
                  { id: 'openai/gpt-4o-mini', name: 'GPT-4o Mini', provider: 'openrouter' },
                  { id: 'anthropic/claude-3-sonnet', name: 'Claude 3 Sonnet', provider: 'openrouter' },
                  { id: 'mistralai/mistral-large', name: 'Mistral Large', provider: 'openrouter' },
                ],
              };
            }
            return { data: {} };
          },
          post: async (url: string, data: any) => {
            console.log('Mock API POST:', url, data);
            // Mock chat response
            if (url.includes('/providers/chat')) {
              return {
                choices: [
                  {
                    message: {
                      content: "I understand you're exploring your purpose. Let me ask you - what activities make you lose track of time?",
                    },
                  },
                ],
              };
            }
            return { data: { success: true } };
          },
          put: async (url: string, data: any) => {
            console.log('Mock API PUT:', url, data);
            return { data: { success: true } };
          },
          delete: async (url: string) => {
            console.log('Mock API DELETE:', url);
            return { data: { success: true } };
          },
        },
        theme: {
          getCurrentTheme: () => localStorage.getItem('mock-theme') || 'dark',
          addThemeChangeListener: (callback: (theme: string) => void) => {
            const handler = (e: CustomEvent) => callback(e.detail);
            window.addEventListener('mock-theme-change', handler as EventListener);
          },
          removeThemeChangeListener: () => {},
        },
        settings: {
          getSetting: async () => null,
          setSetting: async () => {},
        },
        pluginState: {
          save: async () => {},
          load: async () => null,
        },
      };

      root.render(
        <React.StrictMode>
          <BrainDriveEvaluator services={mockServices as any} />
        </React.StrictMode>
      );
    });
  }
}
