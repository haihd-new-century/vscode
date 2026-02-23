const fs = require('fs');
const filePath = 'd:/Projects/VSCode-win32-x64/resources/app/out/vs/code/electron-utility/sharedProcess/sharedProcessMain.js';

try {
	if (!fs.existsSync(filePath)) {
		console.error(`File not found: ${filePath}`);
		process.exit(1);
	}

	let content = fs.readFileSync(filePath, 'utf8');

	// Pattern: verifySignature = isBoolean(value) ? value : true;
	// We look for logic that defaults to true

	// We will search for 'isBoolean(value) ? value : true'
	// And ensure 'getValue' is before it.

	const targetFragment = 'isBoolean(value) ? value : true';
	const replacementFragment = 'isBoolean(value) ? value : false';

	const index = content.indexOf(targetFragment);
	if (index === -1) {
		console.error('Target fragment not found!');
		// Fallback: maybe spaces are different?
		// Try regex? No, simple string first.
		process.exit(1);
	}

	// Check context
	const contextStart = Math.max(0, index - 500);
	const context = content.substring(contextStart, index);

	if (context.includes('configurationService.getValue') || context.includes('extensions.verifySignature') || context.includes('VerifyExtensionSignatureConfigKey')) {
		console.log(`Found target at ${index}. Context confirmed.`);

		// precise replacement
		// Note: verifySignature variable name might vary, but 'isBoolean(value) ? value : true' is the tail.

		const newContent = content.replace(targetFragment, replacementFragment);
		fs.writeFileSync(filePath, newContent, 'utf8');
		console.log('Successfully patched sharedProcessMain.js');
	} else {
		console.error('Context check failed. logic might be different.');
		console.log('Context seen:', context);
		process.exit(1);
	}

} catch (err) {
	console.error('Error:', err);
	process.exit(1);
}
