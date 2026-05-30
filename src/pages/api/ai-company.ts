/**
 * /api/ai-company — AI 회사 분석 (평판·연봉·문화).
 */
import type { APIRoute } from 'astro';

export const prerender = false;

const SYSTEM = `당신은 한국 채용 시장 분석가입니다. 회사명 + 직무 → 평판·연봉·문화·전망 분석.

응답 JSON ONLY:
{
  "companyName": "회사명",
  "industry": "산업",
  "size": "규모 (대기업/중견/중소/스타트업)",
  "overallScore": 0-100,
  "verdict": "추천|중립|주의",
  "salaryRange": {"junior": "주니어 연봉 범위 (원)", "mid": "미들", "senior": "시니어"},
  "benefits": ["복지 1", ...],
  "culture": {"workLifeBalance": "워라밸 평가", "hierarchy": "수직성", "growth": "성장 기회"},
  "pros": ["장점 1", ...],
  "cons": ["단점 1", ...],
  "knownIssues": ["알려진 이슈 1", ...],
  "businessOutlook": "사업 전망",
  "interviewTips": ["면접 팁 1", ...],
  "competitors": ["경쟁사 1", ...]
}`;

export const POST: APIRoute = async ({ request }) => {
  const apiKey = (import.meta.env as any).GEMINI_API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) return new Response(JSON.stringify({ ok: false, error: 'GEMINI_API_KEY 미설정' }), { status: 500 });
  let body: any; try { body = await request.json(); } catch { return new Response(JSON.stringify({ ok: false, error: 'Invalid JSON' }), { status: 400 }); }
  const company = (body?.company || '').toString().trim();
  const role = body?.role || '';
  const focus = body?.focus || 'all';
  if (!company) return new Response(JSON.stringify({ ok: false, error: '회사명 필수' }), { status: 400 });

  const focusLabel = focus === 'salary' ? '연봉·복지 중심' : focus === 'culture' ? '문화·워라밸 중심' : focus === 'growth' ? '성장·전망 중심' : '종합';
  const userMsg = `회사 분석:
- 회사: ${company}
- 직무 (있다면): ${role || '미입력'}
- 분석 초점: ${focusLabel}

2026년 한국 시장 맥락에서 분석하세요. 정보가 부족하면 일반적 추정 + "확인 필요" 표시.`;

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
    const res = await fetch(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM }] },
        contents: [{ role: 'user', parts: [{ text: userMsg }] }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 2500, thinkingConfig: { thinkingBudget: 0 }, responseMimeType: 'application/json' },
      }),
    });
    if (!res.ok) return new Response(JSON.stringify({ ok: false, error: `Gemini ${res.status}` }), { status: 502 });
    const data = await res.json() as any;
    const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    let parsed: any;
    try { parsed = JSON.parse(reply); }
    catch { try { parsed = JSON.parse(reply.replace(/```json|```/g, '').trim()); } catch { return new Response(JSON.stringify({ ok: false, error: 'JSON 파싱 실패' }), { status: 502 }); } }
    return new Response(JSON.stringify({ ok: true, ...parsed }), { headers: { 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: e instanceof Error ? e.message : 'fetch failed' }), { status: 500 });
  }
};
