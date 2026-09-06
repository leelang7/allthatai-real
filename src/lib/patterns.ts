/**
 * 알려진 수법 패턴 — 공적 기록으로는 반증할 수 없지만 형태로 잡히는 것들.
 *
 * `scam-models/crosscheck/patterns.py` 의 TypeScript 판이다. 두 경로(홈 PC 모델 서버,
 * 여기 축소 모드)가 같은 답을 내야 하고, `scam-models/tests/test_parity.py` 가 그것을
 * 고정한다. **한쪽만 고치면 그 테스트가 깨진다. 그게 목적이다.**
 *
 * ## 왜 필요한가 (2026-09-06 레드팀 실측)
 *
 * 경보는 두 갈래뿐이었다 — 공적 기록과의 반증, 그리고 로맨스 각본 4단계 이상.
 * 정상 8건에 오탐 0 이라는 좋은 성적을 내면서 **사기 7건 중 5건을 놓쳤고**, 놓친 것에
 * 국내에서 가장 흔한 두 가지가 들어 있었다.
 *
 *   가족·지인 사칭(메신저피싱)  "엄마 나 폰 액정 깨져서 친구폰이야. 180만원만 보내줘"
 *   대출빙자 선입금            "신용등급 상향 작업비 200만원 입금하면 한도가 열립니다"
 *
 * ## 오탐을 막는 방법 — 단일 신호를 절대 쓰지 않는다
 *
 * 세 신호가 **모두** 있을 때만 잡는다. 느슨하게 풀면 정상 가족 대화와 정상 대출 안내가
 * 그대로 걸린다. 배우자 호칭(여보·자기)은 일부러 넣지 않았다 — 실제 부부의 해외 출장
 * 대화가 걸린다.
 */

import { extract } from './claims';

export interface PatternCheck {
  check: string;
  status: string;
  reason: string;
  data: Record<string, string> | null;
}

/** 가족 호칭. 배우자 호칭은 정상 대화와 구분이 안 돼 제외한다. */
const KIN = /(엄마|어머니|아빠|아버지|누나|언니|오빠|아들|딸|삼촌|이모|고모|외삼촌|할머니|할아버지)/;

/** 신원확인을 회피하는 신호 — 이 수법의 핵심이다. 목소리를 확인당하지 않으려 한다. */
const IDENTITY_EVASION =
  /((폰|휴대폰|핸드폰|전화기|액정)[^.!?]{0,14}(고장|깨졌|깨서|깨져|파손|분실|잃어|먹통|수리|안\s?돼|안\s?됨|안\s?되)|친구\s?폰|친구\s?휴대폰|새\s?번호|번호[가는]?\s?바뀌|바뀐\s?번호|다른\s?번호|임시\s?번호|카톡[^.!?]{0,10}안\s?(돼|됨|되|열)|인증[^.!?]{0,10}안\s?(돼|됨|되)|통화[^.!?]{0,10}안\s?(돼|됨|되)|지금[^.!?]{0,6}통화[^.!?]{0,6}(어려|힘들|안))/;

/** 송금·결제 요구. */
const SEND_MONEY =
  /(송금|이체|입금|보내\s?줄|보내\s?줘|보내주|보내세요|보내 주세요|부치세요|넣어주|부쳐|결제[^.!?]{0,10}(해|부탁|좀)|대신[^.!?]{0,6}(내|결제|처리)|계좌[^.!?]{0,10}(알려|보내|적어)|돈[^.!?]{0,6}(좀|필요|부탁))/;

const LOAN_CONTEXT = /(대출|한도|저신용|신용\s?등급|대환|승인|자금\s?융통|햇살론|정책\s?자금)/;

/** 대출을 미끼로 먼저 받아 가는 명목들. 정상 금융회사는 이걸 요구하지 않는다. */
const UPFRONT_FEE =
  /(작업비|전산\s?작업|전산비|보증\s?보험료|보증료|예치금|공증비|선입금|선\s?납|인지대|등급\s?상향|신용[^.!?]{0,6}상향|한도[^.!?]{0,6}(작업|상향)[^.!?]{0,6}(비|료|금)|수수료[^.!?]{0,8}(입금|송금|납부|먼저|선))/;

/**
 * 국제소포·통관비 선입금. 로맨스 스캠의 마지막 단계가 흔히 이 형태인데, 사용자가 대화
 * 앞부분을 빼고 의심스러운 뒷부분만 붙여넣으면 각본 진입 조건이 없어 각본 판정이 0단계로
 * 눌린다(실측 2026-09-06: 5단계 근거를 세 번 찾고도 0단계). 그래서 별도 축으로 잡는다.
 */
