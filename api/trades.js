// Vercel 서버리스 함수: 국토교통부 실거래가 API 실시간 조회
//  - 인증키는 코드에 넣지 않고 Vercel 환경변수 MOLIT_API_KEY 에서 읽음 (Decoding 키 권장)
//  - 아파트 매매(상세) + 분양권전매(입주권만) 최근 12개월
//  - 결과는 CDN에 6시간 캐시 → 공공데이터포털 호출량 최소화
//  - 응답·오류 메시지에 인증키가 노출되지 않도록 처리

const TRADE_URL = "https://apis.data.go.kr/1613000/RTMSDataSvcAptTradeDev/getRTMSDataSvcAptTradeDev";
const SILV_URL = "https://apis.data.go.kr/1613000/RTMSDataSvcSilvTrade/getRTMSDataSvcSilvTrade";

// 비교 신축단지 (신축 시세 추정용) — 전용 83~86㎡
const COMP_SPECS = [
  { key: "oneBaily", lawd: "11650", svc: "trade", re: "원베일리$", min: 83, max: 86 },
  { key: "acroRiverPark", lawd: "11650", svc: "trade", re: "^아크로리버파크$", min: 83, max: 86 },
  { key: "mapleXi", lawd: "11650", svc: "trade", re: "^메이플자이$", min: 83, max: 86 },
  { key: "acroRiverView", lawd: "11650", svc: "trade", re: "^아크로리버뷰신반포$", min: 83, max: 86 },
  { key: "cheongdamLe", lawd: "11680", svc: "silv", re: "^청담르엘$", min: 83, max: 86 },
  { key: "daechiPalace", lawd: "11680", svc: "trade", re: "^래미안대치팰리스", min: 83, max: 86 },
  { key: "dhXiGaepo", lawd: "11680", svc: "trade", re: "^디에이치자이개포$", min: 83, max: 86 },
  { key: "daechiSummit", lawd: "11680", svc: "trade", re: "^대치푸르지오써밋$", umd: "대치동", min: 83, max: 86 },
  { key: "daechiLe", lawd: "11680", svc: "trade", re: "^대치르엘$", min: 83, max: 86 },
  { key: "jamsilLe", lawd: "11710", svc: "silv", re: "^잠실르엘$", min: 83, max: 86 },
  { key: "jamsilIpark", lawd: "11710", svc: "silv", re: "^잠실래미안아이파크$", min: 83, max: 86 },
  { key: "jamsilEls", lawd: "11710", svc: "trade", re: "^(잠실)?엘스$", umd: "잠실동", min: 83, max: 86 },
  { key: "jamsilLe74", lawd: "11710", svc: "trade", re: "^잠실르엘$", min: 73, max: 75 },
];

// 대상 재건축 단지 (현재 구축 실거래)
const OWN_SPECS = [
  { key: "sb2_69", lawd: "11650", svc: "trade", re: "^신반포2(차)?$", umd: "잠원동", min: 65, max: 72 },
  { key: "sb2_107", lawd: "11650", svc: "trade", re: "^신반포2(차)?$", umd: "잠원동", min: 105, max: 110 },
  { key: "apg1_50", lawd: "11680", svc: "trade", re: "^한양1(차)?(영동한양)?$", umd: "압구정동", min: 49, max: 51 },
  { key: "apg1_91", lawd: "11680", svc: "trade", re: "^한양1(차)?(영동한양)?$", umd: "압구정동", min: 89, max: 92 },
  { key: "apg2_176", lawd: "11680", svc: "trade", re: "^한양2(차)?$", umd: "압구정동", min: 170, max: 180 },
  { key: "eunma_77", lawd: "11680", svc: "trade", re: "^은마(아파트)?$", umd: "대치동", min: 76, max: 78 },
  { key: "eunma_84", lawd: "11680", svc: "trade", re: "^은마(아파트)?$", umd: "대치동", min: 83, max: 85 },
  { key: "js5_76", lawd: "11710", svc: "trade", re: "^(잠실)?주공(아파트)?5단지$", umd: "잠실동", min: 75, max: 77 },
  { key: "js5_83", lawd: "11710", svc: "trade", re: "^(잠실)?주공(아파트)?5단지$", umd: "잠실동", min: 82, max: 84 },
];

const norm = (s) => String(s || "").replace(/[\s()·\-]/g, "");
const tag = (xml, t) => {
  const m = xml.match(new RegExp(`<${t}>([\\s\\S]*?)</${t}>`));
  return m ? m[1].trim() : "";
};

export function parseItems(xml) {
  const items = [];
  const re = /<item>([\s\S]*?)<\/item>/g;
  let m;
  while ((m = re.exec(xml))) {
    const x = m[1];
    const amount = Number(tag(x, "dealAmount").replace(/,/g, ""));
    const area = Number(tag(x, "excluUseAr"));
    const y = tag(x, "dealYear"), mo = tag(x, "dealMonth"), d = tag(x, "dealDay");
    if (!amount || !area || !y) continue;
    items.push({
      name: tag(x, "aptNm"),
      umd: tag(x, "umdNm"),
      area,
      amount, // 만원
      date: `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`,
      cancelled: tag(x, "cdealType") === "O",
      ownership: tag(x, "ownershipGbn"), // 분양권전매: 분/입
    });
  }
  const totalCount = Number(tag(xml, "totalCount")) || items.length;
  const resultCode = tag(xml, "resultCode");
  return { items, totalCount, resultCode };
}

