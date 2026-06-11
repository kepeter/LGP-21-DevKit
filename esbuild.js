const esbuild = require('esbuild');

const watch = process.argv.includes('--watch');

const common = {
    bundle: true,
    platform: 'node',
    format: 'cjs',
    sourcemap: true,
    minify: !watch,
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
]).catch(() => process.exit(1));
