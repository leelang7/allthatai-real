// PoC: full local shorts pipeline — script -> cards (satori) -> narration
// (edge-tts) -> 9:16 mp4 (ffmpeg). No external API. Hardcoded 배민 script first
// to prove the pipeline; LLM script wiring comes next.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';

const ROOT = path.resolve(import.meta.dirname, '../..');
const FDIR = path.join(ROOT, 'node_modules/pretendard/dist/public/static/alternative');
const fonts = [
  { name: 'Pretendard', data: fs.readFileSync(path.join(FDIR, 'Pretendard-Regular.ttf')), weight: 400 as const, style: 'normal' as const },
  { name: 'Pretendard', data: fs.readFileSync(path.join(FDIR, 'Pretendard-Bold.ttf')), weight: 700 as const, style: 'normal' as const },
  { name: 'Pretendard', data: fs.readFileSync(path.join(FDIR, 'Pretendard-ExtraBold.ttf')), weight: 800 as const, style: 'normal' as const },
];

const W = 1080;
const H = 1920;
let BG = 'linear-gradient(150deg, #1E9E5A 0%, #0A4A2C 100%)'; // pitch green (overridable via JSON "bg")

// Channel branding (override via env when handle changes)
const CHANNEL_NAME = process.env.CHANNEL_NAME || 'AllThatAI';
const CHANNEL_HANDLE = process.env.CHANNEL_HANDLE || '@aidoer';

// Auto voice by topic mood: sports/games/tense -> male newscaster, else calm female.
function pickVoice(topic: string): string {
  return /축구|월드컵|게임|공성|스포츠|야구|농구|리그|경기|선수|감독|승부|결승|격투|전쟁|사건|범죄|참사|화재|충돌/.test(topic)
    ? 'ko-KR-InJoonNeural'
    : 'ko-KR-SunHiNeural';
}
const WORK = path.join(ROOT, 'scripts/shorts/_work');
fs.mkdirSync(WORK, { recursive: true });

interface Cut {
  kind: 'hook' | 'tip' | 'cta';
  pill?: string;
  titleLines?: string[];
  highlightLine?: number;
  num?: string;
  head?: string;
  body?: string;
  narration: string;
}

// Hand-written by Claude from verified 퀴라소 headlines (not external LLM).
const SCRIPT: Cut[] = [
  { kind: 'hook', pill: '월드컵 화제', titleLines: ['인구 15만', '섬나라의', '월드컵 기적'], highlightLine: 2,
    narration: '인구 15만 명, 카리브해의 작은 섬나라가 월드컵 데뷔전에서 역사를 썼습니다.' },
  { kind: 'tip', num: '①', head: '독일에 1-7 대패', body: '첫 출전 퀴라소, 우승후보 독일에 1대 7로 크게 졌어요.',
    narration: '결과만 보면 참패였습니다. 우승 후보 독일에 1대 7. 하베르츠가 멀티골을 넣었죠.' },
  { kind: 'tip', num: '②', head: '그래도 첫 골 터졌다', body: '월드컵 데뷔전에서 사상 첫 골! 7골을 먹히면서도 한 골을 만들어냈죠.',
    narration: '그런데 퀴라소는 데뷔전에서 월드컵 사상 첫 골을 터뜨렸습니다. 일곱 골을 먹히면서도 말이죠.' },
  { kind: 'tip', num: '③', head: '감독이 한국 옛 사령탑', body: '퀴라소 감독은 한국을 이끌었던 79세 아드보카트, 역대 최고령.',
    narration: '게다가 이 팀 감독은 과거 한국 대표팀을 맡았던 79세 아드보카트. 월드컵 역대 최고령 감독입니다.' },
  { kind: 'cta', head: '졌지만, 잘 싸웠다', body: '@allthatai',
    narration: '졌지만 박수받은 퀴라소. 작은 나라의 큰 도전이었습니다.' },
];

const flex = (style: Record<string, unknown>, children: unknown) => ({ type: 'div', props: { style: { display: 'flex', ...style }, children } });

