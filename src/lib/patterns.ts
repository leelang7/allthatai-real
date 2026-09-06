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
  /(송금|이체|입금|보내\s?줄|보내\s?줘|보내주|부쳐|결제[^.!?]{0,10}(해|부탁|좀)|대신[^.!?]{0,6}(내|결제|처리)|계좌[^.!?]{0,10}(알려|보내|적어)|돈[^.!?]{0,6}(좀|필요|부탁))/;

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

  return out;
}