const CUSTOMS_CONTEXT =
  /(세관|통관|국제\s?소포|국제\s?특송|외교\s?행낭|EMS|(소포|화물|짐|택배)[^.!?]{0,12}(억류|보류|압류|지연|묶))/;
const CUSTOMS_FEE =
  /(통관\s?(비|료|수수료|대행비)|관세|보관료|대행\s?비|예치금|보증금|해제\s?(비|비용)|반출\s?(비|료))/;

/** 진짜 특송사의 관세 안내(수만원·공식 결제창)와 사기(수백만원·개인 계좌)를 가르는 신호. */
const BIG_KRW = 1_000_000;

// ── 레드팀 2차(2026-09-07)에서 전부 미탐이던 5종 — crosscheck/patterns.py 와 같은 규칙 ──
// 안전 안내문에는 사기 어휘가 그대로 들어간다("은행 직원은 비밀번호를 묻지 않습니다").
// 이 가드를 빼면 진짜 은행 공지가 사칭으로 뒤집힌다.
const NEGATED = /(묻지\s?않|요구하지\s?않|알려주지\s?마|절대[^.!?]{0,12}않|주의하세요|사칭[^.!?]{0,10}(주의|조심)|피해\s?예방)/;

const INVEST_CONTEXT = /(리딩|추천\s?주|종목|수익률|투자|코인|선물|매매|VIP\s?방|리서치|시드|차트|전문가[^.!?]{0,8}(추천|신호|방)|정회원|수익금|급등|단타|스캘핑)/;
const UNREAL_RETURN = /(원금[^.!?]{0,8}(보장|보전)|손실[^.!?]{0,10}(보전|보장|100\s?%)|적중률|하루[^.!?]{0,6}\d+\s?%|일일[^.!?]{0,6}\d+\s?%|상한가|급등주|무조건[^.!?]{0,6}수익)/;
const INVEST_DEMAND = /((가입비|등록비|회원비|입장료|정회원|이용료)[^.!?]{0,12}(입금|송금|만원|원|결제)|(아이디|계정)[^.!?]{0,10}비밀번호|비밀번호[^.!?]{0,10}(알려|보내|입력)|대신[^.!?]{0,6}매매|출금[^.!?]{0,8}수수료)/;

const SUSPICIOUS_URL = /(bit\.ly|is\.gd|han\.gl|me2\.do|url\.kr|tinyurl|goo\.gl|buly\.kr|https?:\/\/[^\s]{0,40}\.(top|shop|xyz|cc|link|site|click|icu|online|store|life)(\/|\b))/i;
const IMPERSONATION_CTX = /(택배|배송|송장|통관|건강보험|공단|국세청|법원|경찰|검찰|카드사|은행|부고|별세|[부모조]친?상|장례|빈소|발인|청첩|초대장|당첨|환급|미납|과태료)/;
const CLICK_INSTALL = /(클릭|눌러|접속|재확인|확인[^.!?]{0,6}(하세요|바랍|해주|부탁)|확인[^.!?]{0,24}https?:\/\/|설치[^.!?]{0,6}(하|해|후|바랍)|앱[^.!?]{0,8}설치|다운[^.!?]{0,6}(로드|받)|열어|조회[^.!?]{0,6}(하|바랍))/;

const LEND_OBJECT = /(통장|체크\s?카드|현금\s?카드|보안\s?카드|OTP|계좌[^.!?]{0,8}(명의|대여|양도))/;
const LEND_ACT = /(대여|양도|빌려|삽니다|매입|사드립|퀵|택배[^.!?]{0,8}(보내|전달)|보내주|전달해|넘기|맡기)/;
const LEND_LURE = /(일당|수당|건당|개당[^.!?]{0,8}만원|즉시[^.!?]{0,6}입금|당일\s?지급|고수익|단순\s?업무|비밀번호)/;

// 출금 선입금 — "수익금이 있는데 먼저 수수료·세금을 내라". 정상 금융기관은 출금액에서 차감한다.
const PAYOUT_HELD = /(수익금|출금|정산금|당첨금|환급금|보상금)[^.!?]{0,16}(대기|보류|정지|묶|막혀|안\s?되|불가)|출금[^.!?]{0,10}(하려면|위해|조건)/;
const PAYOUT_FEE = /(수수료|세금|보증금|예치금|인증비|해지비|전환비)[^.!?]{0,14}(먼저|선|미리|입금|송금|납부)|먼저[^.!?]{0,10}(입금|송금|납부)/;

