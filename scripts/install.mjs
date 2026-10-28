/**
 * Install dsh-ketcher into a DSH profile WITHOUT the Electron app.
 *
 * The `desktop` profile is normally managed exclusively by the Electron app, so
 * the sanctioned way to install is its Plugins page or the `plugin_manager`
 * tool with `action: install_bundle` and `target` set to this package directory.
 * This script is a fallback for a non-Electron / standalone `dsh` profile:
 *
 *     node scripts/install.mjs --profile <name> [--dry-run]
 *
 * It:
 *   1. snapshots <profile>/package.json and cordis.patch.yml,
 *   2. adds a `link:` dependency pointing at this package directory,
 *   3. appends the bundle to `dsh.profile.bundles`,
 *   4. prints the exact revert steps.
 *
 * It refuses to touch a profile named `desktop` unless --force is passed,
 * because that profile belongs to the running Electron app and must be changed
 * through the app, not on disk while it runs.
 */
import { readFileSync, writeFileSync, copyFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';

const here = dirname(fileURLToPath(import.meta.url));
const pkgDir = resolve(here, '..');

function arg(name, fallback) {
  const i = process.argv.indexOf('--' + name);
  if (i === -1) return fallback;
  const next = process.argv[i + 1];
  return next && !next.startsWith('--') ? next : true;
}

const profileName = arg('profile');
const dryRun = arg('dry-run', false) === true;
const force = arg('force', false) === true;
if (!profileName || profileName === true) {
  console.error('usage: node scripts/install.mjs --profile <name> [--dry-run] [--force]');
  process.exit(2);
}
if (profileName === 'desktop' && !force) {
  console.error(
    'Refusing to modify the "desktop" profile on disk: it is managed by the running\n' +
    'Electron app. Install it from the app\'s Plugins page, or the plugin_manager\n' +
    'tool with action "install_bundle" and target "' + pkgDir + '".\n' +
    'Pass --force only if the Electron app is closed.',
  );
  process.exit(3);
}

const home = process.env.DSH_HOME || join(homedir(), '.dsh');
const profileDir = join(home, 'profiles', profileName);
const pkgJsonPath = join(profileDir, 'package.json');
if (!existsSync(pkgJsonPath)) {
  console.error('profile package.json not found: ' + pkgJsonPath);
  process.exit(4);
}

const pkg = JSON.parse(readFileSync(pkgJsonPath, 'utf8'));
pkg.dependencies = pkg.dependencies || {};
pkg.dsh = pkg.dsh || {};
pkg.dsh.profile = pkg.dsh.profile || {};
pkg.dsh.profile.bundles = pkg.dsh.profile.bundles || [];

const depName = '@local/dsh-ketcher';
const already = pkg.dependencies[depName] !== undefined;
const selected = pkg.dsh.profile.bundles.includes(depName);

pkg.dependencies[depName] = 'link:' + pkgDir.replace(/\\/g, '/');
if (!selected) pkg.dsh.profile.bundles.push(depName);

const plan = {
  profileDir,
  manifest: pkgJsonPath,
  dependency: pkg.dependencies[depName],
  bundleAlreadySelected: selected,
  bundles: pkg.dsh.profile.bundles,
};

if (dryRun) {
  console.log('DRY RUN — no files written. Planned change:\n' + JSON.stringify(plan, null, 2));
  process.exit(0);
}

// Snapshot before writing.
copyFileSync(pkgJsonPath, pkgJsonPath + '.bak-dsh-ketcher');
writeFileSync(pkgJsonPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');

console.log('Installed ' + depName + ' into profile "' + profileName + '".');
console.log('  dependency: ' + plan.dependency);
console.log('  bundles:    ' + JSON.stringify(plan.bundles));
console.log('');
console.log('Next: run `pnpm install` in ' + profileDir + ' (creates the link), then');
console.log('restart DSH (or let HMR recompose). Revert with:');
console.log('  copy "' + pkgJsonPath + '.bak-dsh-ketcher" "' + pkgJsonPath + '"');
