import fs from 'fs';
const file = 'src/App.tsx';
const lines = fs.readFileSync(file, 'utf8').split('\n');
const startIdx = lines.findIndex(l => l.startsWith('class PCMPlayer'));
const endIdx = lines.findIndex(l => l.startsWith('export default function App()'));
if (startIdx !== -1 && endIdx !== -1) {
    const newLines = [...lines.slice(0, startIdx), ...lines.slice(endIdx)];
    fs.writeFileSync(file, newLines.join('\n'));
}
