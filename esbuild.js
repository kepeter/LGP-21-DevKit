const esbuild = require('esbuild');

const watch = process.argv.includes('--watch');
const production = process.argv.includes('--production');

const common = {
    bundle: true,
    platform: 'node',
    format: 'cjs',
    sourcemap: true,
    minify: production,
};

Promise.all([
    esbuild.build({
        ...common,
        entryPoints: ['extension.ts'],
        outfile: 'out/extension.js',
        external: ['vscode'],
    }),
    esbuild.build({
        ...common,
        entryPoints: ['server/server.ts'],
        outfile: 'server/out/server.js',
    }),
    esbuild.build({
        ...common,
        entryPoints: ['compiler/compiler.ts'],
        outfile: 'out/compiler.js',
    }),
]).catch(() => process.exit(1));
