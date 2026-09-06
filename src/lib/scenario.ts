/**
 * 금전요구 게이트 + 각본 단계 — scam-models/romance-scam-ko/{money_gate,scenario_stage}.py 의 TS 이식.
 *
 * 둘 다 순수 규칙이라 모델이 필요 없다. 축소 모드(홈 PC 다운)에서 빠지는 것을 '문체 점수' 하나로 줄이려고
 * 옮겼다. 규칙을 바꾸면 Python 쪽도 같이 바꿔야 한다 — 두 경로의 판정이 갈리면 안 된다.
 *
 * 여기 상수는 전부 실측으로 튜닝됐다. 특히 지우면 안 되는 것 둘:
 *  - 각본 진입 조건(ENTRY): 없으면 유학·파병 중인 진짜 연인이 3단계 '고립'으로 잡힌다.
 *  - 5단계 금전요구 필수: 명목 어휘만으로 올리면 정상 무역 대화("세관 통관 수수료 견적 보내드리겠습니다")가 5단계가 된다.
 * 근거: scam-models/EVAL_REPORT.md 3절
 */

const MONEY = /돈|송금|입금|이체|계좌번호|수수료|통관|관세|세관|만원|만 원|천원|억원|달러|유로|비트코인|코인|암호화폐|보증금|병원비|항공권|비행기표|치료비|변호사비|보관료|선불|계좌|자금|현금|잔액|기프트카드|상품권|충전|대납|유산|상속/g;
// 명령형(보내세요 계열)은 가장 흔한 형태인데 빠져 있었다(2026-09-07 레드팀). money_gate.py 와 같이 유지할 것.
const DEMAND = /보내주|보내줘|보내줄|보내달|부탁|도와주|빌려|빌릴|필요합니다|필요해요|필요한데|해주실|해주세요|가능할까|가능하신|대신 내|대신 결제|결제해|입금해|송금해|이체해|지불해|보내세요|보내 주세요|송금하세요|입금하세요|이체하세요|부치세요|넣어주/g;
const SELF_PAY = /제가 입금|제가 송금|제가 보내|입금하겠|입금할게|입금하고|송금하겠|송금할게|보내드리겠|보내드릴|결제하겠|결제할게|지불하겠|드리겠습니다|드릴게요/g;
const HAGGLE = /네고|할인|깎아|깎을|에 해주시면|얼마까지/;
const WINDOW = 60;          // 금전어와 요구어가 이 거리 안에 같이 있어야 '요구'로 본다
const SMALL_KRW = 300_000;  // 소액 테스트 기준
const AMOUNT = /(\d[\d,]*)\s*(억|천만|백만|만)\s*원|(\d[\d,]*)\s*(달러|USD)/g;
const UNIT: Record<string, number> = { 억: 100_000_000, 천만: 10_000_000, 백만: 1_000_000, 만: 10_000 };

const all = (re: RegExp, t: string) => [...t.matchAll(new RegExp(re.source, 'g'))];

export interface MoneyDemand { demanded: boolean; money_terms: string[]; demand_terms: string[]; self_pay_terms: string[] }

export function moneyDemand(text: string): MoneyDemand {
  const t = String(text ?? '');
  const money = all(MONEY, t), demand = all(DEMAND, t), selfpay = all(SELF_PAY, t);

  let near = false;
  for (const m of money) {
    for (const d of demand) {
      if (Math.abs((m.index ?? 0) - (d.index ?? 0)) <= WINDOW) { near = true; break; }
    }
    if (near) break;
  }

  // 금전어 주변이 전부 '내가 낸다'면 요구가 아니다. '부탁·도와주'는 약한 요구라 단독으로는 못 뒤집는다.
  const strong = demand.filter((d) => d[0] !== '부탁' && d[0] !== '도와주');
  let demanded = near && !(selfpay.length > 0 && strong.length === 0);
  if (near && selfpay.length > 0 && selfpay.length >= demand.length) demanded = false;
  if (HAGGLE.test(t)) demanded = false;   // 가격 협상은 금전 요구로 보지 않는다

  return {
    demanded,
    money_terms: money.slice(0, 5).map((m) => m[0]),
    demand_terms: demand.slice(0, 5).map((m) => m[0]),
    self_pay_terms: selfpay.slice(0, 3).map((m) => m[0]),
  };
}

/** 금전 요구가 없으면 점수를 floor 로 눌러 '주의'가 상한이 되게 한다. */
export function applyGate(prob: number, text: string, floor = 0.35) {
  const g = moneyDemand(text);
  return g.demanded ? { prob, gated: false, ...g } : { prob: Math.round(prob * floor * 10000) / 10000, gated: true, ...g };
}

// ── 각본 단계 ──────────────────────────────────────────────────────────────

const STAGES: Record<number, [string, string]> = {
  1: ['접근', '무작위 접촉과 매력적인 신분 제시'],
  2: ['신뢰', '애정 표현과 미래 약속으로 유대 형성'],
  3: ['고립', '비밀 유지·외부 차단·대면 회피 — 여기서 이미 늦다'],
  4: ['소액 테스트', '작은 금액으로 응낙 여부를 시험'],
  5: ['대액 요구', '통관비·투자·병원비 명목의 본 요구'],
};

