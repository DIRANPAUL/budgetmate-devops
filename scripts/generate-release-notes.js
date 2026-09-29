#!/usr/bin/env node
'use strict';

/**
 * generate-release-notes.js
 * -----------------------------------------------------------------------
 * Run by the Jenkins "Release" stage to build RELEASE_NOTES.md for the
 * tag being promoted, from real `git log` output between the previous
 * release tag and HEAD — so release notes are always an accurate record
 * of what actually shipped, never hand-written after the fact.
 *
 * Usage: node scripts/generate-release-notes.js v1.0.3
 * -----------------------------------------------------------------------
 */

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8' }).trim();
}

function previousTag() {
  try {
    return git(['describe', '--tags', '--abbrev=0', 'HEAD^']);
  } catch (_err) {
    return null; // no previous tag yet — first release
  }
}

function main() {
  const newTag = process.argv[2];
  if (!newTag) {
    console.error('Usage: node scripts/generate-release-notes.js <new-tag>');
    process.exit(1);
  }

  const prevTag = previousTag();
  const range = prevTag ? `${prevTag}..HEAD` : 'HEAD';
  const log = git(['log', range, '--pretty=format:- %s (%h)']);
  const date = new Date().toISOString().slice(0, 10);

  const notes = [
    `# ${newTag} — ${date}`,
    '',
    prevTag
      ? `Changes since \`${prevTag}\`:`
      : 'Initial release.',
    '',
    log || '- No commits found in range.',
    '',
  ].join('\n');

  fs.writeFileSync('RELEASE_NOTES.md', notes);
  console.log(`Wrote RELEASE_NOTES.md for ${newTag} (${prevTag ? `since ${prevTag}` : 'first release'})`);
  console.log('');
  console.log(notes);
}

main();
