// =====================================================================
// 정비사업 공식 현황(서울시 도시정비사업 통계) — 단지 매칭·단계 변환
// =====================================================================
import { SCHEDULE_BASE } from "./data.js";

// 서울시 통계의 사업추진단계 → 앱 8단계 인덱스
export const STAGE_MAP = { "구역지정": 0, "추진위": 0, "조합설립": 1, "건축심의": 2, "사업시행": 3, "관리처분": 4, "착공": 6 };
export function stageIdxOf(p) {
  if (!p || !p.s) return null;
  let k = STAGE_MAP[p.s];
  if (k === undefined) return null;
  if (k === 4 && p.d_mig) k = 5; // 관리처분 후 이주 시작 → 이주·철거
  return k;
}

// 일정 기준일(2026.9.30)부터 조합설립인가일까지 경과연수
export function unionAgoOf(p) {
  if (!p || !p.d_union) return null;
  const [y, m] = p.d_union.split("-").map(Number);
  return (SCHEDULE_BASE.y * 12 + SCHEDULE_BASE.m - (y * 12 + m)) / 12;
}

const norm = (s) => String(s || "").replace(/\s|아파트|주택재건축|정비구역|재건축|\(.*?\)/g, "");
const mainJibun = (s) => { const m = String(s || "").match(/^([가-힣0-9]+?동\d*가?)\s*(산?\d+)/); return m ? `${m[1]}${m[2]}` : ""; };

// 사용자 추가 단지 매칭: 구 + (법정동 + 본번) 우선, 없으면 같은 법정동 안에서 이름 유사
//  반환 { p: 정비사업 행, by: "지번"|"이름" } — 화면에 매칭 근거를 함께 표시해 사용자가 확인
export function matchProject(rows, { gu, umd, jibun, name }) {
  if (!rows || !rows.length) return null;
  const inGu = rows.filter((r) => r.gu === gu);
  const key = umd && jibun ? `${umd}${String(jibun).split("-")[0]}` : "";
  if (key) {
    const hits = inGu.filter((r) => mainJibun(r.j) === key);
    if (hits.length) return { p: hits.find((r) => /재건축/.test(r.t || "")) || hits[0], by: "지번" };
  }
  const n = norm(name);
  if (n.length >= 2 && umd) {
    const same = inGu.filter((r) => String(r.j || "").startsWith(umd));
    const hit = same.find((r) => norm(r.n) === n) || same.find((r) => norm(r.n).length >= 3 && n.includes(norm(r.n)));
    if (hit) return { p: hit, by: "이름" };
  }
  return null;
}

export const DATE_ROWS = [
  ["d_zone", "구역지정(최초)"], ["d_comm", "추진위원회 승인"], ["d_union", "조합설립인가"], ["d_review", "건축(통합)심의"],
  ["d_impl", "사업시행인가"], ["d_mgmt", "관리처분인가"], ["d_mig", "이주 시작"], ["d_cons", "착공"],
];
