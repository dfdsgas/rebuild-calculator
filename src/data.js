// =====================================================================
// 단지 데이터 (고정 기준값: 국토부 실거래 2025.9~2026.8, 2026.9 수집)
// 출처: 비교단지_기초데이터_v1.xlsx(6_실거래요약·7_신축시세추정), 4단지_단계별_시간가치_투자비교_v1.xlsx,
//       정비계획 고시·사업시행계획인가 고시, 조합 발표, 민간 부동산 분석자료(2026.10)
// 금액 단위: 억원
// =====================================================================

export const TRADE_PERIOD = "2025.9 ~ 2026.8 (12개월)";
export const TRADE_SOURCE = "국토교통부 아파트 매매·분양권전매(입주권) 실거래가 API, 해제거래 제외";
export const PRIVATE_SOURCE = "민간 부동산 분석자료 (호가·임장 기반, 2026.10)";
export const PYEONG_84 = 34.3; // 전용 84㎡ ≈ 공급 34.3평 (공급평 = 전용 ÷ 0.75 × 0.3025)
export const SCHEDULE_BASE = { y: 2026, m: 9 }; // 단계 일정 기준일 2026.9.30 [가정]

// 사업단계 8단계와 단계별 리스크 프리미엄 (기준수익률에 가산) [가정]
export const STAGES = ["정비구역 지정", "조합설립인가", "통합심의", "사업시행인가", "관리처분인가", "이주·철거", "착공", "준공·입주"];
export const PREMIUM = [0.04, 0.03, 0.025, 0.02, 0.015, 0.01, 0.005, 0];
export const gradeOf = (idx) => (idx <= 0 ? "C" : idx <= 2 ? "B" : idx === 3 ? "A" : "A+");
export const GRADE_NOTE = {
  C: "구역지정 전후 — 용적률·분담금 모두 추정, 오차 큼",
  B: "조합설립~통합심의 — 계획 윤곽 확정, 지위양도 제한 확인 필요",
  A: "사업시행인가 — 건축계획·사업비 윤곽 확정",
  "A+": "관리처분인가 이후 — 분담금 사실상 확정, 기간 리스크 위주",
};

// rep.monthly: 대표 평형 월별 실거래 중위가 [YYYYMM, 억원, 건수] (2025.9~2026.8, 국토부 API 수집값)
export const DEFAULT_COST = { acq: 0.04, hold: 0.004, rf: 0.03 };

