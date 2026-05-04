// Topics the auto-generator must skip.
//
// Two reasons to block:
//   1. Hard rule violations — piracy, fraud, hate speech, child-safety adjacent,
//      explicit adult content. AdSense and Korean law would penalize.
//   2. Category exclusion — the human owner already curates these topics by hand
//      (정부지원, DUNS, 세금, etc). Auto-publish is for sensational *trending*
//      issue analysis only, not evergreen guides.

export const BLOCKED_KEYWORDS: string[] = [
  // === Hard violations: piracy / illegal markets ===
  '누누티비', '티비위키', '티비핫', '쿠쿠티비', '오케이툰',
  '뉴토끼', '마나토끼', '밤토끼', '웹툰미러',
  '토렌트', 'torrent', '4k torrent', 'crack', 'keygen', 'patch',

  // === Account / key resale ===
  '계정공유', '계정거래', '계정 판매', '계정 양도',

  // === Drugs / weapons / gambling ===
  '대마초', '필로폰', '도박사이트', '바카라', '슬롯머신',
  '카지노', '온라인 도박', '주식 리딩방', '코인 리딩방',

  // === Adult ===
  '성인 사이트', '야동', '야애니', 'porn', '에로', '19금 사이트',

  // === Health / financial misinformation ===
  '암 치료법', '기적의 약', '코로나 백신 부작용', '주식 작전',

  // === Manual-curation zone (auto-skip so human owner keeps control) ===
  // Government support / 사업자 / 세금
  'duns', '디앤비', 'd-u-n-s', '사업자등록', '통신판매업',
  '청년 월세', '청년도약계좌', '청년희망적금', '소상공인 정책자금',
  '예비창업패키지', '창업지원금', '국민취업지원',
  '해외주식 양도세', '해외주식 양도소득세', '부가가치세 신고',
  // AI / GPT (existing guides cover these)
  'chatgpt 결제', 'claude 결제', 'gpt 한국 결제', 'openai 한국',
  // Play Store / dev (existing guides)
  'play console', '플레이콘솔', 'closed testing', '14일 테스트',
  // OTT pricing (existing guides)
  'ott 통신사 결합', '넷플릭스 한국 가격',
];

export const BLOCKED_PATTERNS: RegExp[] = [
  // Piracy patterns
  /(다운로드|무료\s*다운|토렌트|torrent)\s*(영화|드라마|만화|웹툰)/i,
  /(.*?)\s*시즌\s*\d+\s*(다시보기|무료보기|풀버전)/i,
  /(.*?)\s*\d+회\s*(다시보기|무료보기)/i,
  /(.*?)\s*(crack|cracked|patch|keygen)/i,
  // Minor identification
  /(미성년자|초등학생|중학생|고등학생).*(\d+살|\d+세|이름|얼굴|학교)/i,
  // Election / candidate names trigger requires extra care; defer to human
  /(\d+\s*대\s*대선|총선\s*후보)/i,
];
