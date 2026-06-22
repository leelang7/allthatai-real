// VERIFY: trending keyword -> news analysis -> "why is this hot + curiosity
// shorts script". Proves the discovery->content engine before any visuals.
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

async function llm(system: string, user: string): Promise<string | null> {
  const cb = process.env.CEREBRAS_API_KEY || '';
  const cbm = process.env.CEREBRAS_MODEL || 'gpt-oss-120b';
  if (!cb) return null;
  const r = await fetch('https://api.cerebras.ai/v1/chat/completions', {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${cb}` },
    body: JSON.stringify({ model: cbm, temperature: 0.4, max_tokens: 1200, messages: [{ role: 'system', content: system }, { role: 'user', content: user }] }),
  });
  if (!r.ok) { console.warn('llm', r.status, (await r.text()).slice(0, 150)); return null; }
  const d = (await r.json()) as any;
  return d?.choices?.[0]?.message?.content?.trim() || null;
}

const SYS = `지금 한국에서 검색 급상승 중인 키워드와 관련 최신 뉴스 헤드라인을 준다.
이 화제가 "왜 떴는지" 뉴스에 근거해 사람들이 궁금해할 핵심을 정리하고, 9:16 쇼츠 대본을 만든다.

규칙:
- 뉴스 헤드라인에 실제로 드러난 사실만. 추측·날조 금지. 근거 약하면 hook을 질문형으로.
- 단순 개인 사생활/가십/연애/사망 등 자극성뿐이면 {"skip":true,"reason":"..."} 만 출력.
- 정보가치(스포츠 성과, 신기술/AI, 사건사고 배경, 제품/서비스, 정책)가 있으면 대본 생성.

출력 JSON만:
{"topic":"한 줄 주제","why":"왜 화제인지 1문장(뉴스근거)","hook":"궁금증 유발 한 줄(예: '페이커가 또? 무슨 일')","cuts":["컷1 핵심","컷2","컷3","컷4 정리/한줄결론"]}`;

async function main() {
  const ts = await trends();
  console.log('급상승 TOP:', ts.slice(0, 10).join(', '), '\n');
  const picks = ts.slice(0, 6);
  for (const kw of picks) {
    const ns = await news(kw);
    if (ns.length === 0) { console.log(`■ ${kw} — 관련 뉴스 없음, 패스\n`); continue; }
    const out = await llm(SYS, `급상승 키워드: ${kw}\n\n관련 뉴스 헤드라인:\n${ns.map((n, i) => `${i + 1}. ${n}`).join('\n')}`);
    if (!out) { console.log(`■ ${kw} — LLM 실패\n`); continue; }
    const m = out.replace(/```(?:json)?/gi, '').match(/\{[\s\S]*\}/);
    let p: any = null; try { p = m && JSON.parse(m[0]); } catch { /* */ }
    if (!p) { console.log(`■ ${kw} — 파싱 실패: ${out.slice(0, 120)}\n`); continue; }
    if (p.skip) { console.log(`■ ${kw} — SKIP (${p.reason || '가십/저가치'})\n`); continue; }
    console.log(`★ ${kw}`);
    console.log(`  주제: ${p.topic}`);
    console.log(`  왜:   ${p.why}`);
    console.log(`  훅:   ${p.hook}`);
    console.log(`  대본: ${(p.cuts || []).map((c: string, i: number) => `\n        ${i + 1}. ${c}`).join('')}\n`);
  }
}

main();