export const COMPLEXES = [
  {
    id: "sinbanpo2", name: "신반포2차", location: "서초구 잠원동",
    stageIdx: 2, stageNote: "조합설립인가(2020.11) 후 통합심의 통과, 사업시행인가 준비",
    householdsBefore: 1572, householdsAfter: 2057, builder: "현대건설", builderSrc: "2024.12 시공자 선정 (언론 보도 기준)",
    projCode: "1320", unionDate: "2020-11-16",
    // 자체 산정
    rep: { key: "sb2_69", label: "전용 68.91㎡(23평형)", buy: 41.0, jeonse: 4.72, monthly: [["202509", 40.25, 2], ["202510", 41, 1], ["202512", 38.5, 1], ["202602", 42.13, 2], ["202604", 41, 1], ["202605", 39.2, 1], ["202606", 40.75, 2], ["202607", 39.8, 1]] },
    share: 10.29, shareSrc: "정비계획 고시(서울시 제2024-350호) 기반 추정: 조합원분양가 25.73억 − 종전평가 20.50억 × 비례율 75.33%",
    shareAlt: "조합 발표(2026.9): 23평→28평(전용65) 4.8억 · 30평→36평(전용84) 6.15억 — 23평→84㎡는 미발표",
    // 민간 분석
    privTotal: 52.0, privInit: 42.5, valueHigh: 66.0, yearsHigh: 10.5,
    // 자체 기간 가정 및 단계 도달시점(기준일부터 경과연수)
    yearsLow: 7.3, arrive: [0, 0, 0, 0.3, 1.8, 2.8, 3.3, 7.3],
    ratio: 0.7533, ratioSource: "정비계획 고시",
    compShort: "래미안원베일리·아크로리버파크 84㎡ 매매",
    comps: [
      { key: "oneBaily", name: "래미안원베일리", built: "2023", type: "매매 84㎡", count: 21, median: 59.0, max: 71.5, last: "2026-06-24", ppp: 17214, adj: 0, weight: 0.5, note: "한강변 대장 신축. 신반포2차 한강 전면·49층 → 동급 가정" },
      { key: "acroRiverPark", name: "아크로리버파크", built: "2016", type: "매매 84㎡", count: 11, median: 55.5, max: 63.0, last: "2026-08-06", ppp: 16198, adj: 0, weight: 0.5, note: "반포 한강변. 연식 열위 vs 입지 동급 → 보정 없음" },
      { key: "mapleXi", name: "메이플자이", built: "2025", type: "매매 84㎡", count: 17, median: 50.1, max: 54.0, last: "2026-07-02", ppp: 14640, adj: 0, weight: 0, note: "참고치(잠원 신축, 비한강)" },
      { key: "acroRiverView", name: "아크로리버뷰신반포", built: "2018", type: "매매 84㎡", count: 4, median: 47.6, max: 60.0, last: "2026-07-10", ppp: 13914, adj: 0, weight: 0, note: "참고치(잠원 한강변 소규모)" },
    ],
    ownTrades: [
      { key: "sb2_69", label: "전용 68.91㎡", count: 11, median: 41.0, max: 42.25, last: "2026-07-23", jeonse: 4.72 },
      { key: "sb2_107", label: "전용 107.31㎡", count: 6, median: 56.5, max: 61.5, last: "2026-07-03", jeonse: 7.0 },
    ],
  },
  {
    id: "apgujeong5", name: "압구정5구역", location: "강남구 압구정동",
    stageIdx: 1, stageNote: "정비계획 결정(2025.10), 시공자 선정(2026.5), 통합심의 준비",
    householdsBefore: 1232, householdsAfter: 1401, builder: "현대건설", builderSrc: "2026.5.30 조합 총회 선정(DL이앤씨와 경쟁) — 머니투데이 보도",
    projCode: "1006", unionDate: "2021-02-22",
    rep: { key: "apg1_50", label: "한양1차 전용 49.98㎡", buy: 40.5, jeonse: 4.75, monthly: [["202510", 40, 1], ["202512", 40.85, 1], ["202601", 41.5, 1], ["202602", 42, 1], ["202605", 39, 1], ["202606", 38.9, 1], ["202608", 40.5, 1]] },
    share: 12.04, shareSrc: "정비계획 고시(서울시 제2025-556호) 기반 추정: 조합원분양가 27.64억 − 종전평가 23.00억 × 비례율 67.81% [확인필요]",
    shareAlt: "조합 공식 분담금 미발표. 민간 분석은 평균 10~30억 추정",
    privTotal: 57.5, privInit: 41.0, valueHigh: 73.0, yearsHigh: 13.0,
    yearsLow: 9.5, arrive: [0, 0, 1, 2, 3.5, 4.5, 5, 9.5],
    ratio: 0.6781, ratioSource: "정비계획 고시",
    compShort: "래미안원베일리 매매 + 청담르엘 입주권 84㎡",
    comps: [
      { key: "oneBaily", name: "래미안원베일리", built: "2023", type: "매매 84㎡", count: 21, median: 59.0, max: 71.5, last: "2026-06-24", ppp: 17214, adj: 0.10, weight: 0.5, note: "압구정 한강변 최상급 입지·희소성 → +10%" },
      { key: "cheongdamLe", name: "청담르엘", built: "2025", type: "입주권 84㎡", count: 8, median: 63.25, max: 67.8, last: "2026-02-26", ppp: 18504, adj: 0.05, weight: 0.5, note: "입주권 중위 63억(원베일리 매매 상회) → 한강·대단지 +5%" },
      { key: "cheongdamJeonse", name: "청담르엘(전세환산)", built: "2025", type: "전세 84㎡", count: 55, median: 18.0, max: null, last: "-", ppp: 17406, adj: 0.15, weight: 0, note: "교차검증용: 전세 18억 × 원베일리 매매/전세 배율 (가중치 0)", isJeonse: true },
    ],
    ownTrades: [
      { key: "apg1_50", label: "한양1차 전용 49.98㎡", count: 7, median: 40.5, max: 42.0, last: "2026-08-21", jeonse: 4.75 },
      { key: "apg1_91", label: "한양1차 전용 91.21㎡", count: 4, median: 54.45, max: 56.5, last: "2026-06-12", jeonse: 10.6 },
      { key: "apg2_176", label: "한양2차 전용 175.92㎡", count: 2, median: 78.5, max: 82.0, last: "2026-07-31", jeonse: 15.15 },
    ],
  },
  {
    id: "eunma", name: "대치 은마", location: "강남구 대치동",
    stageIdx: 3, stageNote: "사업시행계획인가(강남구 제2026-130호, 2026.7.2), 조합원분양신청 진행",
    householdsBefore: 4424, householdsAfter: 5850, builder: "삼성물산·GS건설 [확인필요]", builderSrc: "2002년 추진위 단계 선정분 — 뉴데일리 2026.7.9 보도, 현 조합 승계 여부 확인 필요",
    projCode: "1007", unionDate: "2023-09-26",
    rep: { key: "eunma_77", label: "31평형(전용 76.79㎡)", buy: 35.0, jeonse: 6.83, monthly: [["202509", 35.3, 3], ["202510", 36.45, 4], ["202511", 37.93, 2], ["202512", 37.6, 2], ["202602", 36.2, 2], ["202603", 35.35, 4], ["202605", 34, 1], ["202606", 34.65, 2], ["202607", 33.6, 2], ["202608", 33.4, 5]] },
    share: 7.44, shareSrc: "조합 발표: 31평 → 35평형(전용84) 분담금 7.44억 (비례율 82.19%)",
    shareAlt: "정비계획 고시 기반 추정 4.19억(비례율 100.47%) — 조합 발표가 최신",
    privTotal: 41.8, privInit: 30.0, valueHigh: 48.0, yearsHigh: 8.5,
    yearsLow: 7.3, arrive: [0, 0, 0, 0, 1.3, 2.3, 2.8, 7.3],
    ratio: 0.8219, ratioSource: "조합 발표",
    compShort: "래미안대치팰리스 외 3개 단지 84㎡ 매매",
    comps: [
      { key: "daechiPalace", name: "래미안대치팰리스", built: "2015", type: "매매 84㎡", count: 9, median: 42.5, max: 47.5, last: "2026-06-03", ppp: 12401, adj: 0.10, weight: 0.5, note: "대치 대표 신축. 연식차·대단지 → +10%" },
      { key: "dhXiGaepo", name: "디에이치자이개포", built: "2021", type: "매매 84㎡", count: 4, median: 37.25, max: 39.0, last: "2026-05-23", ppp: 10900, adj: 0.15, weight: 0.2, note: "개포 신축. 대치 학원가 입지 우위 → +15%" },
      { key: "daechiSummit", name: "대치푸르지오써밋", built: "2023", type: "매매 84㎡", count: 3, median: 34.5, max: 37.5, last: "2026-05-30", ppp: 10066, adj: 0.20, weight: 0.15, note: "소규모 신축 → 대단지 프리미엄 +20%" },
      { key: "daechiLe", name: "대치르엘", built: "2021", type: "매매 84㎡", count: 7, median: 36.6, max: 39.5, last: "2026-05-22", ppp: 10704, adj: 0.20, weight: 0.15, note: "소규모 신축 → 대단지 프리미엄 +20%" },
    ],
    ownTrades: [
      { key: "eunma_77", label: "전용 76.79㎡", count: 27, median: 35.0, max: 38.0, last: "2026-08-29", jeonse: 6.83 },
      { key: "eunma_84", label: "전용 84.43㎡", count: 16, median: 39.15, max: 43.1, last: "2026-08-20", jeonse: 7.98 },
    ],
  },
  {
    id: "jamsil5", name: "잠실주공5단지", location: "송파구 잠실동",
    stageIdx: 3, stageNote: "사업시행계획인가(송파구 제2026-90호, 2026.7.1), 2027년 관리처분 예상",
    householdsBefore: 3930, householdsAfter: 6411, builder: "삼성물산·GS건설·HDC현대산업개발 컨소시엄", builderSrc: "2000년 선정, 기존 시공권 유지 — 뉴데일리 2026.7.9 보도",
    projCode: "1342", unionDate: "2013-12-19",
    rep: { key: "js5_76", label: "34평형(전용 76.5㎡)", buy: 40.27, jeonse: 4.93, monthly: [["202509", 37.87, 4], ["202510", 39.47, 8], ["202511", 39.12, 6], ["202512", 38.77, 9], ["202601", 41.37, 8], ["202602", 42.35, 3], ["202603", 41.27, 1], ["202604", 39.9, 4], ["202605", 40.27, 1], ["202606", 40.57, 3], ["202607", 40.27, 10], ["202608", 40.91, 4]] },
    share: -2.77, shareSrc: "조합 발표: 34평 → 34평형(전용84) 2.77억 환급",
    shareAlt: "정비계획 고시 기반 추정 4.67억 환급(비례율 108.11%) — 조합 발표가 최신",
    privTotal: 38.4, privInit: 36.0, valueHigh: 51.0, yearsHigh: 10.5,
    yearsLow: 7.8, arrive: [0, 0, 0, 0, 1.3, 2.3, 2.8, 7.8],
    ratio: null, ratioSource: "미공개",
    compShort: "잠실르엘·잠실래미안아이파크 84㎡ 입주권 + 잠실엘스",
    comps: [
      { key: "jamsilLe", name: "잠실르엘", built: "2025", type: "입주권 84㎡", count: 11, median: 43.5, max: 48.0, last: "2026-06-17", ppp: 12713, adj: 0.10, weight: 0.4, note: "인접 신축 입주권. 6,411세대·한강·65층 → +10%" },
      { key: "jamsilIpark", name: "잠실래미안아이파크", built: "-", type: "입주권 84㎡", count: 15, median: 41.5, max: 46.0, last: "2026-07-01", ppp: 12111, adj: 0.10, weight: 0.4, note: "인접 신축 입주권(잠실진주 재건축) → +10%" },
      { key: "jamsilEls", name: "잠실엘스", built: "2008", type: "매매 84㎡", count: 98, median: 33.375, max: 37.0, last: "2026-08-21", ppp: 9758, adj: 0.35, weight: 0.2, note: "2008 준공 대단지 → 신축 연식 보정 +35% (교차검증)" },
      { key: "jamsilLe74", name: "잠실르엘", built: "2025", type: "매매 74㎡", count: 7, median: 35.836, max: 40.32, last: "2026-02-26", ppp: 11961, adj: 0.10, weight: 0, note: "74㎡ 표본 적음 — 참고치" },
    ],
    ownTrades: [
      { key: "js5_76", label: "전용 76.5㎡", count: 61, median: 40.27, max: 42.47, last: "2026-08-18", jeonse: 4.93 },
      { key: "js5_83", label: "전용 82.61㎡", count: 43, median: 43.45, max: 46.25, last: "2026-08-06", jeonse: 5.3 },
    ],
  },
];

