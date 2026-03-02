import fs from 'fs';
import path from 'path';

import { readManifest } from './manifest.js';
import { SkillManifest } from './types.js';

// --- Types ---

export type Severity = 'critical' | 'warning' | 'info';

export interface ScanFinding {
  severity: Severity;
  category: string;
  message: string;
  file?: string;
  line?: number;
  match?: string;
}

export interface ScanSummary {
  skill: string;
  version: string;
  filesAdded: string[];
  filesModified: string[];
  npmDependencies: Record<string, string>;
  envAdditions: string[];
  postApplyCommands: string[];
  findings: ScanFinding[];
}

// --- Pattern definitions ---

interface PatternRule {
  pattern: RegExp;
  severity: Severity;
  category: string;
  message: string;
}

const CODE_PATTERNS: PatternRule[] = [
  // Critical: direct shell execution with interpolation
  {
    pattern: /exec\s*\(\s*`[^`]*\$\{/,
    severity: 'critical',
    category: 'command-injection',
    message: 'exec() with template literal interpolation — potential command injection',
  },
  {
    pattern: /exec\s*\(\s*[^'"][^,)]*\+/,
    severity: 'critical',
    category: 'command-injection',
    message: 'exec() with string concatenation — potential command injection',
  },
  {
    pattern: /execSync\s*\(\s*`[^`]*\$\{/,
    severity: 'critical',
    category: 'command-injection',
    message: 'execSync() with template literal interpolation — potential command injection',
  },

  // Critical: eval and dynamic code execution
  {
    pattern: /\beval\s*\(/,
    severity: 'critical',
    category: 'code-execution',
    message: 'eval() — arbitrary code execution',
  },
  {
    pattern: /new\s+Function\s*\(/,
    severity: 'critical',
    category: 'code-execution',
    message: 'new Function() — dynamic code generation',
  },

  // Critical: curl piped to shell
  {
    pattern: /curl\s[^|]*\|\s*(ba)?sh/,
    severity: 'critical',
    category: 'remote-execution',
    message: 'curl piped to shell — remote code execution',
  },
  {
    pattern: /wget\s[^|]*\|\s*(ba)?sh/,
    severity: 'critical',
    category: 'remote-execution',
    message: 'wget piped to shell — remote code execution',
  },

  // Critical: environment variable exfiltration
  {
    pattern: /process\.env\b.*(?:fetch|http|request|axios|got)\b/,
    severity: 'critical',
    category: 'data-exfil',
    message: 'process.env accessed near network call — potential credential exfiltration',
  },
  {
    pattern: /(?:fetch|http|request|axios|got)\b.*process\.env\b/,
    severity: 'critical',
    category: 'data-exfil',
    message: 'Network call with process.env — potential credential exfiltration',
  },

  // Warning: file system operations outside expected paths
  {
    pattern: /(?:writeFile|appendFile|createWriteStream)\s*\(\s*['"`](?:\/|~)/,
    severity: 'warning',
    category: 'fs-write',
    message: 'Writing to absolute/home path — check if this is expected',
  },
  {
    pattern: /(?:unlink|rmdir|rm)\s*\(\s*['"`](?:\/|~)/,
    severity: 'warning',
    category: 'fs-delete',
    message: 'Deleting at absolute/home path — check if this is expected',
  },
  {
    pattern: /fs\.(?:writeFile|appendFile|unlink|rmdir|rm)/,
    severity: 'info',
    category: 'fs-mutation',
    message: 'File system write/delete operation',
  },

  // Warning: network requests (not inherently bad, but worth knowing about)
  {
    pattern: /\bfetch\s*\(\s*['"`]https?:\/\//,
    severity: 'info',
    category: 'network',
    message: 'Hardcoded URL in fetch call',
  },
  {
    pattern: /(?:require|import)\s*\(?['"`]https?:\/\//,
    severity: 'warning',
    category: 'network',
    message: 'Importing from remote URL',
  },

  // Warning: child process spawning
  {
    pattern: /(?:spawn|exec|execFile|fork)\s*\(/,
    severity: 'info',
    category: 'subprocess',
    message: 'Child process spawning',
  },

  // Warning: crypto/encoding that might hide intent
  {
    pattern: /Buffer\.from\s*\([^,]+,\s*['"`]base64['"`]\)/,
    severity: 'info',
    category: 'encoding',
    message: 'Base64 decoding — check for obfuscated content',
  },

  // Warning: accessing sensitive files
  {
    pattern: /\.ssh\//,
    severity: 'warning',
    category: 'sensitive-path',
    message: 'References .ssh directory',
  },
  {
    pattern: /['"`]\.env['"`]|readFile.*\.env|dotenv|\.env\.local/,
    severity: 'info',
    category: 'sensitive-path',
    message: 'References .env file',
  },
  {
    pattern: /(?:password|secret|token|api_key|apikey|private_key)\s*[:=]/i,
    severity: 'warning',
    category: 'hardcoded-secret',
    message: 'Possible hardcoded secret or credential',
  },
];

// --- Scanner ---

function scanFileContent(
  filePath: string,
  content: string,
): ScanFinding[] {
  const findings: ScanFinding[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const rule of CODE_PATTERNS) {
      const match = line.match(rule.pattern);
      if (match) {
        findings.push({
          severity: rule.severity,
          category: rule.category,
          message: rule.message,
          file: filePath,
          line: i + 1,
          match: match[0].slice(0, 80),
        });
      }
    }
  }

  return findings;
}

function collectFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const results: string[] = [];

  function walk(current: string): void {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else {
        results.push(full);
      }
    }
  }

  walk(dir);
  return results;
}

function scanSkillFiles(
  skillDir: string,
  subdir: 'add' | 'modify',
): ScanFinding[] {
  const dir = path.join(skillDir, subdir);
  const files = collectFiles(dir);
  const findings: ScanFinding[] = [];

  for (const file of files) {
    // Skip intent files and non-code files
    if (file.endsWith('.intent.md')) continue;
    if (file.endsWith('.md') || file.endsWith('.yaml') || file.endsWith('.yml'))
      continue;

    const content = fs.readFileSync(file, 'utf-8');
    const relPath = path.relative(skillDir, file);
    findings.push(...scanFileContent(relPath, content));
  }

  return findings;
}

function checkManifestSecurity(manifest: SkillManifest): ScanFinding[] {
  const findings: ScanFinding[] = [];

  // Check post_apply commands
  if (manifest.post_apply) {
    for (const cmd of manifest.post_apply) {
      findings.push({
        severity: 'warning',
        category: 'post-apply',
        message: `Post-apply command: ${cmd}`,
      });

      // Extra scrutiny for dangerous patterns
      if (/curl.*\|.*sh/.test(cmd) || /wget.*\|.*sh/.test(cmd)) {
        findings.push({
          severity: 'critical',
          category: 'post-apply',
          message: `Post-apply downloads and executes remote code: ${cmd}`,
        });
      }
      if (/rm\s+-rf/.test(cmd)) {
        findings.push({
          severity: 'critical',
          category: 'post-apply',
          message: `Post-apply runs destructive rm -rf: ${cmd}`,
        });
      }
    }
  }

  // Check test command for suspicious patterns
  if (manifest.test) {
    if (/curl|wget/.test(manifest.test) || (/npx\s/.test(manifest.test) && !/npx\s+(vitest|tsc|tsx|jest|mocha)/.test(manifest.test))) {
      findings.push({
        severity: 'warning',
        category: 'test-command',
        message: `Test command may download/execute code: ${manifest.test}`,
      });
    }
  }

  // Check file_ops for writes to sensitive locations
  if (manifest.file_ops) {
    for (const op of manifest.file_ops) {
      const targetPath = op.to || op.path || '';
      if (
        targetPath.includes('..') ||
        targetPath.startsWith('/') ||
        targetPath.includes('.ssh') ||
        targetPath.includes('.env')
      ) {
        findings.push({
          severity: 'critical',
          category: 'file-ops',
          message: `File operation targets suspicious path: ${targetPath}`,
        });
      }
    }
  }

  // Check npm dependencies — just flag them for awareness
  if (manifest.structured?.npm_dependencies) {
    const deps = Object.entries(manifest.structured.npm_dependencies);
    if (deps.length > 0) {
      findings.push({
        severity: 'info',
        category: 'dependencies',
        message: `Adds ${deps.length} npm package(s): ${deps.map(([n, v]) => `${n}@${v}`).join(', ')}`,
      });
    }
  }

  return findings;
}

export function scanSkill(skillDir: string): ScanSummary {
  const manifest = readManifest(skillDir);

  const findings: ScanFinding[] = [];

  // Scan manifest-level security
  findings.push(...checkManifestSecurity(manifest));

  // Scan added files
  findings.push(...scanSkillFiles(skillDir, 'add'));

  // Scan modified files
  findings.push(...scanSkillFiles(skillDir, 'modify'));

  return {
    skill: manifest.skill,
    version: manifest.version,
    filesAdded: manifest.adds,
    filesModified: manifest.modifies,
    npmDependencies: manifest.structured?.npm_dependencies || {},
    envAdditions: manifest.structured?.env_additions || [],
    postApplyCommands: manifest.post_apply || [],
    findings,
  };
}

// --- Formatting ---

const SEVERITY_ICONS: Record<Severity, string> = {
  critical: 'CRITICAL',
  warning: 'WARNING',
  info: 'INFO',
};

export function formatScanReport(summary: ScanSummary): string {
  const lines: string[] = [];

  lines.push(`Security scan: ${summary.skill} v${summary.version}`);
  lines.push('='.repeat(50));

  // Overview
  lines.push('');
  lines.push('## Scope');
  if (summary.filesAdded.length > 0) {
    lines.push(`  Adds: ${summary.filesAdded.join(', ')}`);
  }
  if (summary.filesModified.length > 0) {
    lines.push(`  Modifies: ${summary.filesModified.join(', ')}`);
  }
  if (Object.keys(summary.npmDependencies).length > 0) {
    const deps = Object.entries(summary.npmDependencies)
      .map(([n, v]) => `${n}@${v}`)
      .join(', ');
    lines.push(`  Dependencies: ${deps}`);
  }
  if (summary.envAdditions.length > 0) {
    lines.push(`  Env vars: ${summary.envAdditions.join(', ')}`);
  }
  if (summary.postApplyCommands.length > 0) {
    lines.push(`  Post-apply: ${summary.postApplyCommands.join('; ')}`);
  }

  // Findings
  const critical = summary.findings.filter((f) => f.severity === 'critical');
  const warnings = summary.findings.filter((f) => f.severity === 'warning');
  const info = summary.findings.filter((f) => f.severity === 'info');

  lines.push('');
  lines.push('## Findings');
  lines.push(
    `  ${critical.length} critical, ${warnings.length} warnings, ${info.length} info`,
  );

  if (critical.length > 0) {
    lines.push('');
    lines.push('### CRITICAL');
    for (const f of critical) {
      const loc = f.file ? ` [${f.file}${f.line ? ':' + f.line : ''}]` : '';
      lines.push(`  ${SEVERITY_ICONS[f.severity]} ${f.message}${loc}`);
      if (f.match) lines.push(`    match: ${f.match}`);
    }
  }

  if (warnings.length > 0) {
    lines.push('');
    lines.push('### WARNINGS');
    for (const f of warnings) {
      const loc = f.file ? ` [${f.file}${f.line ? ':' + f.line : ''}]` : '';
      lines.push(`  ${SEVERITY_ICONS[f.severity]} ${f.message}${loc}`);
    }
  }

  if (info.length > 0) {
    lines.push('');
    lines.push('### INFO');
    for (const f of info) {
      const loc = f.file ? ` [${f.file}${f.line ? ':' + f.line : ''}]` : '';
      lines.push(`  ${SEVERITY_ICONS[f.severity]} ${f.message}${loc}`);
    }
  }

  // Verdict
  lines.push('');
  if (critical.length > 0) {
    lines.push(
      '## VERDICT: REVIEW REQUIRED — critical findings need manual inspection',
    );
  } else if (warnings.length > 0) {
    lines.push(
      '## VERDICT: CAUTION — warnings found, review before applying',
    );
  } else {
    lines.push('## VERDICT: CLEAN — no suspicious patterns detected');
  }

  return lines.join('\n');
}
