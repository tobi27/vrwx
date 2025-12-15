/**
 * Report formatting utilities
 */

import type { TestResult, StepResult } from './runner.js';

export function printReport(results: TestResult[]): void {
  console.log('\n');
  console.log('='.repeat(60));
  console.log('                    CONFORMANCE REPORT');
  console.log('='.repeat(60));
  console.log('');

  let totalTests = 0;
  let passedTests = 0;
  let failedTests = 0;
  let totalDuration = 0;

  for (const result of results) {
    totalTests++;
    totalDuration += result.duration;

    if (result.passed) {
      passedTests++;
      console.log(`[PASS] ${result.service} (${result.duration}ms)`);
    } else {
      failedTests++;
      console.log(`[FAIL] ${result.service} (${result.duration}ms)`);

      // Print failed steps
      for (const step of result.steps) {
        if (!step.passed) {
          console.log(`       - ${step.name}: ${step.error || 'Failed'}`);
          if (step.expected !== undefined) {
            console.log(`         Expected: ${JSON.stringify(step.expected)}`);
            console.log(`         Actual:   ${JSON.stringify(step.actual)}`);
          }
        }
      }

      if (result.error) {
        console.log(`       Error: ${result.error}`);
      }
    }
  }

  console.log('');
  console.log('-'.repeat(60));
  console.log('');
  console.log(`Total:   ${totalTests} test(s)`);
  console.log(`Passed:  ${passedTests}`);
  console.log(`Failed:  ${failedTests}`);
  console.log(`Time:    ${totalDuration}ms`);
  console.log('');

  if (failedTests === 0) {
    console.log('All conformance tests PASSED');
  } else {
    console.log(`${failedTests} conformance test(s) FAILED`);
  }

  console.log('');
}

export function formatStepResult(step: StepResult): string {
  const status = step.passed ? '[PASS]' : '[FAIL]';
  let line = `${status} ${step.name}`;

  if (!step.passed) {
    if (step.error) {
      line += `: ${step.error}`;
    }
    if (step.expected !== undefined) {
      line += `\n  Expected: ${JSON.stringify(step.expected)}`;
      line += `\n  Actual:   ${JSON.stringify(step.actual)}`;
    }
  }

  return line;
}

export function generateMarkdownReport(results: TestResult[]): string {
  const lines: string[] = [];

  lines.push('# VRWX Conformance Report');
  lines.push('');
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push('');

  // Summary table
  lines.push('## Summary');
  lines.push('');
  lines.push('| Service | Status | Duration |');
  lines.push('|---------|--------|----------|');

  for (const result of results) {
    const status = result.passed ? 'PASS' : 'FAIL';
    lines.push(`| ${result.service} | ${status} | ${result.duration}ms |`);
  }

  lines.push('');

  // Details
  lines.push('## Details');
  lines.push('');

  for (const result of results) {
    lines.push(`### ${result.service}`);
    lines.push('');

    for (const step of result.steps) {
      const icon = step.passed ? '' : '';
      lines.push(`- ${icon} ${step.name}`);

      if (!step.passed && step.expected !== undefined) {
        lines.push(`  - Expected: \`${JSON.stringify(step.expected)}\``);
        lines.push(`  - Actual: \`${JSON.stringify(step.actual)}\``);
      }
    }

    if (result.error) {
      lines.push('');
      lines.push(`**Error:** ${result.error}`);
    }

    lines.push('');
  }

  return lines.join('\n');
}