// ===================== 사용자 단지 추가용 =====================
export const SEOUL_GU = [
  ["11110", "종로구"], ["11140", "중구"], ["11170", "용산구"], ["11200", "성동구"], ["11215", "광진구"],
  ["11230", "동대문구"], ["11260", "중랑구"], ["11290", "성북구"], ["11305", "강북구"], ["11320", "도봉구"],
  ["11350", "노원구"], ["11380", "은평구"], ["11410", "서대문구"], ["11440", "마포구"], ["11470", "양천구"],
  ["11500", "강서구"], ["11530", "구로구"], ["11545", "금천구"], ["11560", "영등포구"], ["11590", "동작구"],
  ["11620", "관악구"], ["11650", "서초구"], ["11680", "강남구"], ["11710", "송파구"], ["11740", "강동구"],
];
// 현재 단계 → 다음 단계까지 기본 소요(년) [가정] — 검증 4개 단지 일정 가정과 같은 수준
export const STAGE_GAP = [1.5, 1, 1, 1.5, 1, 1, 4.5];
export const defaultYears = (stageIdx) => STAGE_GAP.slice(stageIdx).reduce((s, v) => s + v, 0);
export function arriveFrom(stageIdx) {
  const out = []; let t = 0;
  for (let k = 0; k < 8; k++) { if (k > stageIdx) t += STAGE_GAP[k - 1]; out.push(k <= stageIdx ? 0 : Math.round(t * 100) / 100); }
  return out;
}
// 분담금 간이 산식 기본 비율 [가정] — 검증 4개 단지(정비계획 고시) 평균
export const SHARE_DEFAULTS = { memberToNew: 0.47, prevToBuy: 0.56, ratio: 0.88 };

// 조합설립인가일 → 일정 기준일(2026.9.30)까지 경과연수 (재초환 개시시점 산정용)
export const yearsSince = (ymd) => { if (!ymd) return null; const [y, m] = ymd.split("-").map(Number); return (SCHEDULE_BASE.y * 12 + SCHEDULE_BASE.m - (y * 12 + m)) / 12; };
COMPLEXES.forEach((c) => { if (c.unionDate) c.unionAgo = yearsSince(c.unionDate); });