function cardTree(cut: Cut, idx: number, total: number, bgVideo = false) {
  const dots = flex({ gap: '22px', alignItems: 'center' },
    Array.from({ length: total }, (_, i) => flex({ width: i === idx ? '64px' : '28px', height: '28px', borderRadius: '100px', background: i === idx ? '#ffffff' : 'rgba(255,255,255,0.4)' }, '')));

  let center: unknown;
  if (cut.kind === 'hook') {
    center = flex({ flexDirection: 'column', alignItems: 'center', gap: '6px' },
      cut.titleLines!.map((t, i) => flex({ fontSize: 138, fontWeight: 800, color: i === cut.highlightLine ? '#FFE15D' : '#ffffff' }, t)));
  } else if (cut.kind === 'tip') {
    center = flex({ flexDirection: 'column', alignItems: 'center', gap: '46px', width: '920px' }, [
      flex({ fontSize: 150, fontWeight: 800, color: '#FFE15D' }, cut.num),
      flex({ fontSize: 92, fontWeight: 800, color: '#ffffff', textAlign: 'center', width: '920px', justifyContent: 'center' }, cut.head),
      flex({ fontSize: 56, fontWeight: 400, color: 'rgba(255,255,255,0.92)', textAlign: 'center', width: '860px', lineHeight: 1.45, justifyContent: 'center' }, cut.body),
    ]);
  } else {
    center = flex({ flexDirection: 'column', alignItems: 'center', gap: '34px', width: '920px' }, [
      flex({ fontSize: 100, fontWeight: 800, color: '#ffffff', textAlign: 'center', width: '920px', justifyContent: 'center' }, cut.head),
      flex({ fontSize: 62, fontWeight: 700, color: '#FFE15D' }, cut.body),
    ]);
  }
  const top = cut.pill
    ? flex({ fontSize: 46, fontWeight: 700, color: '#ffffff', background: 'rgba(255,255,255,0.18)', padding: '20px 44px', borderRadius: '100px' }, cut.pill)
    : flex({ width: '1px', height: '88px' }, ''); // invisible spacer keeps vertical balance
  // Over a video background: transparent card with a dark gradient scrim for
  // text legibility (PNG keeps alpha, composited over the clip in ffmpeg).
  const bg = bgVideo
    ? 'linear-gradient(180deg, rgba(6,20,14,0.30) 0%, rgba(6,20,14,0.45) 45%, rgba(6,20,14,0.80) 100%)'
    : BG;
  return flex({ width: '100%', height: '100%', flexDirection: 'column', justifyContent: 'space-between', alignItems: 'center', padding: '150px 80px', background: bg, fontFamily: 'Pretendard' }, [top, center, dots]);
}

async function renderCard(cut: Cut, idx: number, total: number, out: string, bgVideo = false) {
  const svg = await satori(cardTree(cut, idx, total, bgVideo) as any, { width: W, height: H, fonts });
  fs.writeFileSync(out, new Resvg(svg, { fitTo: { mode: 'width', value: W } }).render().asPng());
}

// Optional AI background clip (Wan/LTX). When set, each card is composited over
// it (scaled+cropped to 1080x1920, looped to cut length).
const BG_VIDEO = process.env.BG_VIDEO && fs.existsSync(process.env.BG_VIDEO) ? process.env.BG_VIDEO : '';

function tts(text: string, out: string, voice = 'ko-KR-SunHiNeural') {
  execFileSync('edge-tts', ['--voice', voice, '--rate', '+8%', '--text', text, '--write-media', out], { stdio: 'ignore' });
}

function durationSec(file: string): number {
  const o = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', file]).toString().trim();
  return parseFloat(o) || 2;
}

