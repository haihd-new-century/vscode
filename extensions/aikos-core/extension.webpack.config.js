/*---------------------------------------------------------------------------------------------
 *  AIKOS IDE — Built-in AIKOS AI Extension
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/
// @ts-check

/**
 * VS Code built-in extensions are compiled via the gulp TypeScript pipeline
 * (registered in build/gulpfile.extensions.ts compilations array).
 *
 * This file provides a standalone webpack/esbuild config for development and
 * packaging outside the VS Code build system. It is NOT required for the
 * fork's standard `npm run gulp` build.
 */

import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('webpack').Configuration} */
const config = {
	target: 'node',
	mode: 'none',
	context: __dirname,
	entry: {
		extension: './src/extension.ts',
	},
	output: {
		path: path.resolve(__dirname, 'out'),
		filename: '[name].js',
		libraryTarget: 'commonjs2',
	},
	externals: {
		vscode: 'commonjs vscode',
		'socket.io-client': 'commonjs socket.io-client',
	},
	resolve: {
		extensions: ['.ts', '.js'],
	},
	module: {
		rules: [
			{
				test: /\.ts$/,
				exclude: /node_modules/,
				use: [{ loader: 'ts-loader' }],
			},
		],
	},
	devtool: 'nosources-source-map',
};

export default config;
