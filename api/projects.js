// Vercel 서버리스 함수: 서울특별시 도시정비사업 통계(정비구역별 추진단계·인가일·세대수)
//  서울 열린데이터광장 OpenAPI  TbSeoulRedevStatus  (OA-22856, 분기 갱신)
//  http://openapi.seoul.go.kr:8088/{KEY}/json/TbSeoulRedevStatus/{start}/{end}/  — 1회 최대 1,000건
//  - 인증키는 Vercel 환경변수 SEOUL_API_KEY (공공데이터포털 키와 별개)
//  - 결과 24시간 CDN 캐시, 실패 시 화면은 앱에 내장된 2026.6 기준 스냅샷(/seoul_projects.json) 사용
const BASE = "http://openapi.seoul.go.kr:8088";
const SERVICE = "TbSeoulRedevStatus";

const MAP = {
  CODE: "c", DISTRICT: "gu", ZONE_NM: "n", JIBUN_ADDR: "j", ROAD_ADDR: "r", BIZ_METHOD_PUBLIC_PRIVATE: "pp", BIZ_TYPE: "t", BIZ_STAGE: "s",
  EXISTING_HOUSEHOLDS: "h0", ZONE_DESIGNATION_INIT_YMD: "d_zone", ZONE_DESIGNATION_LAST_YMD: "d_zone2", PROMOTION_COMMITTEE_YMD: "d_comm",
  ASSOCIATION_ESTABLISHMENT_YMD: "d_union", ARCHITECTURAL_REVIEW_YMD: "d_review", BIZ_IMPLEMENTATION_INIT_YMD: "d_impl", BIZ_IMPLEMENTATION_LAST_YMD: "d_impl2",
  MGMT_DISPOSITION_INIT_YMD: "d_mgmt", MGMT_DISPOSITION_LAST_YMD: "d_mgmt2", MIGRATION_START_YMD: "d_mig", MIGRATION_END_YMD: "d_mig2",
  CONSTRUCTION_START_YMD: "d_cons", TOT_BUILT_HOUSEHOLDS: "h1", SALE_BUILT_HOUSEHOLDS: "h1s", RENT_BUILT_HOUSEHOLDS: "h1r",
};
const NUM = new Set(["h0", "h1", "h1s", "h1r"]);

// API 행(대문자 키) 또는 파일 JSON 행(소문자 키) 모두 처리
export function normalizeRow(row) {
  const o = {};
  for (const [k, v] of Object.entries(row)) {
    const s = MAP[k.toUpperCase()];
    if (!s || v === null || v === undefined) continue;
    const val = String(v).trim();
    if (!val) continue;
    if (NUM.has(s)) { const n = parseInt(val, 10); if (!isNaN(n)) o[s] = n; }
    else o[s] = s.startsWith("d_") ? val.slice(0, 10) : val;
  }
  return o;
}

async function getJson(url, tries = 3) {
  let last;
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(15000) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.json();
    } catch (e) { last = e; await new Promise((s) => setTimeout(s, 800 * (i + 1))); }
  }
  throw last;
}

export async function fetchAll(key, getter = getJson) {
  const rows = [];
  let total = Infinity;
  for (let start = 1; start <= total && start < 10000; start += 1000) {
    const j = await getter(`${BASE}/${encodeURIComponent(key)}/json/${SERVICE}/${start}/${start + 999}/`);
    const body = j && j[SERVICE];
    const code = (body && body.RESULT && body.RESULT.CODE) || (j && j.RESULT && j.RESULT.CODE) || "";
    if (!body) throw new Error(code === "INFO-100" ? "서울 열린데이터 인증키 오류(INFO-100)" : `응답 오류 ${code || "형식"}`);
    if (code && code !== "INFO-000") throw new Error(`서울 열린데이터 ${code}`);
    total = Number(body.list_total_count) || 0;
    rows.push(...(body.row || []).map(normalizeRow).filter((r) => /공동주택재건축|아파트지구재건축/.test(r.t || ""))); // 아파트 재건축만
  }
  return rows;
}

export default async function handler(req, res) {
  const key = process.env.SEOUL_API_KEY;
  if (!key) { res.setHeader("Cache-Control", "s-maxage=300"); res.status(200).json({ ok: false, reason: "서울 열린데이터 인증키(SEOUL_API_KEY) 미등록 — 내장 스냅샷 사용" }); return; }
  try {
    const rows = await fetchAll(key.trim());
    res.setHeader("Cache-Control", "s-maxage=86400, stale-while-revalidate=604800");
    res.status(200).json({ ok: true, source: "서울특별시 도시정비사업 통계(서울 열린데이터광장 OpenAPI TbSeoulRedevStatus)", fetchedAt: new Date().toISOString(), count: rows.length, rows });
  } catch (e) {
    res.setHeader("Cache-Control", "s-maxage=300");
    res.status(200).json({ ok: false, reason: String((e && e.message) || e).split(key).join("***").slice(0, 120) });
  }
}
