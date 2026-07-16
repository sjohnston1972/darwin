import { existsSync, copyFileSync } from 'node:fs';

if (!existsSync('.env')) {
  copyFileSync('.env.example', '.env');
  console.log('Created .env from .env.example');
} else {
  console.log('.env already exists; leaving it unchanged');
}

console.log('\nDarwin starter is ready.');
console.log('Next: launch Codex and ask it to read AGENTS.md and build Phase 1.');
