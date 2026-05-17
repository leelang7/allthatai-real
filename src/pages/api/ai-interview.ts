/**
 * /api/ai-interview — AI 면접 질문 + 답변 가이드.
 *
 * 입력: POST { jobTitle, company, jobDescription, experience, type }
 * 출력: { ok, questions[{question, intent, answerFramework, tips}] }
 */
import type { APIRoute } from 'astro';

export const prerender = false;

const SYSTEM = `당신은 한국 채용 면접 코칭 전문가입니다.
사용자의 지원 정보를 받아 실제 면접에서 나올 수 있는 질문과 답변 전략을 제시합니다.

원칙:
1. 직무·회사·경력 수준에 맞춤
2. 한국 면접 문화 반영 (인성 + 직무 + 회사 적합도 균형)
3. 질문 의도 명시 (면접관이 무엇을 평가하려는지)
4. 답변 프레임워크 (STAR 등) + 실제 예시 방향
5. 흔한 함정 + 차별화 포인트

응답은 JSON ONLY:
{
  "questions": [
    {
      "category": "인성" | "직무" | "회사 적합도" | "압박" | "역량",
      "question": "면접 질문",
      "intent": "면접관 의도 (왜 묻는가)",
      "answerFramework": "답변 구조 가이드",
      "tips": ["주의점 1", "차별화 포인트 1"],
      "exampleAngle": "참고할 답변 방향성 (실제 답변 대신)"
    }
  ],
  "overallTips": ["전체 면접 팁 1", ...],
  "redFlags": ["피해야 할 답변 패턴 1", ...]
}

질문 개수: 10~12개. 카테고리 균형 분배.`;

export const POST: APIRoute = async ({ request }) => {
  const apiKey = (import.meta.env as any).GEMINI_API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ ok: false, error: 'GEMINI_API_KEY 미설정' }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }

  let body: any;
  try { body = await request.json(); }
  catch { return new Response(JSON.stringify({ ok: false, error: 'Invalid JSON' }), { status: 400 }); }

  const jobTitle = (body?.jobTitle || '').toString().trim();
  const company = (body?.company || '').toString().trim();
  const jobDescription = (body?.jobDescription || '').toString().trim();
  const experience = (body?.experience || 'junior').toString();
  const type = (body?.type || 'general').toString();

  if (!jobTitle) {
    return new Response(JSON.stringify({ ok: false, error: '직무 입력 필수' }), { status: 400 });
  }

  const expLabel = { 'newgrad': '신입', 'junior': '주니어 (1~3년)', 'mid': '미들 (3~7년)', 'senior': '시니어 (7년+)' }[experience] || '주니어';
  const typeLabel = type === 'tech' ? '기술 면접' : type === 'hr' ? '인사 면접' : type === 'final' ? '임원 면접' : '종합 면접';

  const userMsg = `지원 정보:
- 직무: ${jobTitle}
- 회사: ${company || '(미입력)'}
- 직무 설명/요구사항: ${jobDescription || '(미입력)'}
- 경력 수준: ${expLabel}
- 면접 유형: ${typeLabel}

위 정보로 한국 면접에서 나올 만한 질문 10~12개를 생성하세요.`;

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${apiKey}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM }] },
        contents: [{ role: 'user', parts: [{ text: userMsg }] }],
        generationConfig: { temperature: 0.5, maxOutputTokens: 4000, responseMimeType: 'application/json' },
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      return new Response(JSON.stringify({ ok: false, error: `Gemini ${res.status}`, detail: errText.slice(0, 300) }), {
        status: 502, headers: { 'Content-Type': 'application/json' },
      });
    }

    const data = await res.json() as any;
    const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    let parsed: any;
    try { parsed = JSON.parse(reply); }
    catch {
      const cleaned = reply.replace(/```json|```/g, '').trim();
      try { parsed = JSON.parse(cleaned); }
      catch {
        return new Response(JSON.stringify({ ok: false, error: 'JSON 파싱 실패', raw: reply.slice(0, 300) }), {
          status: 502, headers: { 'Content-Type': 'application/json' },
        });
      }
    }

    return new Response(JSON.stringify({ ok: true, ...parsed }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: e instanceof Error ? e.message : 'fetch failed' }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
};
