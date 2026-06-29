'use strict';

// Build script: bundles app with esbuild, then creates a Single Executable Application (SEA)
// Requirements: Node.js 22+, esbuild, postject (installed as devDependencies)

const { build } = require('esbuild');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const DIST = path.join(ROOT, 'dist');
const BUNDLE = path.join(DIST, 'bundle.cjs');
const SEA_CONFIG = path.join(DIST, 'sea-config.json');
const SEA_BLOB = path.join(DIST, 'sea-prep.blob');
const NODE_EXE = process.execPath;
const OUTPUT_EXE = path.join(DIST, 'ai-gateway.exe');

// esbuild plugin: treat files under public/ as text strings (not JS)
const publicAssetsPlugin = {
  name: 'public-assets-as-text',
  setup(b) {
    b.onResolve({ filter: /^\.\/public\// }, (args) => {
      const resolved = path.resolve(path.dirname(args.importer), args.path);
      return { path: resolved, namespace: 'asset-text' };
    });
    b.onLoad({ filter: /.*/, namespace: 'asset-text' }, (args) => {
      const content = fs.readFileSync(args.path, 'utf-8');
      return { contents: content, loader: 'text' };
    });
  },
};

async function main() {
  console.log('=== AI Gateway SEA Build ===\n');

  // 1. Clean dist
  if (fs.existsSync(DIST)) {
    fs.rmSync(DIST, { recursive: true });
  }
  fs.mkdirSync(DIST, { recursive: true });

  // 2. Bundle with esbuild
  console.log('[1/4] Bundling with esbuild...');
  await build({
    entryPoints: [path.join(ROOT, 'sea-entry.js')],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node22',
    outfile: BUNDLE,
    minify: true,
    legalComments: 'none',
    plugins: [publicAssetsPlugin],
  });
  console.log('  Bundle created.');

  // 3. Create SEA config
  console.log('[2/4] Creating SEA config...');
  const seaConfig = {
    main: BUNDLE,
    output: SEA_BLOB,
    disableExperimentalSEAWarning: true,
    useSnapshot: false,
    useCodeCache: true,
  };
  fs.writeFileSync(SEA_CONFIG, JSON.stringify(seaConfig, null, 2));

  // 4. Generate SEA blob
  console.log('[3/4] Generating SEA blob...');
  execSync('"' + NODE_EXE + '" --experimental-sea-config "' + SEA_CONFIG + '"', {
    stdio: 'inherit',
    cwd: DIST,
  });

  // 5. Copy node.exe and inject blob
  console.log('[4/4] Creating executable...');
  fs.copyFileSync(NODE_EXE, OUTPUT_EXE);

  // Remove signature (Windows) — may fail if not signed, that's OK
  try {
    execSync('signtool remove /s "' + OUTPUT_EXE + '"', { stdio: 'ignore' });
  } catch {
    // not signed — fine
  }

  // Inject blob with postject
  const postject = path.join(ROOT, 'node_modules', 'postject', 'dist', 'cli.js');
  execSync('"' + NODE_EXE + '" "' + postject + '" "' + OUTPUT_EXE + '" NODE_SEA_BLOB "' + SEA_BLOB + '" --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2', {
    stdio: 'inherit',
  });

  // Clean up intermediate files
  try {
    fs.unlinkSync(BUNDLE);
    fs.unlinkSync(SEA_BLOB);
    fs.unlinkSync(SEA_CONFIG);
  } catch {
    // best effort cleanup
  }

  const sizeMB = (fs.statSync(OUTPUT_EXE).size / 1024 / 1024).toFixed(1);
  console.log('\n=== Build complete! ===');
  console.log('Output: ' + OUTPUT_EXE);
  console.log('Size: ' + sizeMB + ' MB');
  console.log('\nDouble-click ai-gateway.exe to start the gateway.');
  console.log('Data will be stored in a "data" folder next to the exe.');
}

main().catch((err) => {
  console.error('Build failed:', err);
  process.exit(1);
});
