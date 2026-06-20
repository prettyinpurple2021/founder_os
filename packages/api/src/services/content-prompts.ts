/**
 * Content Platform Prompts Service
 *
 * Defines platform-specific prompt configurations and constraints for
 * build-in-public content generation. Handles prompt building and
 * content validation for Twitter/X, LinkedIn, and Blog platforms.
 *
 * Requirements: 6.2
 */

import { Platform } from '../generated/prisma/enums.js';

// --- Types ---

/** Summary of a completed task used as input for content generation. */
export interface TaskSummary {
  title: string;
  completedAt: Date;
  evidence?: string; // Optional URL or description of evidence
}

/** Platform-specific configuration for content generation. */
export interface PlatformConfig {
  platform: Platform;
  maxLength: number | null; // null = no limit
  tone: string;
  systemPrompt: string;
  constraints: string[];
}

/** The result of building prompts for LLM content generation. */
export interface BuiltPrompt {
  system: string;
  user: string;
}

/** The result of validating generated content against platform constraints. */
export interface ValidationResult {
  valid: boolean;
  issues: string[];
}

// --- Platform Configurations ---

/**
 * Twitter/X platform config.
 * Casual tone, ≤280 characters, hashtags, lead with accomplishment.
 */
export const TWITTER_CONFIG: PlatformConfig = {
  platform: Platform.TWITTER,
  maxLength: 280,
  tone: 'casual, conversational',
  systemPrompt:
    'You are a build-in-public content writer for Twitter/X. Write short, punchy tweets that celebrate shipping progress and engage the developer community.',
  constraints: [
    '≤280 characters total',
    'Use 1-2 relevant hashtags max',
    'Lead with accomplishment',
    'No links in the generated text',
  ],
};

/**
 * LinkedIn platform config.
 * Professional tone, 1-3 paragraphs, hooks and CTAs.
 */
export const LINKEDIN_CONFIG: PlatformConfig = {
  platform: Platform.LINKEDIN,
  maxLength: 3000,
  tone: 'professional, thoughtful',
  systemPrompt:
    'You are a build-in-public content writer for LinkedIn. Write professional posts that share lessons learned, insights from building, and engage a professional audience.',
  constraints: [
    '1-3 paragraphs',
    'Open with a hook',
    'Include lessons learned or insight',
    'End with a question or call to action',
  ],
};

/**
 * Blog platform config.
 * Technical tone, longer form, markdown formatting.
 */
export const BLOG_CONFIG: PlatformConfig = {
  platform: Platform.BLOG,
  maxLength: null,
  tone: 'technical, informative',
  systemPrompt:
    'You are a build-in-public content writer for a technical blog. Write detailed posts that explain what was built, how it works, and what was learned along the way.',
  constraints: [
    'Include a title',
    'Use markdown formatting',
    'Include code snippets if relevant',
    'Structure with intro, body, conclusion',
  ],
};

/**
 * Map of all platform configurations indexed by Platform enum value.
 */
export const PLATFORM_CONFIGS: Record<Platform, PlatformConfig> = {
  [Platform.TWITTER]: TWITTER_CONFIG,
  [Platform.LINKEDIN]: LINKEDIN_CONFIG,
  [Platform.BLOG]: BLOG_CONFIG,
};

// --- Functions ---

/**
 * Builds system and user prompts for LLM content generation based on platform
 * and completed task summaries.
 *
 * The system prompt includes the platform's base system prompt, tone guidance,
 * and formatting constraints. The user prompt summarizes the completed tasks
 * as input for content generation.
 *
 * @param platform - The target platform (TWITTER, LINKEDIN, or BLOG)
 * @param tasks - Array of completed task summaries to generate content from
 * @returns An object with system and user prompts ready for LLM consumption
 */
export function buildPrompt(platform: Platform, tasks: TaskSummary[]): BuiltPrompt {
  const config = PLATFORM_CONFIGS[platform];

  // Build system prompt with tone and constraints
  const constraintsList = config.constraints.map((c) => `- ${c}`).join('\n');
  const system = [
    config.systemPrompt,
    '',
    `Tone: ${config.tone}`,
    '',
    'Constraints:',
    constraintsList,
    ...(config.maxLength !== null ? ['', `Maximum length: ${config.maxLength} characters`] : []),
  ].join('\n');

  // Build user prompt from task summaries
  const taskDescriptions = tasks
    .map((task) => {
      const date = task.completedAt.toISOString().split('T')[0];
      const evidencePart = task.evidence ? ` (${task.evidence})` : '';
      return `- ${task.title} [completed ${date}]${evidencePart}`;
    })
    .join('\n');

  const user = [
    'Generate a build-in-public post based on the following recently completed work:',
    '',
    taskDescriptions || '(No tasks provided)',
    '',
    'Write a post celebrating this progress and sharing what was accomplished.',
  ].join('\n');

  return { system, user };
}

/**
 * Validates generated content against platform-specific constraints.
 *
 * Checks:
 * - Character length for platforms with maxLength (Twitter, LinkedIn)
 * - Platform-specific structural requirements
 *
 * @param platform - The target platform to validate against
 * @param content - The generated content to validate
 * @returns Validation result with a boolean and array of issues found
 */
export function validatePlatformContent(platform: Platform, content: string): ValidationResult {
  const config = PLATFORM_CONFIGS[platform];
  const issues: string[] = [];

  // Check empty content
  if (!content || content.trim().length === 0) {
    issues.push('Content is empty');
    return { valid: false, issues };
  }

  // Check max length constraint
  if (config.maxLength !== null && content.length > config.maxLength) {
    issues.push(`Content exceeds maximum length: ${content.length}/${config.maxLength} characters`);
  }

  // Platform-specific structural checks
  switch (platform) {
    case Platform.TWITTER:
      // No additional structural checks beyond length
      break;

    case Platform.LINKEDIN:
      // Check for paragraph structure (at least some line breaks indicating paragraphs)
      if (!content.includes('\n') && content.length > 200) {
        issues.push('Content should be structured in 1-3 paragraphs');
      }
      break;

    case Platform.BLOG:
      // Check for title (first line should be a heading or title)
      if (!content.startsWith('#') && !content.includes('\n')) {
        issues.push('Blog post should include a title');
      }
      break;
  }

  return { valid: issues.length === 0, issues };
}
