#!/usr/bin/env node

/**
 * translate.js – Translate locale files using the OpenAI API.
 *
 * Usage:
 *   node scripts/translate.js            # Translate all non-English locales
 *   node scripts/translate.js --lang fr  # Translate only French
 *
 * Requires:
 *   - A .env file in the project root with OPENAI_API_KEY=sk-...
 *   - locales/en.json (source of truth)
 *   - locales/languages.json (defines target locales)
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const ROOT = path.resolve(__dirname, '..');
const LOCALES_DIR = path.join(ROOT, 'locales');
const ENV_PATH = path.join(ROOT, '.env');

// ── Parse .env for OPENAI_API_KEY ────────────────────────────────────────────

function loadApiKey() {
  try {
    const envContent = fs.readFileSync(ENV_PATH, 'utf8');
    const match = envContent.match(/^OPENAI_API_KEY\s*=\s*(.+)$/m);
    if (match) return match[1].trim().replace(/^["']|["']$/g, '');
  } catch {}
  if (process.env.OPENAI_API_KEY) return process.env.OPENAI_API_KEY;
  console.error('Error: OPENAI_API_KEY not found. Add it to .env or set as env var.');
  process.exit(1);
}

// ── Load JSON files ──────────────────────────────────────────────────────────

function loadJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function saveJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

// ── OpenAI API call ──────────────────────────────────────────────────────────

function callOpenAI(apiKey, messages, model = 'gpt-4o-mini') {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ model, messages, temperature: 0.2 });

    const options = {
      hostname: 'api.openai.com',
      port: 443,
      path: '/v1/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'Content-Length': Buffer.byteLength(body),
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.error) {
            reject(new Error(`OpenAI API error: ${json.error.message}`));
          } else {
            const content = json.choices?.[0]?.message?.content;
            resolve(content);
          }
        } catch (e) {
          reject(new Error(`Failed to parse OpenAI response: ${e.message}`));
        }
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ── Translate a batch of strings ─────────────────────────────────────────────

async function translateBatch(apiKey, sourceJson, targetLang, targetName) {
  const systemPrompt = [
    `You are a professional translator. Translate the following JSON object values from English to ${targetName} (${targetLang}).`,
    '',
    'Rules:',
    '- Keep all JSON keys EXACTLY as they are (do not translate keys).',
    '- Only translate the values.',
    '- Keep HTML tags like <code>, <strong>, <span>, &amp;, &ndash;, &mdash;, &rarr; intact and untranslated.',
    '- Keep placeholders like {count}, {size}, {distro}, {version}, {tool}, etc. intact.',
    '- Keep technical terms like WSL, VHDX, TRIM, fstrim, Optimize-VHD, npm, pip, etc. untranslated.',
    '- Keep emoji characters (✓, ✗, ══, ──) untranslated.',
    '- Return ONLY valid JSON. No markdown fencing, no explanation.',
  ].join('\n');

  const sourceStr = JSON.stringify(sourceJson, null, 2);

  // Check if the content is too large and needs to be split
  const MAX_CHARS = 12000; // conservative limit per batch
  if (sourceStr.length <= MAX_CHARS) {
    const response = await callOpenAI(apiKey, [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: sourceStr },
    ]);
    return JSON.parse(cleanJsonResponse(response));
  }

  // Split into batches by keys
  const keys = Object.keys(sourceJson);
  const batches = [];
  let currentBatch = {};
  let currentSize = 2; // for {}

  for (const key of keys) {
    const entry = JSON.stringify({ [key]: sourceJson[key] });
    if (currentSize + entry.length > MAX_CHARS && Object.keys(currentBatch).length > 0) {
      batches.push(currentBatch);
      currentBatch = {};
      currentSize = 2;
    }
    currentBatch[key] = sourceJson[key];
    currentSize += entry.length + 2; // comma + newline
  }
  if (Object.keys(currentBatch).length > 0) {
    batches.push(currentBatch);
  }

  console.log(`  Splitting into ${batches.length} batches...`);
  const merged = {};

  for (let i = 0; i < batches.length; i++) {
    console.log(`  Batch ${i + 1}/${batches.length} (${Object.keys(batches[i]).length} keys)...`);
    const response = await callOpenAI(apiKey, [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: JSON.stringify(batches[i], null, 2) },
    ]);
    const parsed = JSON.parse(cleanJsonResponse(response));
    Object.assign(merged, parsed);
  }

  return merged;
}

/**
 * Strip markdown code fences if the model wraps the response.
 */
function cleanJsonResponse(response) {
  let cleaned = response.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
  }
  return cleaned;
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  let targetLangCode = null;

  // Parse --lang flag
  const langIdx = args.indexOf('--lang');
  if (langIdx !== -1 && args[langIdx + 1]) {
    targetLangCode = args[langIdx + 1];
  }

  const apiKey = loadApiKey();
  const languages = loadJson(path.join(LOCALES_DIR, 'languages.json'));
  const sourceLocale = languages.sourceLocale || 'en';
  const enJson = loadJson(path.join(LOCALES_DIR, `${sourceLocale}.json`));

  const targets = languages.locales.filter(l => l.code !== sourceLocale);

  if (targetLangCode) {
    const found = targets.find(l => l.code === targetLangCode);
    if (!found) {
      console.error(`Language "${targetLangCode}" not found in languages.json.`);
      console.error(`Available: ${targets.map(l => l.code).join(', ')}`);
      process.exit(1);
    }
    await translateOne(apiKey, enJson, found);
  } else {
    console.log(`Translating ${targets.length} languages...`);
    for (const lang of targets) {
      await translateOne(apiKey, enJson, lang);
    }
    console.log('\nAll translations complete.');
  }
}

async function translateOne(apiKey, enJson, lang) {
  const outPath = path.join(LOCALES_DIR, `${lang.code}.json`);
  console.log(`\nTranslating to ${lang.name} (${lang.code})...`);

  // If existing translation exists, only translate new/changed keys
  let existingJson = {};
  try { existingJson = loadJson(outPath); } catch {}

  // Find keys that need translation (new or changed in English)
  const keysToTranslate = {};
  for (const [key, value] of Object.entries(enJson)) {
    if (!(key in existingJson)) {
      keysToTranslate[key] = value;
    }
  }

  if (Object.keys(keysToTranslate).length === 0) {
    console.log(`  Already up to date (${Object.keys(existingJson).length} keys).`);
    // Still clean up removed keys
    const cleaned = {};
    for (const key of Object.keys(enJson)) {
      if (key in existingJson) cleaned[key] = existingJson[key];
    }
    if (Object.keys(cleaned).length !== Object.keys(existingJson).length) {
      saveJson(outPath, cleaned);
      console.log(`  Removed ${Object.keys(existingJson).length - Object.keys(cleaned).length} stale keys.`);
    }
    return;
  }

  console.log(`  Translating ${Object.keys(keysToTranslate).length} new keys (${Object.keys(existingJson).length} existing)...`);

  try {
    const translated = await translateBatch(apiKey, keysToTranslate, lang.code, lang.name);

    // Merge with existing, maintaining key order from en.json
    const merged = {};
    for (const key of Object.keys(enJson)) {
      if (key in translated) {
        merged[key] = translated[key];
      } else if (key in existingJson) {
        merged[key] = existingJson[key];
      } else {
        merged[key] = enJson[key]; // fallback to English
      }
    }

    saveJson(outPath, merged);
    console.log(`  Saved ${Object.keys(merged).length} keys to ${lang.code}.json`);
  } catch (err) {
    console.error(`  Translation failed for ${lang.code}: ${err.message}`);
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
