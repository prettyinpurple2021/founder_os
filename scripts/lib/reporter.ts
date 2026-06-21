// Requirements: 8.3, 8.6, 9.1, 9.2
// Dual-output formatting: human-readable terminal output + JSON for CI

import type { BundleAnalysisResult } from './bundle-analyzer.js';
import type { ReadinessReport } from './checks.js';

export interface ReportOptions {
  format: 'human' | 'json';
}

export function formatBundleReport(
  result: BundleAnalysisResult,
  options: ReportOptions
): string {
  if (options.format === 'json') {
    return JSON.stringify(result, null, 2);
  }

  const lines: string[] = [];
  lines.push('');
  lines.push('╭─────────────────────────────────────────────╮');
  lines.push('│         Frontend Bundle Size Report          │');
  lines.push('╰─────────────────────────────────────────────╯');
  lines.push('');

  const statusIcon =
    result.status === 'pass' ? '✓' : result.status === 'warn' ? '⚠' : '✗';
  const statusLabel =
    result.status === 'pass'
      ? 'PASS'
      : result.status === 'warn'
        ? 'WARNING'
        : 'FAIL';

  lines.push(`  Status: ${statusIcon} ${statusLabel}`);
  lines.push(`  ${result.message}`);
  lines.push('');
  lines.push('  Chunks:');
  lines.push(
    '  ' +
      'Name'.padEnd(40) +
      'Type'.padEnd(10) +
      'Raw'.padEnd(12) +
      'Gzip'.padEnd(12) +
      'Initial'
  );
  lines.push('  ' + '─'.repeat(80));

  for (const chunk of result.chunks) {
    const initial = chunk.isInitial ? '●' : ' ';
    lines.push(
      '  ' +
        chunk.name.padEnd(40) +
        chunk.type.padEnd(10) +
        formatBytes(chunk.rawSize).padEnd(12) +
        formatBytes(chunk.gzipSize).padEnd(12) +
        initial
    );
  }

  lines.push('');
  lines.push('  ─'.repeat(40));
  lines.push(
    `  Total Initial (raw):  ${formatBytes(result.totalInitialRaw)}`
  );
  lines.push(
    `  Total Initial (gzip): ${formatBytes(result.totalInitialGzip)}`
  );
  lines.push(`  Threshold:            ${formatBytes(result.threshold)}`);
  lines.push(
    `  Warning at:           ${formatBytes(result.warningThreshold)}`
  );
  lines.push('');

  return lines.join('\n');
}

export function formatReadinessReport(
  report: ReadinessReport,
  options: ReportOptions
): string {
  if (options.format === 'json') {
    return JSON.stringify(report, null, 2);
  }

  const lines: string[] = [];
  lines.push('');
  lines.push('╭─────────────────────────────────────────────╮');
  lines.push('│        Deployment Readiness Report           │');
  lines.push('╰─────────────────────────────────────────────╯');
  lines.push('');
  lines.push(`  Stage:     ${report.stage}`);
  lines.push(`  Timestamp: ${report.timestamp}`);
  lines.push('');

  const recIcon = report.recommendation === 'go' ? '✓' : '✗';
  const recLabel = report.recommendation === 'go' ? 'GO' : 'NO-GO';
  lines.push(`  Recommendation: ${recIcon} ${recLabel}`);
  lines.push(
    `  Automated: ${report.automatedPassed}/${report.automatedTotal} passed, ${report.automatedFailed} failed`
  );
  lines.push('');

  lines.push('  Automated Checks:');
  for (const check of report.checks) {
    if (!check.automated) continue;
    const icon =
      check.status === 'pass' ? '✓' : check.status === 'fail' ? '✗' : '○';
    lines.push(`    ${icon} [${check.category}] ${check.name}`);
    if (check.status === 'fail') {
      if (check.expected) lines.push(`      Expected: ${check.expected}`);
      if (check.actual) lines.push(`      Actual:   ${check.actual}`);
      if (check.remediation) lines.push(`      Fix:      ${check.remediation}`);
    }
  }

  lines.push('');
  lines.push('  Manual Verification Items:');
  for (const item of report.manualItems) {
    lines.push(`    ○ ${item}`);
  }
  lines.push('');

  return lines.join('\n');
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
