/**
 * Unit tests for Content Platform Prompts Service.
 *
 * Tests platform configurations, prompt building, and content validation
 * for Twitter/X, LinkedIn, and Blog platforms.
 *
 * Requirements: 6.2
 */

import { describe, it, expect } from 'vitest';
import { Platform } from '../generated/prisma/enums.js';
import {
  PLATFORM_CONFIGS,
  TWITTER_CONFIG,
  LINKEDIN_CONFIG,
  BLOG_CONFIG,
  buildPrompt,
  validatePlatformContent,
  type TaskSummary,
} from '../services/content-prompts.js';

describe('Content Platform Prompts', () => {
  describe('Platform Configurations', () => {
    it('defines all 3 platform configs (TWITTER, LINKEDIN, BLOG)', () => {
      expect(PLATFORM_CONFIGS[Platform.TWITTER]).toBeDefined();
      expect(PLATFORM_CONFIGS[Platform.LINKEDIN]).toBeDefined();
      expect(PLATFORM_CONFIGS[Platform.BLOG]).toBeDefined();
      expect(Object.keys(PLATFORM_CONFIGS)).toHaveLength(3);
    });

    it('TWITTER config has maxLength 280 and casual tone', () => {
      expect(TWITTER_CONFIG.platform).toBe(Platform.TWITTER);
      expect(TWITTER_CONFIG.maxLength).toBe(280);
      expect(TWITTER_CONFIG.tone).toContain('casual');
      expect(TWITTER_CONFIG.constraints).toContain('≤280 characters total');
      expect(TWITTER_CONFIG.constraints).toContain('Use 1-2 relevant hashtags max');
      expect(TWITTER_CONFIG.constraints).toContain('Lead with accomplishment');
      expect(TWITTER_CONFIG.constraints).toContain('No links in the generated text');
    });

    it('LINKEDIN config has maxLength 3000 and professional tone', () => {
      expect(LINKEDIN_CONFIG.platform).toBe(Platform.LINKEDIN);
      expect(LINKEDIN_CONFIG.maxLength).toBe(3000);
      expect(LINKEDIN_CONFIG.tone).toContain('professional');
      expect(LINKEDIN_CONFIG.constraints).toContain('1-3 paragraphs');
      expect(LINKEDIN_CONFIG.constraints).toContain('Open with a hook');
      expect(LINKEDIN_CONFIG.constraints).toContain('Include lessons learned or insight');
      expect(LINKEDIN_CONFIG.constraints).toContain('End with a question or call to action');
    });

    it('BLOG config has null maxLength and technical tone', () => {
      expect(BLOG_CONFIG.platform).toBe(Platform.BLOG);
      expect(BLOG_CONFIG.maxLength).toBeNull();
      expect(BLOG_CONFIG.tone).toContain('technical');
      expect(BLOG_CONFIG.constraints).toContain('Include a title');
      expect(BLOG_CONFIG.constraints).toContain('Use markdown formatting');
      expect(BLOG_CONFIG.constraints).toContain('Include code snippets if relevant');
      expect(BLOG_CONFIG.constraints).toContain('Structure with intro, body, conclusion');
    });

    it('each config has a non-empty systemPrompt', () => {
      for (const config of Object.values(PLATFORM_CONFIGS)) {
        expect(config.systemPrompt).toBeTruthy();
        expect(config.systemPrompt.length).toBeGreaterThan(0);
      }
    });

    it('each config has a non-empty constraints array', () => {
      for (const config of Object.values(PLATFORM_CONFIGS)) {
        expect(config.constraints.length).toBeGreaterThan(0);
      }
    });
  });

  describe('buildPrompt', () => {
    const sampleTasks: TaskSummary[] = [
      { title: 'Implement user auth', completedAt: new Date('2024-01-15') },
      { title: 'Add dashboard API', completedAt: new Date('2024-01-16'), evidence: 'PR #42' },
    ];

    it('includes correct tone for Twitter', () => {
      const result = buildPrompt(Platform.TWITTER, sampleTasks);
      expect(result.system).toContain('casual, conversational');
    });

    it('includes correct tone for LinkedIn', () => {
      const result = buildPrompt(Platform.LINKEDIN, sampleTasks);
      expect(result.system).toContain('professional, thoughtful');
    });

    it('includes correct tone for Blog', () => {
      const result = buildPrompt(Platform.BLOG, sampleTasks);
      expect(result.system).toContain('technical, informative');
    });

    it('includes constraints in system prompt for Twitter', () => {
      const result = buildPrompt(Platform.TWITTER, sampleTasks);
      expect(result.system).toContain('≤280 characters total');
      expect(result.system).toContain('Use 1-2 relevant hashtags max');
      expect(result.system).toContain('Lead with accomplishment');
      expect(result.system).toContain('No links in the generated text');
    });

    it('includes constraints in system prompt for LinkedIn', () => {
      const result = buildPrompt(Platform.LINKEDIN, sampleTasks);
      expect(result.system).toContain('1-3 paragraphs');
      expect(result.system).toContain('Open with a hook');
      expect(result.system).toContain('Include lessons learned or insight');
      expect(result.system).toContain('End with a question or call to action');
    });

    it('includes constraints in system prompt for Blog', () => {
      const result = buildPrompt(Platform.BLOG, sampleTasks);
      expect(result.system).toContain('Include a title');
      expect(result.system).toContain('Use markdown formatting');
      expect(result.system).toContain('Include code snippets if relevant');
      expect(result.system).toContain('Structure with intro, body, conclusion');
    });

    it('includes max length in system prompt for platforms with limits', () => {
      const twitterResult = buildPrompt(Platform.TWITTER, sampleTasks);
      expect(twitterResult.system).toContain('Maximum length: 280 characters');

      const linkedinResult = buildPrompt(Platform.LINKEDIN, sampleTasks);
      expect(linkedinResult.system).toContain('Maximum length: 3000 characters');
    });

    it('does not include max length for Blog (no limit)', () => {
      const result = buildPrompt(Platform.BLOG, sampleTasks);
      expect(result.system).not.toContain('Maximum length');
    });

    it('includes task titles in user prompt', () => {
      const result = buildPrompt(Platform.TWITTER, sampleTasks);
      expect(result.user).toContain('Implement user auth');
      expect(result.user).toContain('Add dashboard API');
    });

    it('includes task completion dates in user prompt', () => {
      const result = buildPrompt(Platform.TWITTER, sampleTasks);
      expect(result.user).toContain('2024-01-15');
      expect(result.user).toContain('2024-01-16');
    });

    it('includes evidence when provided', () => {
      const result = buildPrompt(Platform.TWITTER, sampleTasks);
      expect(result.user).toContain('PR #42');
    });

    it('handles empty tasks array gracefully', () => {
      const result = buildPrompt(Platform.TWITTER, []);
      expect(result.system).toBeTruthy();
      expect(result.user).toContain('No tasks provided');
    });

    it('returns both system and user prompts as strings', () => {
      const result = buildPrompt(Platform.TWITTER, sampleTasks);
      expect(typeof result.system).toBe('string');
      expect(typeof result.user).toBe('string');
    });
  });

  describe('validatePlatformContent', () => {
    it('catches Twitter content over 280 characters', () => {
      const longContent = 'a'.repeat(281);
      const result = validatePlatformContent(Platform.TWITTER, longContent);
      expect(result.valid).toBe(false);
      expect(result.issues.length).toBeGreaterThan(0);
      expect(result.issues[0]).toContain('exceeds maximum length');
      expect(result.issues[0]).toContain('281/280');
    });

    it('passes valid Twitter content within 280 characters', () => {
      const validContent = 'Just shipped user authentication! 🚀 #buildinpublic';
      const result = validatePlatformContent(Platform.TWITTER, validContent);
      expect(result.valid).toBe(true);
      expect(result.issues).toHaveLength(0);
    });

    it('passes Twitter content at exactly 280 characters', () => {
      const exactContent = 'a'.repeat(280);
      const result = validatePlatformContent(Platform.TWITTER, exactContent);
      expect(result.valid).toBe(true);
      expect(result.issues).toHaveLength(0);
    });

    it('catches LinkedIn content over 3000 characters', () => {
      const longContent = 'a'.repeat(3001);
      const result = validatePlatformContent(Platform.LINKEDIN, longContent);
      expect(result.valid).toBe(false);
      expect(result.issues[0]).toContain('3001/3000');
    });

    it('passes valid LinkedIn content', () => {
      const validContent =
        'This week I shipped authentication for my SaaS.\n\nThe biggest lesson was keeping things simple.\n\nWhat features are you shipping this week?';
      const result = validatePlatformContent(Platform.LINKEDIN, validContent);
      expect(result.valid).toBe(true);
      expect(result.issues).toHaveLength(0);
    });

    it('passes valid Blog content with title', () => {
      const validContent =
        '# How I Built Auth in a Weekend\n\nLast week I decided to tackle authentication...';
      const result = validatePlatformContent(Platform.BLOG, validContent);
      expect(result.valid).toBe(true);
      expect(result.issues).toHaveLength(0);
    });

    it('Blog content has no max length limit', () => {
      const longContent = '# My Blog Post\n\n' + 'a'.repeat(10000);
      const result = validatePlatformContent(Platform.BLOG, longContent);
      expect(result.valid).toBe(true);
      expect(result.issues).toHaveLength(0);
    });

    it('rejects empty content for any platform', () => {
      const platforms = [Platform.TWITTER, Platform.LINKEDIN, Platform.BLOG];
      for (const platform of platforms) {
        const result = validatePlatformContent(platform, '');
        expect(result.valid).toBe(false);
        expect(result.issues).toContain('Content is empty');
      }
    });

    it('rejects whitespace-only content', () => {
      const result = validatePlatformContent(Platform.TWITTER, '   \n  \t  ');
      expect(result.valid).toBe(false);
      expect(result.issues).toContain('Content is empty');
    });

    it('returns issues array describing the problems', () => {
      const longContent = 'a'.repeat(300);
      const result = validatePlatformContent(Platform.TWITTER, longContent);
      expect(Array.isArray(result.issues)).toBe(true);
      expect(result.issues.length).toBeGreaterThan(0);
      expect(typeof result.issues[0]).toBe('string');
    });
  });
});
