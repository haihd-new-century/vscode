const fs = require('fs');
const path = require('path');

const filePath = 'd:/Projects/VSCode-win32-x64/resources/app/out/vs/code/electron-utility/sharedProcess/sharedProcessMain.js';
// Search for both string literal and potential variable usage
const searchStrings = ['extensions.verifySignature', 'VerifyExtensionSignatureConfigKey'];
const contextLength = 200;

try {
	if (!fs.existsSync(filePath)) {
		console.error(`File not found: ${filePath}`);
		process.exit(1);
	}

	const content = fs.readFileSync(filePath, 'utf8');

	searchStrings.forEach(searchString => {
		console.log(`\nSearching for: ${searchString}`);
		let pos = 0;
		while (true) {
			const index = content.indexOf(searchString, pos);
			if (index === -1) break;

			console.log(`Found at index ${index}:`);
			const start = Math.max(0, index - contextLength);
			const end = Math.min(content.length, index + searchString.length + contextLength);
			const chunk = content.substring(start, end);
			console.log('--- Context ---');
			console.log(chunk);
			console.log('--- End Context ---');

			pos = index + 1;
		}
	});

} catch (err) {
	console.error('Error:', err);
}
