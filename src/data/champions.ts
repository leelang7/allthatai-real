/**
 * LoL 인기 챔피언 30+. 각 챔피언이 /champions/[slug] 페이지로 렌더됨.
 *
 * SEO 타겟: "{챔피언명} 빌드", "{챔피언명} 룬", "{챔피언명} 카운터",
 *           "{챔피언명} 스킬", "{챔피언명} 콤보"
 *
 * 빌드/룬은 LoLButler가 더 정확/실시간이라 그쪽으로 funnel. 우리는 SEO 자석.
 */

export interface Champion {
  slug: string;       // 영문 소문자, 예: 'yasuo'
  apiName: string;    // Data Dragon API 이름, 예: 'Yasuo' (대문자 시작)
  korName: string;    // 한글 이름
  title: string;      // 한글 타이틀, 예: '바람의 베기'
  role: 'top' | 'jungle' | 'mid' | 'adc' | 'support' | 'flex';
  difficulty: 1 | 2 | 3;
  /** 한 줄 핵심 평가 */
  pitch: string;
  /** 카운터 챔피언 slug 3개 */
  counters: string[];
  /** 좋은 시너지 챔피언 slug 3개 */
  synergies: string[];
  /** 한 줄 콤보 패턴 */
  combo?: string;
}

export const champions: Champion[] = [
  {
    slug: 'yasuo', apiName: 'Yasuo', korName: '야스오', title: '추방자',
    role: 'mid', difficulty: 3,
    pitch: '치명타 + 이속 + 궁의 띄움 — 한타 캐리 가능하지만 라인전 어려움',
    counters: ['malzahar', 'pantheon', 'annie'],
    synergies: ['malphite', 'wukong', 'gragas'],
    combo: 'Q3 → E → R → 평타 치명타',
  },
  {
    slug: 'yone', apiName: 'Yone', korName: '요네', title: '잊혀진 자',
    role: 'mid', difficulty: 3,
    pitch: '야스오 형 — 치명타 + 광역 평타 + 영혼 분리. 1대1 강함',
    counters: ['malzahar', 'pantheon', 'lissandra'],
    synergies: ['malphite', 'orianna', 'amumu'],
    combo: 'Q3 → E → R → 평타',
  },
  {
    slug: 'zed', apiName: 'Zed', korName: '제드', title: '그림자의 주인',
    role: 'mid', difficulty: 3,
    pitch: '암살자 1티어 — 솔킬 풀무한 가능. 마방템에 약함',
    counters: ['lissandra', 'malphite', 'zhonya-builder'],
    synergies: ['leesin', 'amumu', 'nocturne'],
    combo: 'W → E → Q → R → 평타 → R 폭발',
  },
  {
    slug: 'akali', apiName: 'Akali', korName: '아칼리', title: '암살자',
    role: 'mid', difficulty: 3,
    pitch: 'AP 암살자 — 은신 + 점프. 후반 캐리 능력 미친 수준',
    counters: ['galio', 'lissandra', 'malzahar'],
    synergies: ['amumu', 'jarvan-iv', 'leesin'],
  },
  {
    slug: 'ahri', apiName: 'Ahri', korName: '아리', title: '구미호',
    role: 'mid', difficulty: 2,
    pitch: '미드 클래식 — 매혹 + 이동기. 입문자 friendly + 후반 강함',
    counters: ['fizz', 'kassadin', 'leblanc'],
    synergies: ['leesin', 'amumu', 'wukong'],
  },
  {
    slug: 'leesin', apiName: 'LeeSin', korName: '리신', title: '눈먼 수도승',
    role: 'jungle', difficulty: 3,
    pitch: '정글 클래식 — 콤보 무한. 초중반 갱킹 캐리, 후반 약함',
    counters: ['rammus', 'amumu', 'nocturne'],
    synergies: ['leblanc', 'zed', 'akali'],
    combo: 'Q → E → R(인섹) → W → Q2',
  },
  {
    slug: 'jinx', apiName: 'Jinx', korName: '징크스', title: '난폭한 자',
    role: 'adc', difficulty: 2,
    pitch: '한타 후반 캐리 1티어 — 사거리 변환 + 광역. 라인전 약함',
    counters: ['draven', 'caitlyn', 'lucian'],
    synergies: ['lulu', 'thresh', 'leona'],
  },
  {
    slug: 'kaisa', apiName: 'Kaisa', korName: '카이사', title: '공허의 딸',
    role: 'adc', difficulty: 2,
    pitch: 'AD/AP 둘 다 가능 — 후반 미친 데미지 + 점프 R',
    counters: ['draven', 'lucian', 'caitlyn'],
    synergies: ['nautilus', 'pyke', 'thresh'],
  },
  {
    slug: 'caitlyn', apiName: 'Caitlyn', korName: '케이틀린', title: '파이어',
    role: 'adc', difficulty: 1,
    pitch: '사거리 1위 — 라인전 압살. 후반 다른 원딜에 밀림',
    counters: ['draven', 'samira'],
    synergies: ['lux', 'morgana', 'zyra'],
  },
  {
    slug: 'lucian', apiName: 'Lucian', korName: '루시안', title: '정화자',
    role: 'adc', difficulty: 2,
    pitch: '초중반 강함 — 이속 + 평타 2회. 후반 약함',
    counters: ['draven', 'samira'],
    synergies: ['nami', 'lulu'],
  },
  {
    slug: 'draven', apiName: 'Draven', korName: '드레이븐', title: '영광스러운 처형자',
    role: 'adc', difficulty: 3,
    pitch: '미친 라인전 데미지 — 도끼 캐치 메카닉 필요. 초반 캐리 못하면 망',
    counters: ['caitlyn', 'jhin'],
    synergies: ['leona', 'thresh', 'pyke'],
  },
  {
    slug: 'jhin', apiName: 'Jhin', korName: '진', title: '4번 살인자',
    role: 'adc', difficulty: 2,
    pitch: '4발 → 6발 — 한타 + 라인전 균형. 이속 + 4번째 강타',
    counters: ['draven'],
    synergies: ['thresh', 'morgana', 'lux'],
  },
  {
    slug: 'thresh', apiName: 'Thresh', korName: '쓰레쉬', title: '사슬 감시자',
    role: 'support', difficulty: 3,
    pitch: '서폿 1티어 — 갈고리 + 등불 + 박스. 메카닉 다소 필요',
    counters: ['morgana', 'janna'],
    synergies: ['draven', 'caitlyn', 'kaisa'],
  },
  {
    slug: 'leona', apiName: 'Leona', korName: '레오나', title: '여명의 빛',
    role: 'support', difficulty: 1,
    pitch: '서폿 입문용 — 단순한 강한 CC. 누르면 적이 죽음',
    counters: ['morgana', 'janna'],
    synergies: ['lucian', 'kaisa', 'draven'],
  },
  {
    slug: 'lulu', apiName: 'Lulu', korName: '룰루', title: '요정 마법사',
    role: 'support', difficulty: 1,
    pitch: '원딜 보호 1티어 — 거대화 R + 보호막. 후반 한타 핵심',
    counters: ['blitzcrank', 'morgana'],
    synergies: ['jinx', 'kogmaw', 'twitch'],
  },
  {
    slug: 'lux', apiName: 'Lux', korName: '럭스', title: '광휘의 아가씨',
    role: 'support', difficulty: 1,
    pitch: '미드/서폿 둘 다 가능 — 광범위 CC + 광역 R',
    counters: ['leblanc', 'kassadin'],
    synergies: ['caitlyn', 'jinx'],
  },
  {
    slug: 'morgana', apiName: 'Morgana', korName: '모르가나', title: '타락한 자',
    role: 'support', difficulty: 1,
    pitch: '서폿 빙결 + 마법 면역. 갈고리 캐릭 무력화',
    counters: ['janna'],
    synergies: ['kaisa', 'twitch'],
  },
  {
    slug: 'darius', apiName: 'Darius', korName: '다리우스', title: '녹서스의 손',
    role: 'top', difficulty: 1,
    pitch: '탑 클래식 — 출혈 5스택 → R 처형. 단순하고 강함',
    counters: ['vayne', 'gnar', 'quinn'],
    synergies: ['leesin', 'amumu'],
  },
  {
    slug: 'garen', apiName: 'Garen', korName: '가렌', title: '데마시아의 힘',
    role: 'top', difficulty: 1,
    pitch: '입문자 1순위 — 무한 회복 + 회오리 + 처형 R',
    counters: ['vayne', 'quinn'],
    synergies: ['katarina', 'jarvan-iv'],
  },
  {
    slug: 'fiora', apiName: 'Fiora', korName: '피오라', title: '대결자',
    role: 'top', difficulty: 3,
    pitch: '1대1 1티어 — 약점 찌르기 메카닉. 초중반 솔킬 무한',
    counters: ['malphite', 'gnar', 'jax'],
    synergies: ['leesin'],
  },
  {
    slug: 'malphite', apiName: 'Malphite', korName: '말파이트', title: '돌의 파편',
    role: 'top', difficulty: 1,
    pitch: '탑 입문 + 한타 캐리 — R 광역 띄움. AP 빌드도 가능',
    counters: ['vayne', 'gnar'],
    synergies: ['yasuo', 'yone', 'orianna'],
  },
  {
    slug: 'ornn', apiName: 'Ornn', korName: '오른', title: '산 아래의 불꽃',
    role: 'top', difficulty: 2,
    pitch: '탱커 + 아이템 강화. 한타 광역 띄움',
    counters: ['vayne', 'fiora'],
    synergies: ['kaisa', 'jinx'],
  },
  {
    slug: 'amumu', apiName: 'Amumu', korName: '아무무', title: '슬픈 미라',
    role: 'jungle', difficulty: 1,
    pitch: '정글 입문 + 한타 R — 광역 스턴. 단순한 메카닉',
    counters: ['nocturne'],
    synergies: ['katarina', 'yasuo', 'orianna'],
  },
  {
    slug: 'kindred', apiName: 'Kindred', korName: '킨드레드', title: '영원한 사냥꾼',
    role: 'jungle', difficulty: 3,
    pitch: '정글 캐리 — 표식 사냥 + 한타 R. 후반 미친 데미지',
    counters: ['amumu', 'leesin'],
    synergies: ['yasuo', 'akali'],
  },
  {
    slug: 'kaynkka', apiName: 'Kayn', korName: '케인', title: '그림자 사신',
    role: 'jungle', difficulty: 2,
    pitch: '정글 변신 캐릭 — 레드 (1대1) vs 블루 (한타). 후반 캐리',
    counters: ['leesin'],
    synergies: ['katarina', 'yone'],
  },
  {
    slug: 'volibear', apiName: 'Volibear', korName: '볼리베어', title: '천둥의 인도자',
    role: 'jungle', difficulty: 1,
    pitch: '탱+딜러 — 갱킹 빠름. 한타 광역 데미지',
    counters: ['vayne'],
    synergies: ['amumu', 'orianna'],
  },
  {
    slug: 'orianna', apiName: 'Orianna', korName: '오리아나', title: '태엽장치 소녀',
    role: 'mid', difficulty: 2,
    pitch: '미드 한타 1티어 — 공 위치 컨트롤 + R 광역 끌어당김',
    counters: ['leblanc', 'kassadin'],
    synergies: ['malphite', 'yasuo', 'amumu'],
  },
  {
    slug: 'leblanc', apiName: 'Leblanc', korName: '르블랑', title: '기만자',
    role: 'mid', difficulty: 3,
    pitch: '암살자 — 점프 + 복제 + 침묵. 메카닉 어렵지만 캐리',
    counters: ['galio', 'malzahar'],
    synergies: ['leesin', 'amumu'],
  },
  {
    slug: 'syndra', apiName: 'Syndra', korName: '신드라', title: '암흑 군주',
    role: 'mid', difficulty: 2,
    pitch: '미드 폭딜 — 공 5개 → R 한 방 처치. AP 미친 데미지',
    counters: ['fizz', 'leblanc'],
    synergies: ['leesin'],
  },
  {
    slug: 'kassadin', apiName: 'Kassadin', korName: '카사딘', title: '공허의 행자',
    role: 'mid', difficulty: 2,
    pitch: '후반 캐리 — R 무한 점프. 라인전 못 견디면 못 자람',
    counters: ['leblanc', 'lucian-mid'],
    synergies: ['malzahar'],
  },
];

export const ROLE_LABEL = {
  top: '탑',
  jungle: '정글',
  mid: '미드',
  adc: '원딜',
  support: '서폿',
  flex: '플렉스',
};
