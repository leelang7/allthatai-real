/**
 * 딥보이스 탐지 — 아직 제공하지 않는다.
 *
 * 카테고리 페이지는 분석 버튼을 렌더하지 않으므로 정상 사용자는 여기 오지 않는다.
 * 그래도 라우트를 둔다: [slug].astro 의 apiEndpoint 가 이 경로를 가리키고 있어,
 * 앞으로 누가 버튼 조건을 건드리면 조용한 404 대신 이유 있는 503 이 나가야 한다.
 *
 * 한국어 음성 위조 탐지 모델이 없다. 상용 API(Pindrop·Resemble)는 한국어 정확도가 낮아 쓰지 않는다.
 * 모델이 생기면 이 파일을 모델 서버(SCAM_MODEL_API) 프록시로 바꾸면 된다.
 */
import type { APIRoute } from 'astro';

export const prerender = false;

const body = {
  ok: false,
  error: '딥보이스 탐지는 아직 제공하지 않습니다',
  reason: 'model_not_available',
  detail: '한국어 음성 위조 탐지 모델 미보유. 출시일 미정.',
  alternatives: { hotline: ['금융감독원 1332', '경찰 112'], available_now: '/verify/auto/' },
};

export const POST: APIRoute = async () =>
  new Response(JSON.stringify(body), { status: 503, headers: { 'Content-Type': 'application/json' } });

export const GET: APIRoute = POST;