// ---- LLM script extraction (Cerebras primary, Gemini fallback) ----
async function llm(system: string, user: string, maxTokens = 1600): Promise<string | null> {
  const cb = process.env.CEREBRAS_API_KEY || '';
  const cbm = process.env.CEREBRAS_MODEL || 'gpt-oss-120b';
  if (cb) {
    try {
      const r = await fetch('https://api.cerebras.ai/v1/chat/completions', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${cb}` },
        body: JSON.stringify({ model: cbm, temperature: 0.5, max_tokens: maxTokens, messages: [{ role: 'system', content: system }, { role: 'user', content: user }] }),
      });
      if (r.ok) { const d = (await r.json()) as any; const t = d?.choices?.[0]?.message?.content?.trim(); if (t) return t; }
      else console.warn('cerebras', r.status);
    } catch (e) { console.warn('cerebras failed', e instanceof Error ? e.message : e); }
  }
  const gk = process.env.GEMINI_API_KEY || '';
  if (gk) {
    try {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${gk}`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents: [{ role: 'user', parts: [{ text: user }] }], generationConfig: { temperature: 0.5, maxOutputTokens: maxTokens } }),
      });
      if (r.ok) { const d = (await r.json()) as any; const t = d?.candidates?.[0]?.content?.parts?.map((p: any) => p.text || '').join('').trim(); if (t) return t; }
    } catch (e) { console.warn('gemini failed', e instanceof Error ? e.message : e); }
  }
  return null;
}

const SHORTS_SYSTEM = `너는 한국어 정보성 쇼츠(9:16) 대본 작가다. 주어진 글을 5컷 대본으로 변환한다.
절대 규칙: 본문에 실제로 있는 내용만 쓴다. 가격·숫자·날짜는 본문 그대로, 본문에 없으면 지어내지 말고 일반적 표현으로.
구성: hook 1개 + tip 3개 + cta 1개.
- hook: { "kind":"hook", "pill":"짧은 라벨(8자내)", "titleLines":["굵은 제목 2~3줄, 각 줄 7자내"], "highlightLine": 강조할 줄 번호(0부터), "narration":"읽어줄 한 문장" }
- tip:  { "kind":"tip", "num":"①", "head":"핵심 한 줄(13자내)", "body":"설명 한 문장(38자내)", "narration":"읽어줄 1~2문장" }  (num은 ①②③ 순서)
- cta:  { "kind":"cta", "head":"행동유도 한 줄(13자내)", "body":"real.allthatai.kr", "narration":"읽어줄 한 문장" }
narration은 자연스러운 입말. 카드 텍스트(head/body/titleLines)는 짧고 굵게.
JSON만 출력: {"cuts":[ ... 5개 ... ]}`;

