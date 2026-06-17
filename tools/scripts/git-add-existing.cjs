#!/usr/bin/env node

const fs = require('fs');
const { spawnSync } = require('child_process');

const paths = process.argv.slice(2);

if (!paths.length) {
  console.error('Usage: node tools/scripts/git-add-existing.cjs <path> [path...]');
  process.exit(1);
}

for (const targetPath of paths) {
  if (!shouldStage(targetPath)) {
    console.log(`Skip missing untracked path: ${targetPath}`);
    continue;
  }

  runGit(['add', '-A', '--', targetPath]);
  console.log(`Staged path: ${targetPath}`);
}

function shouldStage(targetPath) {
  if (fs.existsSync(targetPath)) return true;

  const tracked = spawnSync('git', ['ls-files', '--', targetPath], {
    encoding: 'utf8'
  });

  if (tracked.status !== 0) {
    console.error(tracked.stderr || `git ls-files failed for ${targetPath}`);
    process.exit(tracked.status || 1);
  }

  return tracked.stdout.trim().length > 0;
}

function runGit(args) {
  const result = spawnSync('git', args, {
    encoding: 'utf8',
    stdio: 'inherit'
  });

  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}
