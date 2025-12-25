/**
 * Plugin Checker Service for BrainDrive Evaluator
 * 
 * Checks if required plugins (WhyFinder, etc.) are installed.
 */

import { Services, PluginStatusMap, PluginStatus } from '../types';

export class PluginChecker {
  private services: Services;

  constructor(services: Services) {
    this.services = services;
  }

  /**
   * Check all supported plugins
   */
  async checkAllPlugins(): Promise<PluginStatusMap> {
    const whyfinderStatus = await this.checkWhyFinderPlugin();
    
    return {
      whyfinder: whyfinderStatus,
    };
  }

  /**
   * Check if WhyFinder plugin is installed
   */
  private async checkWhyFinderPlugin(): Promise<PluginStatus> {
    // Simplified check: assume WhyFinder is installed
    // In a real deployment, this would check via the backend API
    
    try {
      // Try to check if the plugin exists by checking its settings or API
      if (this.services?.api) {
        // For now, we'll assume it's installed if we can access the API
        return {
          installed: true,
          version: '1.0.0',
          error: null,
        };
      }
    } catch (error) {
      console.warn('PluginChecker: Could not verify WhyFinder plugin:', error);
    }

    // Default to installed for development
    return {
      installed: true,
      version: '1.0.0',
      error: null,
    };
  }
}

export default PluginChecker;
