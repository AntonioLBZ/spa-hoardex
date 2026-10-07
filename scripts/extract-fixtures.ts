// Extracts saved Postman responses to fixtures/full/postman (gitignored); --anonymize also writes fixtures/full/anon
// Run: node scripts/extract-fixtures.ts [--anonymize] [path/to/collection.json]
// Reads response bodies only: requests can carry the API key
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAnonymizer } from './lib/anonymize.ts';
import { collectResponses, countUnsafeIntegers, fileNames, sortKeys } from './lib/postman.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(ROOT, 'fixtures/full');
const DEFAULT_COLLECTION = resolve(ROOT, '..', 'v2Steam Web API.postman_collection.json');

const args = process.argv.slice(2);
const anonymize = args.includes('--anonymize');
const collectionPath = args.find((arg) => !arg.startsWith('--')) ?? DEFAULT_COLLECTION;

const collection = JSON.parse(await readFile(collectionPath, 'utf8')) as { item?: unknown };
const responses = collectResponses(collection.item);
const names = fileNames(responses);

const targets = [resolve(OUT, 'postman'), ...(anonymize ? [resolve(OUT, 'anon')] : [])];
for (const dir of targets) {
    await rm(dir, { recursive: true, force: true });
    await mkdir(dir, { recursive: true });
}

const anonymizer = createAnonymizer();
let text = 0;
let unsafe = 0;

for (const [index, response] of responses.entries()) {
    const name = names[index]!;
    if (typeof response.body === 'string') text += 1;
    unsafe += countUnsafeIntegers(response.body);
    await writeFile(resolve(OUT, 'postman', name), `${JSON.stringify(sortKeys(response.body), null, 2)}\n`);
    if (anonymize) {
        const clean = sortKeys(anonymizer.anonymize(response.body));
        await writeFile(resolve(OUT, 'anon', name), `${JSON.stringify(clean, null, 2)}\n`);
    }
}

console.log(`responses: ${responses.length} (${responses.length - text} JSON, ${text} string)`);
console.log(
    `written: ${responses.length} to fixtures/full/postman${anonymize ? `, ${responses.length} to fixtures/full/anon` : ''}`
);
if (unsafe > 0) console.warn(`warning: ${unsafe} integers beyond 2^53 were rounded by JSON.parse`);
