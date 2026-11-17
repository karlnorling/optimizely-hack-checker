import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import HtmlWebpackPlugin from 'html-webpack-plugin';
import MiniCssExtractPlugin from 'mini-css-extract-plugin';
import webpack, { type Configuration } from 'webpack';
import type { Configuration as DevServerConfiguration } from 'webpack-dev-server';

const dirname = path.dirname(fileURLToPath(import.meta.url));

// Strict CSP for the production build: the page can only load its own files,
// so history data provably cannot leave the browser. GitHub Pages cannot set
// response headers, so it is delivered as a <meta> tag. Not used in dev,
// where style-loader injects <style> tags and the dev server uses websockets.
const CSP = [
  "default-src 'none'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "style-src 'self'",
  "img-src 'self' data:",
  "connect-src 'self'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');

// Public URL of the site, used for absolute links in social preview tags.
const SITE_URL = process.env.SITE_URL ?? 'https://karlnorling.github.io/optimizely-hack-checker/';

// What this build was made from. In GitHub Actions this links the live page
// to the exact commit and run that produced it.
const env = process.env;
const BUILD = {
  commit: env.GITHUB_SHA ?? null,
  runUrl:
    env.GITHUB_SERVER_URL && env.GITHUB_REPOSITORY && env.GITHUB_RUN_ID
      ? `${env.GITHUB_SERVER_URL}/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}`
      : null,
  time: new Date().toISOString(),
};

/** Copies static files from public/ into the build unchanged (no hash, stable URLs). */
class CopyPublicFiles {
  files: string[];
  constructor(files: string[]) {
    this.files = files;
  }
  apply(compiler: webpack.Compiler) {
    compiler.hooks.thisCompilation.tap('CopyPublicFiles', (compilation) => {
      compilation.hooks.processAssets.tap(
        { name: 'CopyPublicFiles', stage: webpack.Compilation.PROCESS_ASSETS_STAGE_ADDITIONAL },
        () => {
          for (const f of this.files) {
            const file = path.resolve(dirname, 'public', f);
            compilation.fileDependencies.add(file);
            compilation.emitAsset(f, new webpack.sources.RawSource(readFileSync(file)));
          }
        },
      );
    });
  }
}

export default (_env: unknown, argv: { mode?: string }): Configuration & { devServer?: DevServerConfiguration } => {
  const prod = argv.mode !== 'development';
  return {
    mode: prod ? 'production' : 'development',
    entry: './src/main.tsx',
    devtool: prod ? 'source-map' : 'eval-cheap-module-source-map',
    output: {
      path: path.resolve(dirname, 'dist'),
      filename: 'assets/[name].[contenthash:8].js',
      assetModuleFilename: 'assets/[name].[contenthash:8][ext]',
      // Relative URLs so the site works from any sub-path, e.g.
      // https://<user>.github.io/<repo>/
      publicPath: 'auto',
      clean: true,
    },
    resolve: {
      extensions: ['.tsx', '.ts', '.js'],
      // Source imports say "./x.ts"; after TypeScript rewrites them to "./x.js"
      // webpack has to map them back to the source file.
      extensionAlias: { '.js': ['.ts', '.tsx', '.js'] },
    },
    module: {
      rules: [
        {
          test: /\.tsx?$/,
          exclude: /node_modules/,
          use: { loader: 'ts-loader', options: { compilerOptions: { sourceMap: true } } },
        },
        {
          test: /\.css$/,
          use: [prod ? MiniCssExtractPlugin.loader : 'style-loader', 'css-loader'],
        },
        { test: /\.wasm$/, type: 'asset/resource' },
      ],
    },
    plugins: [
      new HtmlWebpackPlugin({
        template: './public/index.html',
        publicPath: '',
        templateParameters: { siteUrl: SITE_URL },
        meta: prod ? { csp: { 'http-equiv': 'Content-Security-Policy', content: CSP } } : {},
      }),
      new webpack.DefinePlugin({ BUILD_INFO: JSON.stringify(BUILD) }),
      new CopyPublicFiles(['og.png']),
      ...(prod ? [new MiniCssExtractPlugin({ filename: 'assets/[name].[contenthash:8].css' })] : []),
    ],
    performance: { hints: false },
    devServer: { port: 5173, open: false, hot: true },
  };
};
