const fs = require('fs');
const path = require('path');

const cliPath = path.join(__dirname, '../dist/cli/index.js');

if (!fs.existsSync(cliPath)) {
  console.error('CLI entry point not found at:', cliPath);
  process.exit(1);
}

let content = fs.readFileSync(cliPath, 'utf8');

if (!content.startsWith('#!/usr/bin/env node')) {
  content = '#!/usr/bin/env node\n' + content;
  fs.writeFileSync(cliPath, content, 'utf8');
  console.log('Added shebang to CLI entry point');
}

try {
  fs.chmodSync(cliPath, 0o755);
  console.log('Set executable permissions on CLI entry point');
} catch (err) {
  console.warn('Failed to set executable permissions:', err.message);
}

console.log('CLI build complete');
