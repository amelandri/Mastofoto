#!/usr/bin/env node
// Automates the release flow documented in utilities/ISTRUZIONI.MD:
// bump APP_VERSION, move the CHANGELOG's "Unreleased" section under the new
// version, commit + tag on dev, then fast-forward main and merge into
// production. Pushing to origin is opt-in (--push) since that's the one step
// that's hard to undo and visible to others.

import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));

function run(cmd) {
  execSync(cmd, { cwd: repoRoot, stdio: 'inherit' });
}

function capture(cmd) {
  return execSync(cmd, { cwd: repoRoot, encoding: 'utf8' }).trim();
}

const version = process.argv[2];
const push = process.argv.includes('--push');

if (!version || !/^\d+\.\d+\.\d+$/.test(version)) {
  console.error('Usage: node utilities/release.mjs <version> [--push]');
  console.error('Example: node utilities/release.mjs 0.5.4');
  process.exit(1);
}

const tag = `v${version}`;

const branch = capture('git rev-parse --abbrev-ref HEAD');
if (branch !== 'dev') {
  console.error(`Releases start from "dev" (currently on "${branch}").`);
  process.exit(1);
}

if (capture('git status --porcelain')) {
  console.error('Working tree is not clean. Commit or stash changes before releasing.');
  process.exit(1);
}

// A previous run of this same script (e.g. without --push, to prepare
// locally and review before publishing) may have already done everything up
// to the merges. Detect that exact state and skip straight to publishing
// instead of treating "tag already exists" as always fatal — otherwise a
// prepare-then-push workflow can never complete: the second run would abort
// on the tag check before ever reaching `git push`.
let alreadyPrepared = false;
if (capture(`git tag -l ${tag}`)) {
  const tagCommit = capture(`git rev-parse ${tag}^{commit}`);
  const devCommit = capture('git rev-parse dev');
  const mainCommit = capture('git rev-parse main');
  const devIsAncestorOfProduction = (() => {
    try {
      execSync(`git merge-base --is-ancestor ${devCommit} production`, { cwd: repoRoot });
      return true;
    } catch {
      return false;
    }
  })();
  if (tagCommit === devCommit && mainCommit === devCommit && devIsAncestorOfProduction) {
    alreadyPrepared = true;
    console.log(`Tag ${tag} already exists and matches a fully prepared local release (dev = main = ${tag}, merged into production) — skipping straight to publishing.`);
  } else {
    console.error(`Tag ${tag} already exists but doesn't match a clean, fully-prepared local state for this version. Resolve manually before retrying.`);
    process.exit(1);
  }
}

if (!alreadyPrepared) {
  console.log('== Running tests ==');
  run('node --check app.js');
  run('node --check pure.mjs');
  run('node --test');

  console.log('\n== Updating APP_VERSION in app.js ==');
  const appJsPath = new URL('../app.js', import.meta.url);
  let appJs = readFileSync(appJsPath, 'utf8');
  const versionRegex = /const APP_VERSION = '[^']*';/;
  if (!versionRegex.test(appJs)) {
    console.error('Could not find "const APP_VERSION = \'...\';" in app.js');
    process.exit(1);
  }
  appJs = appJs.replace(versionRegex, `const APP_VERSION = '${version}';`);
  writeFileSync(appJsPath, appJs);

  console.log('== Moving CHANGELOG "Unreleased" section into a new version section ==');
  const changelogPath = new URL('../CHANGELOG.md', import.meta.url);
  let changelog = readFileSync(changelogPath, 'utf8');

  const unreleasedHeading = '## [Unreleased]';
  const headingIdx = changelog.indexOf(unreleasedHeading);
  if (headingIdx === -1) {
    console.error('Could not find "## [Unreleased]" in CHANGELOG.md');
    process.exit(1);
  }
  const afterHeadingIdx = headingIdx + unreleasedHeading.length;
  const nextHeadingMatch = changelog.slice(afterHeadingIdx).match(/\n## \[/);
  if (!nextHeadingMatch) {
    console.error('Could not find the section following "## [Unreleased]" in CHANGELOG.md');
    process.exit(1);
  }
  const nextHeadingIdx = afterHeadingIdx + nextHeadingMatch.index;
  const unreleasedBody = changelog.slice(afterHeadingIdx, nextHeadingIdx).trim();

  if (!unreleasedBody) {
    console.error('The "Unreleased" section is empty — nothing to release.');
    process.exit(1);
  }

  const today = new Date().toISOString().slice(0, 10);
  const newSection = `${unreleasedHeading}\n\n## [${version}] - ${today}\n\n${unreleasedBody}\n\n`;
  changelog = changelog.slice(0, headingIdx) + newSection + changelog.slice(nextHeadingIdx + 1);
  writeFileSync(changelogPath, changelog);

  console.log('\n== Committing and tagging on dev ==');
  run('git add app.js CHANGELOG.md');
  run(`git commit -m "Release ${tag}"`);
  run(`git tag -a ${tag} -m "Release ${tag}"`);

  console.log('\n== Fast-forwarding main ==');
  run('git checkout main');
  try {
    run('git merge dev --ff-only');
  } catch {
    console.error(
      `\nFast-forward merge into main failed (main has diverged). The release commit and tag ${tag} ` +
      'already exist on dev — resolve this manually per utilities/ISTRUZIONI.MD (regular "git merge dev" ' +
      'on main, then continue from the "production" step), then push.'
    );
    run('git checkout dev');
    process.exit(1);
  }

  console.log('\n== Merging main into production ==');
  run('git checkout production');
  try {
    run('git merge main --no-edit');
  } catch {
    console.error(
      '\nMerging main into production hit a conflict — resolve it, commit, verify the personal layer ' +
      '(rel="me" / Umami script) is still present, then push manually.'
    );
    process.exit(1);
  }

  const personalLayer = capture('git show production:index.html | grep -n \'rel="me"\\|umami\' || true');
  if (!personalLayer) {
    console.error(
      '\nWarning: could not find the personal layer (rel="me" / umami) in production:index.html after the merge. ' +
      'Check before pushing.'
    );
  } else {
    console.log('Personal layer confirmed present in production:index.html:');
    console.log(personalLayer);
  }

  run('git checkout dev');
}

if (push) {
  console.log('\n== Pushing ==');
  run('git push origin dev');
  run('git push origin main');
  run('git push origin production');
  run(`git push origin ${tag}`);
  console.log(`\nRelease ${tag} pushed.`);
} else {
  console.log(`\nRelease ${tag} prepared locally on dev/main/production. To publish, run:\n`);
  console.log('  git push origin dev');
  console.log('  git push origin main');
  console.log('  git push origin production');
  console.log(`  git push origin ${tag}`);
  console.log('\n(or re-run this script with --push)');
}
