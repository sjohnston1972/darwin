import { readFileSync } from 'node:fs';

const trackedViteEnvironmentFiles = [
  'apps/web/.env.production',
  'apps/projectflow/.env.production',
];

for (const path of trackedViteEnvironmentFiles) {
  const lines = readFileSync(path, 'utf8').split(/\r?\n/);
  for (const [index, line] of lines.entries()) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const separator = trimmed.indexOf('=');
    const name = separator < 0 ? trimmed : trimmed.slice(0, separator);
    if (!/^VITE_[A-Z0-9_]+$/.test(name)) {
      throw new Error(
        `${path}:${index + 1} contains ${name}; tracked Vite environment files may contain public VITE_ values only.`,
      );
    }
  }
}

console.log('Tracked production environment files contain public VITE_ values only.');