const NEXT_WARNING: Record<number, string> = {
  1: '다음은 매일 안부와 미래 약속으로 신뢰를 쌓는 단계입니다.',
  2: "다음은 '우리 얘긴 비밀로 하자'며 주변과 차단하는 단계입니다. 가족에게 먼저 알리세요.",
  3: '다음은 작은 금액을 시험 삼아 요청하는 단계입니다. 액수와 무관하게 응하지 마세요.',
  4: '다음은 통관비·병원비·투자 명목의 큰 금액 요구입니다. 이 단계에서 대부분의 피해가 발생합니다.',
  5: '이미 본 요구 단계입니다. 송금하지 말고 112 또는 금융감독원 1332에 신고하세요.',
};

const SIGNALS: Record<number, [string, RegExp][]> = {
  1: [
    ['해외 전문직 신분 제시', /(미군|군인|장교|파병|의사|외과|엔지니어|변호사|사업가|석유|광산)[^.!?]{0,20}(입니다|이에요|예요|이라고)/],
    ['해외 체류 언급', /(시리아|아프가니스탄|이라크|두바이|나이지리아|예멘|리비아|해외 파병|유엔|UN)/],
    ['무작위 접촉', /(우연히|실수로) (보내|연락|메시지)/],
  ],
  2: [
    ['빠른 애정 표현', /(사랑합니다|사랑해요|당신뿐|운명|신의 뜻|천사|영혼의 동반자)/],
    ['미래 약속', /(결혼|평생|함께 살|한국에 가면|만나러 갈|가족이 되)/],
    ['과도한 헌신', /(매일|하루도) (생각|기도|연락)/],
  ],
  3: [
    // 2026-09-06 어휘를 넓혔다(레드팀). "가족에게는 우리 얘기 하지 마세요" 와
    // "영상통화는 부대 규정상 안 됩니다" 가 둘 다 빠져나갔다.
    // scam-models/romance-scam-ko/scenario_stage.py 와 같아야 한다(test_parity.py 가 고정).
    ['비밀 유지 요구', /(비밀로|말하지\s?마|얘기\s?하지\s?마|알리지\s?마|아무한테도|둘만의|우리만)/],
    ['대면·영상 회피', /(영상통화|화상|만나는 것)[^.!?]{0,15}(어렵|안\s?되|안\s?돼|안\s?됩|힘들|곤란|규정상|금지)/],
    ['외부 채널 유도', /(텔레그램|왓츠앱|라인|다른 앱|개인 메일)(으?로)? (옮기|이동|연락)/],
  ],
  4: [['소액 요청·선물', /(기프트카드|상품권|충전|소액|조금만|잠깐만) ?(보내|사서|결제|부탁)/]],
  5: [['대액 명목 요구', /(통관|세관|관세|보관료|변호사비|병원비|치료비|투자|수수료|유산|상속)/]],
};

// 각본 진입 신호 — 실제 관계는 "저는 주한미군 장교입니다"로 시작하지 않는다.
// 해외 체류 언급만으로는 부족하다(유학·주재원·파병 연인이 전부 걸린다).
const ENTRY = new Set(['무작위 접촉', '해외 전문직 신분 제시']);

export interface StageEvidence { stage: number; signal: string; message_index: number; matched: string }
export interface StageResult {
  stage: number; stage_name: string; description: string; next_warning: string;
  evidence: StageEvidence[]; amounts_krw: number[]; messages_seen: number;
}

function amountsOf(t: string): number[] {
  return all(AMOUNT, t).map((m) =>
    m[1] ? parseInt(m[1].replace(/,/g, ''), 10) * UNIT[m[2]] : parseInt(m[3].replace(/,/g, ''), 10) * 1400);
}

export function analyzeStage(messages: string[]): StageResult {
  const texts = messages.map((m) => String(m ?? '')).filter((m) => m.trim());
  const evidence: StageEvidence[] = [];
  const reached = new Set<number>();
  let amounts: number[] = [];

  texts.forEach((t, idx) => {
    for (const [stageStr, pats] of Object.entries(SIGNALS)) {
      const stage = Number(stageStr);
      for (const [signal, re] of pats) {
        const m = t.match(re);
        if (m) {
          reached.add(stage);
          evidence.push({ stage, signal, message_index: idx, matched: m[0].slice(0, 40) });
        }
      }
    }
    amounts = amounts.concat(amountsOf(t));
  });

  // 5단계는 어휘가 아니라 '상대에게 돈을 내라고 했는가'가 조건이다
  const demanded = moneyDemand(texts.join(' ')).demanded;
  if (reached.has(5) && !demanded) reached.delete(5);
  if (demanded) reached.add(amounts.some((a) => a >= SMALL_KRW) ? 5 : 4);

  const uniqAmounts = [...new Set(amounts)].sort((a, b) => a - b);
  const hasEntry = evidence.some((e) => ENTRY.has(e.signal));
  const max = reached.size ? Math.max(...reached) : 0;

  if (!hasEntry || max < 2) {
    return {
      stage: 0, stage_name: '징후 없음',
      description: evidence.length
        ? '각본 진입 신호가 없습니다 — 실제 관계에서도 나타나는 표현만 관측됐습니다'
        : '각본 신호가 관측되지 않았습니다',
      next_warning: '현재 각본 신호가 없습니다.',
      evidence, amounts_krw: uniqAmounts, messages_seen: texts.length,
    };
  }

  const [name, desc] = STAGES[max];
  return {
    stage: max, stage_name: name, description: desc, next_warning: NEXT_WARNING[max] ?? '',
    evidence, amounts_krw: uniqAmounts, messages_seen: texts.length,
  };
}