function articleText(astro: string): string {
  let s = astro.replace(/^---[\s\S]*?---/, '');
  s = s.replace(/<[^>]+>/g, ' ').replace(/\{[^}]*\}/g, ' ');
  s = s.replace(/[#*`>|]/g, ' ').replace(/\s+/g, ' ').trim();
  return s.slice(0, 2200);
}

async function makeScriptLLM(title: string, body: string): Promise<Cut[] | null> {
  const text = await llm(SHORTS_SYSTEM, `제목: ${title}\n\n본문:\n${body}`);
  if (!text) return null;
  const m = text.replace(/```(?:json)?/gi, '').match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const parsed = JSON.parse(m[0]);
    const cuts = parsed?.cuts;
    if (Array.isArray(cuts) && cuts.length >= 3 && cuts.every((c: any) => c.kind && c.narration)) return cuts as Cut[];
  } catch { /* fall through */ }
  return null;
}

// ---- Trending-news mode: 급상승 화제 -> 뉴스 분석 -> 궁금증 해소 5컷 ----
const UA = 'Mozilla/5.0 (compatible; AllThatAIRealBot/1.0; +https://real.allthatai.kr)';

async function trends(): Promise<string[]> {
  const r = await fetch('https://trends.google.com/trending/rss?geo=KR', { headers: { 'User-Agent': UA } });
  const xml = await r.text();
  const out: string[] = [];
  const re = /<title>(?:<!\[CDATA\[)?([^<\]]+)/g;
  let m: RegExpExecArray | null; let skip = true;
  while ((m = re.exec(xml))) { if (skip) { skip = false; continue; } const t = m[1].trim(); if (t) out.push(t); if (out.length >= 15) break; }
  return out;
}

async function news(q: string, max = 6): Promise<string[]> {
  const url = 'https://news.google.com/rss/search?q=' + encodeURIComponent(q + ' when:7d') + '&hl=ko&gl=KR&ceid=KR:ko';
  const r = await fetch(url, { headers: { 'User-Agent': UA } });
  const xml = await r.text();
  const out: string[] = [];
  const itemRe = /<item>([\s\S]*?)<\/item>/g;
  let m: RegExpExecArray | null;
  while ((m = itemRe.exec(xml)) && out.length < max) {
    const t = m[1].match(/<title>(?:<!\[CDATA\[)?([^<\]]+)/)?.[1]?.trim();
    if (t) out.push(t);
  }
  return out;
}

const SHORTS_NEWS_SYSTEM = `지금 한국에서 검색 급상승 중인 키워드와 관련 최신 뉴스 헤드라인을 준다.
이 화제가 "왜 떴는지" 뉴스 사실에 근거해 사람들이 궁금해할 핵심을 9:16 쇼츠 5컷 대본으로 만든다.
규칙: 뉴스 헤드라인에 드러난 사실만. 추측·날조 금지. 단순 개인 사생활/가십/연애/사망 자극성뿐이면 {"skip":true} 만 출력.
구성: hook 1 + tip 3 + cta 1.
- hook: { "kind":"hook", "pill":"짧은 라벨(8자내)", "titleLines":["굵은 제목 2~3줄, 각 줄 7자내"], "highlightLine":강조줄(0부터), "narration":"읽어줄 한 문장(궁금증 유발)" }
- tip:  { "kind":"tip", "num":"①", "head":"핵심 한 줄(13자내)", "body":"뉴스 사실 한 문장(40자내)", "narration":"읽어줄 1~2문장" }
- cta:  { "kind":"cta", "head":"한 줄 마무리", "body":"@allthatai", "narration":"읽어줄 한 문장" }
또한 "bgPrompt": 영상 배경용 시네마틱 영어 프롬프트 1개 — 주제와 어울리는 실사 풍경/장면(인물·글자·로고 없이), 끝에 "slow smooth camera, photorealistic, highly detailed" 포함.
  예) 축구 화제 → "Cinematic aerial shot of a green football stadium pitch at night under bright lights, slow smooth camera, photorealistic, highly detailed"
JSON만: {"cuts":[ ...5개 ... ], "bgPrompt":"..."} 또는 {"skip":true}`;

const DEMO_BG = 'Cinematic aerial drone shot flying low over a small tropical island in turquoise Caribbean sea, white sand beach, gentle waves, palm trees, warm golden hour, slow smooth camera, photorealistic, highly detailed';

function seenTopics(): Set<string> {
  const seen = new Set<string>();
  try {
    const pf = path.join(ROOT, 'scripts/shorts/pending.jsonl');
    if (fs.existsSync(pf)) {
      for (const ln of fs.readFileSync(pf, 'utf8').split('\n')) {
        if (ln.trim()) { try { const o = JSON.parse(ln); if (o.topic) seen.add(String(o.topic)); } catch { /* */ } }
      }
    }
  } catch { /* */ }
  return seen;
}

async function loadScript(): Promise<{ cuts: Cut[]; src: string; bgPrompt?: string; topic?: string; tags?: string[]; link?: string }> {
  if (process.argv[2] === 'demo') return { cuts: SCRIPT, src: 'demo(클로드 직접 작성)', bgPrompt: DEMO_BG, topic: '퀴라소' };
  // Curated mode: a JSON I (Claude) hand-write — {topic, tags, bgPrompt, cuts:[...]}.
  // No external LLM picks the topic. This is the quality-first path.
  if (process.argv[2] && process.argv[2].endsWith('.json')) {
    const d = JSON.parse(fs.readFileSync(path.resolve(process.argv[2]), 'utf8'));
    return { cuts: d.cuts, src: d.topic || 'curated', bgPrompt: d.bgPrompt, topic: d.topic, tags: d.tags, link: d.link, bg: d.bg };
  }
  const seen = seenTopics(); // skip topics already produced (cross-run dedup)
  const kws = await trends();
  console.log('급상승:', kws.slice(0, 10).join(', '));
  for (const kw of kws.slice(0, 12)) {
    if (seen.has(kw)) { console.log(`  dedup skip: ${kw}`); continue; }
    const ns = await news(kw);
    if (!ns.length) continue;
    const text = await llm(SHORTS_NEWS_SYSTEM, `급상승 키워드: ${kw}\n\n관련 뉴스 헤드라인:\n${ns.map((n, i) => `${i + 1}. ${n}`).join('\n')}`);
    if (!text) continue;
    const m = text.replace(/```(?:json)?/gi, '').match(/\{[\s\S]*\}/);
    let p: any = null; try { p = m && JSON.parse(m[0]); } catch { /* */ }
    if (!p) continue;
    if (p.skip) { console.log(`  skip(가십/저가치): ${kw}`); continue; }
    if (Array.isArray(p.cuts) && p.cuts.length >= 4 && p.cuts.every((c: any) => c.kind && c.narration)) {
      // Hard reject politics/news/crime — check keyword + generated text
      const blob = kw + ' ' + ns.join(' ') + ' ' + p.cuts.map((c: any) => `${c.head || ''}${c.body || ''}${c.narration || ''}`).join(' ');
      if (BLOCK.test(blob)) { console.log(`  block(정치/언론/사건): ${kw}`); continue; }
      console.log(`  picked: ${kw}`);
      return { cuts: p.cuts as Cut[], src: `news:${kw}`, bgPrompt: typeof p.bgPrompt === 'string' ? p.bgPrompt : undefined, topic: kw };
    }
  }
  return { cuts: SCRIPT, src: 'demo', bgPrompt: DEMO_BG, topic: '퀴라소' };
}

