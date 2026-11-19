// Copies the static game into www/ for the Capacitor Android build.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'www');
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out);
for (const item of ['index.html', 'css', 'js']) {
    fs.cpSync(path.join(root, item), path.join(out, item), { recursive: true });
}
console.log('www/ ready');