// 조건을 걸어 압박하는 표현. 이게 있어야 협박이다 — 없으면 그냥 대화다.
const COERCION = /(안\s?보내면|보내지\s?않으면|않으면|싫으면|아니면|시간\s?안에|분\s?안에|마지막\s?기회|경고)/;

const SEXTORT_MEDIA = /(영상|동영상|사진|녹화|화면|캡처)/;
const SEXTORT_THREAT = /(뿌리|유포|퍼트|퍼뜨|공개하|알리겠|보냅니다|보낼\s?겁|연락처[^.!?]{0,12}(확보|목록|다\s?있)|지인[^.!?]{0,10}(한테|에게|들)|가족[^.!?]{0,10}(한테|에게|부터))/;

const FIN_INST_CTX = /([가-힣A-Za-z]{1,10}(은행|저축은행|카드|캐피탈|증권|보험)|금융회사|고객센터|보안팀)/;
const REMOTE_REQ = /(원격[^.!?]{0,10}(지원|제어|프로그램|앱)?|팀뷰어|애니데스크|화면[^.!?]{0,4}공유|안전\s?앱|보안\s?앱|전용\s?앱[^.!?]{0,8}설치|(비밀번호|보안\s?카드|OTP|인증번호)[^.!?]{0,12}(알려|입력|보내|불러|말씀))/;

function hit(re: RegExp, text: string): string {
  const m = re.exec(text);
  return m ? m[0].trim() : '';
}

/**
 * 대화 전체에서 알려진 수법을 찾는다.
 *
 * `demandedExtra` 는 모델 서버 경로의 `money_demand()` 결과를 함께 반영하기 위한 것이다.
 * 축소 모드에서는 `moneyDemand()` 를 넘겨 두 경로의 판정을 맞춘다.
 */