async function main() {
  const { cuts: script, src, bgPrompt, topic, tags, link, bg } = await loadScript() as any;
  if (bg) BG = bg; // JSON "bg" 그라디언트로 주제별 배경색 override (Wan 안 쓸 때)
  console.log(`script: ${src} (${script.length} cuts)`);
  const voice = pickVoice(topic || src);
  console.log(`voice: ${voice}`);
  // Brand the CTA card with the real channel
  for (const c of script) {
    if (c.kind === 'cta') { c.head = `${CHANNEL_NAME} 구독`; c.body = CHANNEL_HANDLE; }
  }
  // Background: explicit BG_VIDEO env wins; else auto-generate from bgPrompt via Wan.
  let bgVideo = BG_VIDEO;
  if (!bgVideo && bgPrompt) {
    const auto = path.join(ROOT, 'scripts/shorts/_bg_auto.mp4');
    // 한국 앵커 강제: Wan(중국 모델)이 서양인·외국 지폐를 뱉지 않게 모든 배경을 한국화.
    // 돈이 등장하는 장면은 외화 대신 한국 원화(5만원권)로 못박는다.
    const kr = ', set in South Korea, Korean East-Asian people, modern Korean setting, clean text-free background, no signage no letters';
    const money = /\b(money|cash|banknote|coin|bill|won|currency)\b/i.test(bgPrompt)
      ? ', South Korean won banknotes (50000 won, blue and yellow notes), no foreign currency' : '';
    const bgKr = bgPrompt.replace(/\.\s*$/, '') + kr + money;
    console.log('Wan 배경 자동생성(한국화):', bgKr.slice(0, 70), '…');
    try {
      execFileSync('python', ['scripts/shorts/gen_wan.py', bgKr, auto, '480', '832', '81', '25'], { stdio: 'inherit' });
      if (fs.existsSync(auto)) bgVideo = auto;
    } catch (e) {
      console.warn('Wan 배경 생성 실패 — 단색 배경으로 폴백:', e instanceof Error ? e.message : e);
    }
  }
  const total = script.length;
  const clips: string[] = [];
  for (let i = 0; i < total; i++) {
    const cut = script[i];
    const png = path.join(WORK, `card_${i}.png`);
    const mp3 = path.join(WORK, `aud_${i}.mp3`);
    const clip = path.join(WORK, `clip_${i}.mp4`);
    await renderCard(cut, i, total, png, !!bgVideo);
    tts(cut.narration, mp3, voice);
    const dur = durationSec(mp3) + 0.6; // small tail
    if (bgVideo) {
      // AI background clip (16fps) → motion-interpolate to 30fps so it doesn't
      // stutter, then scale/crop 9:16 + transparent card overlay + narration.
      execFileSync('ffmpeg', [
        '-y', '-stream_loop', '-1', '-i', bgVideo, '-loop', '1', '-i', png, '-i', mp3,
        '-filter_complex',
        "[0:v]minterpolate=fps=30:mi_mode=blend,scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1[bg];[bg][1:v]overlay=0:0:format=auto[v]",
        '-map', '[v]', '-map', '2:a', '-t', dur.toFixed(2), '-r', '30',
        '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-ar', '44100', '-shortest', clip,
      ], { stdio: 'ignore' });
    } else {
      // still gradient card + narration (Ken Burns slow zoom)
      execFileSync('ffmpeg', [
        '-y', '-loop', '1', '-i', png, '-i', mp3,
        '-t', dur.toFixed(2), '-r', '30',
        '-vf', `scale=1080:1920,zoompan=z='min(zoom+0.0005,1.035)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${Math.round(dur * 30)}:s=1080x1920:fps=30,format=yuv420p`,
        '-c:v', 'libx264', '-c:a', 'aac', '-ar', '44100', '-af', 'apad',
        '-shortest', clip,
      ], { stdio: 'ignore' });
    }
    clips.push(clip);
    console.log(`cut ${i + 1}/${total} (${cut.kind}) ${dur.toFixed(1)}s`);
  }
  const list = path.join(WORK, 'list.txt');
  fs.writeFileSync(list, clips.map((c) => `file '${c.replace(/\\/g, '/')}'`).join('\n'));
  // Preserve every render: out/<topic>_<timestamp>.mp4 (no overwrite). Also copy
  // to _sample.mp4 as a latest-quick-look.
  const outDir = path.join(ROOT, 'scripts/shorts/out');
  fs.mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[-:T.]/g, '').slice(0, 14);
  const safe = src.replace(/[^\w가-힣]+/g, '_').replace(/^_|_$/g, '').slice(0, 40) || 'short';
  const outMp4 = path.join(outDir, `${safe}_${stamp}.mp4`);
  execFileSync('ffmpeg', ['-y', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', outMp4], { stdio: 'ignore' });
  fs.copyFileSync(outMp4, path.join(ROOT, 'scripts/shorts/_sample.mp4'));
  // Sidecar tags file — upload_youtube.py reads <video>.tags.json automatically,
  // so curated tags ride along to YouTube without any manual set_tags step.
  if (tags && tags.length) fs.writeFileSync(outMp4 + '.tags.json', JSON.stringify(tags, null, 0), 'utf8');
  // CTA 딥링크 사이드카 — upload_youtube.py가 <video>.link.txt를 읽어 설명 첫 줄에 자동 삽입.
  if (link) fs.writeFileSync(outMp4 + '.link.txt', link, 'utf8');
  console.log('wrote', outMp4, (fs.statSync(outMp4).size / 1024).toFixed(0), 'KB,', durationSec(outMp4).toFixed(1), 's total');
  // machine-readable result line for the daily orchestrator
  const hookTitle = (script.find((c) => c.kind === 'hook')?.titleLines || []).join(' ').trim();
  console.log('RESULT ' + JSON.stringify({ mp4: outMp4, title: hookTitle || src, topic: topic || src, tags: tags || [] }));
}

main();
