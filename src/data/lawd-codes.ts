/**
 * 한국 주요 시군구 법정동 코드 (LAWD_CD, 5자리).
 *
 * 국토부 실거래가 API에 LAWD_CD 5자리 필요. 전체 250+개 자치구.
 * 여기서는 인기 60개만. 추가 필요시 확장.
 *
 * 출처: 법정동 코드 (행정안전부)
 */

export interface LawdCode {
  code: string;
  region: '서울' | '부산' | '대구' | '인천' | '광주' | '대전' | '울산' | '세종' | '경기' | '강원' | '충북' | '충남' | '전북' | '전남' | '경북' | '경남' | '제주';
  name: string;  // "강남구" 등
}

export const lawdCodes: LawdCode[] = [
  // 서울 25개구
  { code: '11110', region: '서울', name: '종로구' },
  { code: '11140', region: '서울', name: '중구' },
  { code: '11170', region: '서울', name: '용산구' },
  { code: '11200', region: '서울', name: '성동구' },
  { code: '11215', region: '서울', name: '광진구' },
  { code: '11230', region: '서울', name: '동대문구' },
  { code: '11260', region: '서울', name: '중랑구' },
  { code: '11290', region: '서울', name: '성북구' },
  { code: '11305', region: '서울', name: '강북구' },
  { code: '11320', region: '서울', name: '도봉구' },
  { code: '11350', region: '서울', name: '노원구' },
  { code: '11380', region: '서울', name: '은평구' },
  { code: '11410', region: '서울', name: '서대문구' },
  { code: '11440', region: '서울', name: '마포구' },
  { code: '11470', region: '서울', name: '양천구' },
  { code: '11500', region: '서울', name: '강서구' },
  { code: '11530', region: '서울', name: '구로구' },
  { code: '11545', region: '서울', name: '금천구' },
  { code: '11560', region: '서울', name: '영등포구' },
  { code: '11590', region: '서울', name: '동작구' },
  { code: '11620', region: '서울', name: '관악구' },
  { code: '11650', region: '서울', name: '서초구' },
  { code: '11680', region: '서울', name: '강남구' },
  { code: '11710', region: '서울', name: '송파구' },
  { code: '11740', region: '서울', name: '강동구' },
  // 부산 주요
  { code: '26110', region: '부산', name: '중구' },
  { code: '26230', region: '부산', name: '동래구' },
  { code: '26260', region: '부산', name: '남구' },
  { code: '26290', region: '부산', name: '북구' },
  { code: '26320', region: '부산', name: '해운대구' },
  { code: '26410', region: '부산', name: '수영구' },
  { code: '26440', region: '부산', name: '사상구' },
  // 인천 주요
  { code: '28110', region: '인천', name: '중구' },
  { code: '28177', region: '인천', name: '연수구' },
  { code: '28185', region: '인천', name: '남동구' },
  { code: '28245', region: '인천', name: '서구' },
  // 대구 주요
  { code: '27110', region: '대구', name: '중구' },
  { code: '27170', region: '대구', name: '수성구' },
  { code: '27200', region: '대구', name: '달서구' },
  // 대전 주요
  { code: '30110', region: '대전', name: '동구' },
  { code: '30140', region: '대전', name: '중구' },
  { code: '30170', region: '대전', name: '서구' },
  { code: '30200', region: '대전', name: '유성구' },
  // 광주
  { code: '29110', region: '광주', name: '동구' },
  { code: '29140', region: '광주', name: '서구' },
  { code: '29155', region: '광주', name: '남구' },
  { code: '29170', region: '광주', name: '북구' },
  { code: '29200', region: '광주', name: '광산구' },
  // 세종
  { code: '36110', region: '세종', name: '세종특별자치시' },
  // 경기 주요
  { code: '41131', region: '경기', name: '수원시 영통구' },
  { code: '41135', region: '경기', name: '수원시 권선구' },
  { code: '41210', region: '경기', name: '성남시 분당구' },
  { code: '41280', region: '경기', name: '용인시 수지구' },
  { code: '41285', region: '경기', name: '용인시 기흥구' },
  { code: '41360', region: '경기', name: '안양시 동안구' },
  { code: '41390', region: '경기', name: '안산시 단원구' },
  { code: '41410', region: '경기', name: '고양시 일산동구' },
  { code: '41415', region: '경기', name: '고양시 일산서구' },
  { code: '41463', region: '경기', name: '남양주시' },
  { code: '41590', region: '경기', name: '의정부시' },
  { code: '41650', region: '경기', name: '하남시' },
  { code: '41730', region: '경기', name: '광주시' },
  { code: '41135', region: '경기', name: '시흥시' },
  // 제주
  { code: '50110', region: '제주', name: '제주시' },
  { code: '50130', region: '제주', name: '서귀포시' },
];
