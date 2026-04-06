/*---------------------------------------------------------------------------------------------
 *  AIKOS IDE — Built-in AIKOS AI Extension
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/
// @ts-check
import withDefaults from '../shared.webpack.config.mjs';

export default withDefaults({
	context: import.meta.dirname,
	entry: {
		extension: './src/extension.ts',
	},
	externals: {
		'socket.io-client': 'commonjs socket.io-client',
	},
});
