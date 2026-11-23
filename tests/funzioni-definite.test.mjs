// Ogni funzione chiamata nei componenti dell'app è definita o importata nello stesso file.
// Il 22 novembre l'importazione di downloadCalendar fu tolta per errore: la compilazione non dà
// errore (è JavaScript) e il pulsante «Esporta calendario (.ics)» smise di funzionare senza che
// nessuna prova se ne accorgesse. Questo controllo, grossolano ma veloce, trova i casi così.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const KEYWORDS = ['if', 'for', 'while', 'switch', 'catch', 'return', 'typeof', 'function', 'await', 'async', 'new', 'delete', 'import', 'export', 'super', 'void', 'in', 'of', 'do', 'else', 'try', 'with', 'case', 'throw'];
const GLOBALS = ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'fetch', 'encodeURIComponent', 'decodeURIComponent', 'parseFloat', 'parseInt', 'isNaN', 'isFinite',
  'queueMicrotask', 'structuredClone', 'requestAnimationFrame', 'cancelAnimationFrame', 'atob', 'btoa', 'String', 'Number', 'Boolean', 'Array', 'Object', 'Date', 'Math', 'JSON',
  'Promise', 'Set', 'Map', 'Error', 'URL', 'URLSearchParams', 'Blob', 'File', 'RegExp', 'Symbol', 'BigInt', 'Uint8Array', 'TextEncoder', 'TextDecoder', 'BarcodeDetector', 'createImageBitmap',
  'useState', 'useEffect', 'useMemo', 'useRef', 'useCallback', 'useContext', 'useId', 'useLayoutEffect', 'useReducer', 'useTransition', 'startTransition', 'lazy', 'memo', 'forwardRef', 'createContext', 'createPortal'];
const known = new Set([...KEYWORDS, ...GLOBALS]);

function undefinedCalls(source) {
  const code = source.replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, '').replace(/'(?:\\.|[^'\\\n])*'|"(?:\\.|[^"\\\n])*"|`(?:\\.|[^`\\])*`/g, '""');
  const called = new Set([...code.matchAll(/(?<![.\w$])([a-zA-Z_$][\w$]*)\s*\(/g)].map(m => m[1]));
  return [...called].filter(name => !known.has(name) && !new RegExp([
    `function\\s+${name}\\b`, `(?:const|let|var)\\s+${name}\\b`, `[{,]\\s*${name}\\s*[,}=:]`, `\\b${name}\\s*=[^=>]`, `import\\s+${name}\\b`,
    `\\(\\s*${name}\\s*[,)=]`, `,\\s*${name}\\s*[,)=]`, `\\bas\\s+${name}\\b`, `\\b${name}\\s*=>`, `:\\s*${name}\\b`, `\\[\\s*[\\w$]*\\s*,\\s*${name}\\s*\\]`,
  ].join('|')).test(code));
}

test('le funzioni chiamate nei componenti sono definite o importate', () => {
  const problems = [];
  for (const file of readdirSync(new URL('../app/', import.meta.url)).filter(f => f.endsWith('.jsx'))) {
    const missing = undefinedCalls(readFileSync(new URL(`../app/${file}`, import.meta.url), 'utf8'));
    if (missing.length) problems.push(`app/${file}: ${missing.join(', ')}`);
  }
  assert.deepEqual(problems, []);
});

test('il controllo trova una funzione usata ma mai importata', () => {
  assert.deepEqual(undefinedCalls("export default function A({bills}){return <button onClick={()=>downloadCalendar(bills)}>x</button>}"), ['downloadCalendar']);
  assert.deepEqual(undefinedCalls("import { downloadCalendar } from '../lib/calendar.mjs';\nconst f=()=>downloadCalendar([]);"), []);
  assert.deepEqual(undefinedCalls("const [a,setA]=useState(0);setA(1);"), []);
  assert.deepEqual(undefinedCalls("const [,setB]=useState(0);setB(1);"), []);
});
