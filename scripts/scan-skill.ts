#!/usr/bin/env npx tsx
/**
 * Security scan a skill before applying it.
 *
 * Scans all code in add/ and modify/ directories for suspicious patterns,
 * checks the manifest for dangerous post_apply commands, and reports findings.
 *
 * Usage:
 *   npx tsx scripts/scan-skill.ts .claude/skills/add-telegram
 *   npx tsx scripts/scan-skill.ts .claude/skills/add-telegram --json
 *   npx tsx scripts/scan-skill.ts --all
 */
import fs from 'fs';
import path from 'path';

import { scanSkill, formatScanReport } from '../skills-engine/security-scan.js';

const args = process.argv.slice(2);
const jsonOutput = args.includes('--json');
const scanAll = args.includes('--all');

if (!scanAll && args.filter((a) => !a.startsWith('--')).length === 0) {
  console.error(
    'Usage: npx tsx scripts/scan-skill.ts <skill-dir> [--json]\n       npx tsx scripts/scan-skill.ts --all [--json]',
  );
  process.exit(1);
}

function discoverSkillDirs(): string[] {
  const skillsRoot = path.join(process.cwd(), '.claude', 'skills');
  if (!fs.existsSync(skillsRoot)) return [];
  return fs
    .readdirSync(skillsRoot, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .filter((d) =>
      fs.existsSync(path.join(skillsRoot, d.name, 'manifest.yaml')),
    )
    .map((d) => path.join(skillsRoot, d.name));
}

const dirs = scanAll
  ? discoverSkillDirs()
  : args.filter((a) => !a.startsWith('--'));

if (dirs.length === 0) {
  console.log('No skills with manifest.yaml found.');
  process.exit(0);
}

let hasCritical = false;

for (const dir of dirs) {
  try {
    const summary = scanSkill(dir);

    if (jsonOutput) {
      console.log(JSON.stringify(summary, null, 2));
    } else {
      console.log(formatScanReport(summary));
      if (dirs.length > 1) console.log('');
    }

    if (summary.findings.some((f) => f.severity === 'critical')) {
      hasCritical = true;
    }
  } catch (err: any) {
    console.error(`Error scanning ${dir}: ${err.message}`);
  }
}

if (hasCritical) {
  process.exit(2);
}