export function detectPatterns(
  messages: string[],
  demandedExtra = false,
  claims?: { account: string[]; amount_krw: number[] },
): PatternCheck[] {
  const joined = messages.filter((m) => String(m).trim()).join(' ');
  if (!joined) return [];

  const demanded = SEND_MONEY.test(joined) || demandedExtra;
  const cl = claims ?? extract(joined);
  const out: PatternCheck[] = [];

  const kin = hit(KIN, joined);
  const evasion = hit(IDENTITY_EVASION, joined);
  if (kin && evasion && demanded) {
    out.push({
      check: '가족·지인 사칭 형태',
      status: '수법',
      reason:
        `가족 호칭('${kin}') + 신원확인 회피('${evasion}') + 송금 요구가 함께 있다. ` +
        '메신저피싱의 전형이다. 저장된 번호로 **직접 전화해 목소리를 확인**하기 전에는 보내지 말 것',
      data: { 호칭: kin, 회피신호: evasion },
    });
  }

  const loan = hit(LOAN_CONTEXT, joined);
  const fee = hit(UPFRONT_FEE, joined);
  if (loan && fee && demanded) {
    out.push({
      check: '대출빙자 선입금 요구',
      status: '수법',
      reason:
        `대출 맥락('${loan}') + 선입금 명목('${fee}') + 송금 요구가 함께 있다. ` +
        '정상 금융회사는 대출을 조건으로 수수료·보증금·전산작업비를 먼저 받지 않는다 ' +
        '(금융감독원 반복 안내). 선입금 요구는 그 자체가 사기 신호다',
      data: { 대출맥락: loan, 선입금명목: fee },
    });
  }

  const ctx = hit(CUSTOMS_CONTEXT, joined);
  const cfee = hit(CUSTOMS_FEE, joined);
  const hasAccount = (cl.account ?? []).length > 0;
  const big = (cl.amount_krw ?? []).some((a) => a >= BIG_KRW);
  if (ctx && cfee && demanded && (hasAccount || big)) {
    out.push({
      check: '국제소포·통관비 선입금 요구',
      status: '수법',
      reason:
        `통관 맥락('${ctx}') + 비용 명목('${cfee}') + 송금 요구가 함께 있고, ` +
        `${hasAccount ? '개인 계좌가 제시됐다' : '요구 금액이 100만원 이상이다'}. ` +
        '관세는 세관이 개인 계좌로 받지 않는다. 정상 특송사는 공식 결제창으로 안내하며 금액도 수만원대다',
      data: { 통관맥락: ctx, 비용명목: cfee },
    });
  }

  // ── 레드팀 2차에서 드러난 5종 ─────────────────────────────────────────
  const safeNotice = NEGATED.test(joined);

  const invCtx = hit(INVEST_CONTEXT, joined), invRet = hit(UNREAL_RETURN, joined), invDem = hit(INVEST_DEMAND, joined);
  if (invCtx && invRet && invDem && !safeNotice) {
    out.push({ check: '투자리딩 원금보장 형태', status: '수법',
      reason: `투자 맥락('${invCtx}') + 비현실적 수익 약속('${invRet}') + 선입금·계정 요구('${invDem}')가 함께 있다. 제도권 금융회사는 원금·수익을 보장할 수 없다(자본시장법 위반)`,
      data: { 맥락: invCtx, 약속: invRet, 요구: invDem } });
  }

  const urlHit = hit(SUSPICIOUS_URL, joined), impCtx = hit(IMPERSONATION_CTX, joined), click = hit(CLICK_INSTALL, joined);
  if (urlHit && impCtx && click && !safeNotice) {
    out.push({ check: '스미싱 링크 형태', status: '수법',
      reason: `단축·비표준 도메인 링크('${urlHit.slice(0, 40)}') + 기관·배송·경조사 문맥('${impCtx}') + 클릭·설치 유도('${click}'). 링크를 열지 말고 해당 기관 대표번호로 직접 확인할 것`,
      data: { 링크: urlHit.slice(0, 60), 문맥: impCtx } });
  }

  const lendO = hit(LEND_OBJECT, joined), lendA = hit(LEND_ACT, joined), lendL = hit(LEND_LURE, joined);
  if (lendO && lendA && lendL && !safeNotice) {
    out.push({ check: '통장·카드 양도 요구', status: '수법',
      reason: `계좌·카드('${lendO}') + 전달·대여('${lendA}') + 대가·비밀번호('${lendL}'). 통장을 넘기면 전자금융거래법 위반으로 피해자가 아니라 공범이 된다`,
      data: { 대상: lendO, 행위: lendA } });
  }

  const held = hit(PAYOUT_HELD, joined), pfee = hit(PAYOUT_FEE, joined);
  if (held && pfee && !safeNotice) {
    out.push({ check: '출금 선입금 요구', status: '수법',
      reason: `출금 보류 주장('${held}') + 선입금 명목('${pfee}'). 정상 금융기관은 수수료·세금을 출금액에서 차감하지 먼저 받지 않는다. 보낼수록 명목이 늘어난다`,
      data: { 보류주장: held, 명목: pfee } });
  }

  const sxMedia = hit(SEXTORT_MEDIA, joined), sxThreat = hit(SEXTORT_THREAT, joined);
  const coercion = hit(COERCION, joined);
  const bigAmt = (cl.amount_krw || []).some((a) => a >= 100_000);
  // 2차 협박에는 매체 언급이 없다(홀드아웃 H6). 조건부 강요를 빼면 평범한 대화가 걸린다.
  if (sxThreat && coercion && bigAmt) {
    out.push({ check: '유출 협박', status: '수법',
      reason: `유포 위협('${sxThreat}') + 조건부 강요('${coercion}') + 금액 요구. 보내도 멈추지 않는다. 112 또는 디지털성범죄피해자지원센터(02-735-8994)`,
      data: { 위협: sxThreat, 강요: coercion } });
  } else if (sxMedia && sxThreat && demanded) {
    out.push({ check: '영상·사진 유출 협박', status: '수법',
      reason: `영상·사진('${sxMedia}') + 유포 위협('${sxThreat}') + 금전 요구. 보내도 멈추지 않는다. 112 또는 디지털성범죄피해자지원센터(02-735-8994)`,
      data: { 매체: sxMedia, 위협: sxThreat } });
  }

  const finCtx = hit(FIN_INST_CTX, joined), remote = hit(REMOTE_REQ, joined);
  if (finCtx && remote && !safeNotice) {
    out.push({ check: '금융기관 사칭 원격제어', status: '수법',
      reason: `금융기관 사칭('${finCtx}') + 원격제어·인증정보 요구('${remote}'). 은행·카드사는 어떤 경우에도 원격앱 설치나 비밀번호·보안카드를 요구하지 않는다`,
      data: { 사칭: finCtx, 요구: remote } });
  }

  return out;
}