const median = (arr) => {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  const h = Math.floor(s.length / 2);
  return s.length % 2 ? s[h] : (s[h - 1] + s[h]) / 2;
};

export function summarize(spec, items) {
  const rx = new RegExp(spec.re);
  const hits = items.filter((t) =>
    !t.cancelled &&
    rx.test(norm(t.name)) &&
    (!spec.umd || t.umd === spec.umd) &&
    t.area >= spec.min && t.area <= spec.max &&
    (spec.svc !== "silv" || t.ownership.includes("입"))
  );
  if (!hits.length) return { count: 0, names: [] };
  const amounts = hits.map((t) => t.amount);
  const repArea = median(hits.map((t) => t.area)); // 대표 전용면적(중위)
  return {
    count: hits.length,
    median: median(amounts) / 10000, // 억원
    max: Math.max(...amounts) / 10000,
    last: hits.map((t) => t.date).sort().at(-1),
    area: Math.round(repArea * 100) / 100,
    ppp: Math.round(median(amounts) / ((repArea / 0.75) * 0.3025)), // 만원/공급평 = 중위가 ÷ 대표 공급평
    names: [...new Set(hits.map((t) => t.name))],
  };
}

export function months12(now = new Date()) {
  const kst = new Date(now.getTime() + 9 * 3600 * 1000);
  let y = kst.getUTCFullYear(), m = kst.getUTCMonth() + 1;
  const out = [];
  for (let i = 0; i < 12; i++) {
    out.unshift(`${y}${String(m).padStart(2, "0")}`);
    m -= 1; if (m === 0) { m = 12; y -= 1; }
  }
  return out;
}

async function getXml(url, tries = 2) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(12000) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.text();
    } catch (e) { lastErr = e; }
  }
  throw lastErr;
}

async function fetchMonth(base, key, lawd, ym) {
  const all = [];
  let page = 1, total = Infinity;
  while (all.length < total && page <= 5) {
    const url = `${base}?serviceKey=${key}&LAWD_CD=${lawd}&DEAL_YMD=${ym}&pageNo=${page}&numOfRows=1000`;
    const xml = await getXml(url);
    const p = parseItems(xml);
    if (p.resultCode && !/^0+$/.test(p.resultCode)) throw new Error(`API resultCode ${p.resultCode}`);
    all.push(...p.items);
    total = p.totalCount;
    if (!p.items.length) break;
    page += 1;
  }
  return all;
}

async function pool(tasks, n) {
  const res = new Array(tasks.length);
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => {
    while (i < tasks.length) { const k = i++; res[k] = await tasks[k]().then((v) => ({ ok: true, v }), (e) => ({ ok: false, e })); }
  }));
  return res;
}

export async function collect(fetchMonthFn, months) {
  const specs = [...COMP_SPECS, ...OWN_SPECS];
  const combos = [...new Set(specs.map((s) => `${s.svc}|${s.lawd}`))];
  const jobs = [];
  for (const c of combos) {
    const [svc, lawd] = c.split("|");
    for (const ym of months) jobs.push({ svc, lawd, ym });
  }
  const results = await pool(jobs.map((j) => () => fetchMonthFn(j.svc, j.lawd, j.ym)), 8);
  const byCombo = {};
  let failed = 0;
  const errs = [];
  results.forEach((r, idx) => {
    const k = `${jobs[idx].svc}|${jobs[idx].lawd}`;
    byCombo[k] = byCombo[k] || [];
    if (r.ok) byCombo[k].push(...r.v);
    else { failed += 1; errs.push(String((r.e && r.e.message) || r.e).slice(0, 120)); }
  });
  const comps = {}, own = {};
  for (const s of COMP_SPECS) comps[s.key] = summarize(s, byCombo[`${s.svc}|${s.lawd}`] || []);
  for (const s of OWN_SPECS) own[s.key] = summarize(s, byCombo[`${s.svc}|${s.lawd}`] || []);
  return { comps, own, calls: jobs.length, failed, errs };
}

export default async function handler(req, res) {
  const raw = process.env.MOLIT_API_KEY;
  if (!raw) {
    res.status(200).json({ ok: false, reason: "서버에 실거래가 API 인증키(MOLIT_API_KEY)가 등록되지 않았습니다." });
    return;
  }
  const key = raw.includes("%") ? raw.trim() : encodeURIComponent(raw.trim());
  const months = months12();
  const r = await collect((svc, lawd, ym) => fetchMonth(svc === "silv" ? SILV_URL : TRADE_URL, key, lawd, ym), months);
  const { comps, own, calls, failed } = r;
  const errSamples = new Set(r.errs.map((e) => e.split(key).join("***").split(raw.trim()).join("***")));
  const jobs = { length: calls };
  const ok = failed < jobs.length * 0.3; // 호출 30% 이상 실패 시 실시간 사용 안 함
  res.setHeader("Cache-Control", ok ? "s-maxage=21600, stale-while-revalidate=86400" : "no-store");
  res.status(200).json({
    ok,
    reason: ok ? undefined : `실거래가 API 호출 실패 (${failed}/${jobs.length}건)`,
    period: { from: months[0], to: months.at(-1) },
    fetchedAt: new Date().toISOString(),
    calls: jobs.length, failed, errors: [...errSamples].slice(0, 3),
    comps, own,
  });
}
