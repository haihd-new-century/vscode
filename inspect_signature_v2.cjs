const fs = require('fs');
const filePath = 'd:/Projects/VSCode-win32-x64/resources/app/out/vs/code/electron-utility/sharedProcess/sharedProcessMain.js';

try {
	const content = fs.readFileSync(filePath, 'utf8');
	const searchString = 'isBoolean(value)';

	let pos = 0;
	while (true) {
		const index = content.indexOf(searchString, pos);
		if (index === -1) break;

		const context = content.substring(index - 100, index + 150);
		console.log(`\nMatch at ${index}:`);
		console.log('---START---');
		console.log(context);
		console.log('---END---');

		pos = index + 1;
	}
} catch (e) {
	console.error(e);
}
