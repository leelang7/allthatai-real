/**
 * /api/bisol-join — [비솔] AI 융합 전문가 양성 과정 디스코드에 **실명으로만** 들여보낸다.
 *
 *   POST { name, token }
 *     name  — 한글 2~5자 실명
 *     token — 디스코드 OAuth2(implicit, scope=identify guilds.join) 액세스 토큰
 *
 * 공개 초대 링크는 두지 않는다. 이 길로만 들어오고, 들어올 때 서버 별명을 실명으로 박는다.
 * 서버에서 @everyone·수강생의 '별명 변경' 권한을 빼 두었으므로 본인이 못 바꾼다.
 * 다시 들어오면(이미 멤버) 이름만 고친다. 들어오거나 이름을 고칠 때마다 운영진 채널에 한 줄 남긴다.
 *
 * 환경변수: BISOL_DISCORD_BOT_TOKEN (봇 '비솔 관리봇')
 */
import type { APIRoute } from 'astro';

export const prerender = false;

const API = 'https://discord.com/api/v10';
const GUILD = '1574546249439383663';
const ROLE_STUDENT = '1574551865327091826';
const CH_STAFF = '1574551893349507113';   // 🔒 운영 · 운영진
const CH_LANDING = '1574551873472700488'; // 📢 안내 · 공지
const NAME_RE = /^[가-힣]{2,5}$/;

function env(name: string): string | undefined {
  return (import.meta.env as any)[name] || (process.env as any)[name];
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });

async function bot(method: string, path: string, bot: string, body?: unknown) {
  return fetch(API + path, {
    method,
    headers: {
      Authorization: `Bot ${bot}`,
      'Content-Type': 'application/json',
      'User-Agent': 'DiscordBot (https://real.allthatai.kr, 1.0)',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

export const POST: APIRoute = async ({ request }) => {
  const BOT = env('BISOL_DISCORD_BOT_TOKEN');
  if (!BOT) return json({ ok: false, error: '서버 설정이 아직 안 끝났습니다. 강사에게 알려 주세요.' }, 500);

  let name = '', token = '';
  try {
    const b = await request.json();
    name = String(b?.name ?? '').replace(/\s+/g, '');
    token = String(b?.token ?? '');
  } catch {
    return json({ ok: false, error: '요청을 읽지 못했습니다.' }, 400);
  }
  if (!NAME_RE.test(name)) return json({ ok: false, error: '실명을 한글 2~5자로 적어 주세요.' }, 400);
  if (!/^[\w.-]{10,200}$/.test(token)) return json({ ok: false, error: '디스코드 승인 정보가 없습니다. 다시 눌러 주세요.' }, 400);

  // 누가 승인했는지 — 토큰 주인
  const meRes = await fetch(API + '/users/@me', { headers: { Authorization: `Bearer ${token}` } });
  if (!meRes.ok) return json({ ok: false, error: '디스코드 승인이 만료됐습니다. 다시 눌러 주세요.' }, 401);
  const me: any = await meRes.json();
  const uid = String(me.id);
  const handle = me.global_name ? `${me.global_name} (@${me.username})` : `@${me.username}`;

  // 서버에 넣기 — 새로 들어오면 201, 이미 멤버면 204(이때 nick·roles 는 무시된다)
  const put = await bot('PUT', `/guilds/${GUILD}/members/${uid}`, BOT, {
    access_token: token,
    nick: name,
    roles: [ROLE_STUDENT],
  });
  if (put.status !== 201 && put.status !== 204) {
    const t = await put.text().catch(() => '');
    console.error('BISOL-JOIN-ERR', put.status, t.slice(0, 300));
    return json({ ok: false, error: `서버에 넣지 못했습니다(${put.status}). 강사에게 알려 주세요.` }, 502);
  }
  const already = put.status === 204;

  let prevNick: string | null = null;
  if (already) {
    const cur = await bot('GET', `/guilds/${GUILD}/members/${uid}`, BOT);
    if (cur.ok) prevNick = ((await cur.json()) as any).nick ?? null;
    // 서버장·강사는 이 길로 이름을 바꾸지 않는다(봇보다 위 역할이면 어차피 403).
    const patch = await bot('PATCH', `/guilds/${GUILD}/members/${uid}`, BOT, { nick: name });
    if (!patch.ok && patch.status !== 403) {
      const t = await patch.text().catch(() => '');
      console.error('BISOL-JOIN-NICK-ERR', patch.status, t.slice(0, 300));
      return json({ ok: false, error: '이름을 고치지 못했습니다. 강사에게 알려 주세요.' }, 502);
    }
    await bot('PUT', `/guilds/${GUILD}/members/${uid}/roles/${ROLE_STUDENT}`, BOT);
  }

  // 운영진 채널에 한 줄(소리 없이) — 명단 확인용
  const line = already
    ? (prevNick === name ? `🔁 다시 확인: **${name}** · ${handle}` : `✏️ 이름 변경: ${prevNick ?? '(없음)'} → **${name}** · ${handle}`)
    : `🙋 새 수강생: **${name}** · ${handle} · <@${uid}>`;
  await bot('POST', `/channels/${CH_STAFF}/messages`, BOT, {
    content: line,
    allowed_mentions: { parse: [] },
    flags: 4096,
  }).catch(() => {});

  return json({
    ok: true,
    already,
    url: `https://discord.com/channels/${GUILD}/${CH_LANDING}`,
  });
};

export const GET: APIRoute = () => json({ ok: false, error: 'POST 만 받습니다.' }, 405);
