// Vercel 서버리스 함수: 구(시군구) 단위 실거래 요약 — "단지 추가" 기능용
//  GET /api/district?lawd=11680            최근 12개월
//  GET /api/district?lawd=11680&to=202608  지정 월까지 12개월(재현·발표용)
//  - 아파트 매매(상세) 12회 + 분양권전매 12회 = 24회 호출, 결과 6시간 CDN 캐시
//  - 응답: 단지별·평형별 거래 요약(complexes), 주변 신축·입주권 84㎡ 후보(comps)
import { TRADE_URL, SILV_URL, fetchMonth, pool, months12, monthsEnding, median, startBudget } from "./trades.js";

const SEOUL_LAWD = new Set(["11110", "11140", "11170", "11200", "11215", "11230", "11260", "11290", "11305", "11320", "11350", "11380", "11410", "11440", "11470", "11500", "11530", "11545", "11560", "11590", "11620", "11650", "11680", "11710", "11740"]);
const r2 = (v) => Math.round(v * 100) / 100;
const pppOf = (amounts, areas) => Math.round(median(amounts) / ((median(areas) / 0.75) * 0.3025)); // 만원/공급평

function stat(list) {
  const amounts = list.map((t) => t.amount), areas = list.map((t) => t.area);
  return {
    c: list.length,
    m: r2(median(amounts) / 10000),               // 중위가(억)
    x: r2(Math.max(...amounts) / 10000),          // 최고가(억)
    l: list.map((t) => t.date).sort().at(-1),     // 최근 거래일
    a: r2(median(areas)),                         // 대표 전용(㎡)
    p: pppOf(amounts, areas),                     // 공급평당(만원)
  };
}

export function summarizeDistrict(trades, silvs, endYear) {
  const ok = trades.filter((t) => !t.cancelled);
  // 1) 단지별·평형별 (평형 = 전용면적 반올림 ㎡)
  const byCx = new Map();
  for (const t of ok) {
    const k = `${t.umd}|${t.name}`;
    if (!byCx.has(k)) byCx.set(k, { n: t.name, u: t.umd, years: [], list: [] });
    const e = byCx.get(k); e.list.push(t); if (t.buildYear) e.years.push(t.buildYear);
  }
  const complexes = [];
  for (const e of byCx.values()) {
    const groups = new Map();
    for (const t of e.list) { const g = Math.round(t.area); if (!groups.has(g)) groups.set(g, []); groups.get(g).push(t); }
    complexes.push({
      n: e.n, u: e.u, y: e.years.length ? Math.round(median(e.years)) : null, c: e.list.length,
      g: [...groups.entries()].sort((a, b) => a[0] - b[0]).map(([g, list]) => ({ k: g, ...stat(list) })),
    });
  }
  complexes.sort((a, b) => b.c - a.c);

  // 2) 주변 신축 84㎡ 후보: 준공 20년 이내 매매 + 입주권, 3건 이상
  const comps = [];
  for (const e of byCx.values()) {
    const y = e.years.length ? Math.round(median(e.years)) : null;
    if (!y || y < endYear - 20) continue;
    const l84 = e.list.filter((t) => t.area >= 83 && t.area <= 86);
    if (l84.length >= 3) comps.push({ n: e.n, u: e.u, y, type: "매매", ...stat(l84) });
  }
  const sByName = new Map();
  for (const t of silvs) {
    if (t.cancelled || !String(t.ownership).includes("입") || t.area < 83 || t.area > 86) continue;
    const k = `${t.umd}|${t.name.replace(/\s/g, "")}`;
    if (!sByName.has(k)) sByName.set(k, { n: t.name.replace(/\s/g, ""), u: t.umd, list: [] });
    sByName.get(k).list.push(t);
  }
  for (const e of sByName.values()) if (e.list.length >= 3) comps.push({ n: e.n, u: e.u, y: null, type: "입주권", ...stat(e.list) });
  comps.sort((a, b) => b.p - a.p);
  return { complexes, comps };
}

export default async function handler(req, res) {
  const lawd = String((req.query && req.query.lawd) || "");
  const to = String((req.query && req.query.to) || "");
  if (!SEOUL_LAWD.has(lawd)) { res.status(400).json({ ok: false, reason: "서울 25개 구 코드만 지원합니다." }); return; }
  if (to && !/^20\d{4}$/.test(to)) { res.status(400).json({ ok: false, reason: "to는 YYYYMM 형식" }); return; }
  const raw = process.env.MOLIT_API_KEY;
  if (!raw) { res.status(200).json({ ok: false, reason: "서버에 실거래가 API 인증키(MOLIT_API_KEY)가 등록되지 않았습니다." }); return; }
  const key = raw.includes("%") ? raw.trim() : encodeURIComponent(raw.trim());
  const months = to ? monthsEnding(to) : months12();
  const jobs = [];
  for (const ym of months) { jobs.push({ svc: "trade", ym }); jobs.push({ svc: "silv", ym }); }
  startBudget();
  const results = await pool(jobs.map((j) => () => fetchMonth(j.svc === "silv" ? SILV_URL : TRADE_URL, key, lawd, j.ym)), 3);
  const trades = [], silvs = [], errs = [];
  results.forEach((r, i) => {
    if (r.ok) (jobs[i].svc === "silv" ? silvs : trades).push(...r.v);
    else errs.push(`${jobs[i].svc}/${jobs[i].ym}: ${String((r.e && r.e.message) || r.e).split(key).join("***").slice(0, 80)}`);
  });
  const failed = errs.length;
  const ok = failed <= 2; // 24건 중 2건(한두 달)까지만 누락 허용 — 누락 시 화면에 경고
  const out = summarizeDistrict(trades, silvs, Number(months.at(-1).slice(0, 4)));
  res.setHeader("Cache-Control", failed === 0 ? "s-maxage=21600, stale-while-revalidate=86400" : ok ? "s-maxage=1800" : "s-maxage=300");
  res.status(200).json({
    ok, partial: failed > 0,
    reason: ok ? (failed ? `${failed}개월분 조회 실패 — 거래 건수가 일부 적게 잡힐 수 있음` : undefined) : `실거래가 API 호출 실패 ${failed}/${jobs.length}건 (${(errs[0] || "").split(": ").slice(1).join(": ")})`,
    lawd, period: { from: months[0], to: months.at(-1) }, fetchedAt: new Date().toISOString(),
    calls: jobs.length, failed, errors: errs.slice(0, 3), ...out,
  });
}
