import { readFileSync, mkdirSync, writeFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const API_KEY = "AIzaSyDKRcp4QL_bHaGy78zp4SFQg5hSmu5acrg";
const VOICE = "ko-KR-Neural2-A";
const OUTPUT_DIR = join(ROOT, "public", "audio");
const PHRASES_PATH = join(ROOT, "public", "data", "phrases.json");

const TTS_URL = `https://texttospeech.googleapis.com/v1/text:synthesize?key=${API_KEY}`;

async function synthesize(text, id) {
  const body = {
    input: { text },
    voice: {
      languageCode: "ko-KR",
      name: VOICE,
    },
    audioConfig: {
      audioEncoding: "MP3",
      speakingRate: 0.9,
      pitch: 0,
    },
  };

  const res = await fetch(TTS_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`API error for id=${id}: ${res.status} ${err}`);
  }

  const data = await res.json();
  return Buffer.from(data.audioContent, "base64");
}

async function main() {
  const phrases = JSON.parse(readFileSync(PHRASES_PATH, "utf-8"));

  mkdirSync(OUTPUT_DIR, { recursive: true });

  console.log(`총 ${phrases.length}개 문장 변환 시작...\n`);

  let success = 0;
  let skipped = 0;
  let failed = 0;

  for (const phrase of phrases) {
    const outPath = join(OUTPUT_DIR, `phrase_${phrase.id}.mp3`);

    if (existsSync(outPath)) {
      console.log(`[SKIP] phrase_${phrase.id}.mp3 (이미 존재)`);
      skipped++;
      continue;
    }

    try {
      const mp3 = await synthesize(phrase.ko, phrase.id);
      writeFileSync(outPath, mp3);
      console.log(`[OK]   phrase_${phrase.id}.mp3  ${phrase.ko}`);
      success++;
    } catch (err) {
      console.error(`[FAIL] phrase_${phrase.id}: ${err.message}`);
      failed++;
    }

    // API rate limit 방지: 요청 사이 100ms 대기
    await new Promise((r) => setTimeout(r, 100));
  }

  console.log(`\n완료: 성공 ${success}개 / 스킵 ${skipped}개 / 실패 ${failed}개`);
  console.log(`출력 폴더: ${OUTPUT_DIR}`);
}

main().catch((err) => {
  console.error("치명적 오류:", err);
  process.exit(1);
});
