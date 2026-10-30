// =====================================================================
// 계산 엔진 (화면과 분리 — 엑셀 검산본과 대조 가능)
//  연환산 수익률 = 현금흐름 내재수익률(IRR)
//   · 자체 산정: t0 −(매수가×(1+취득부대비)), 매년 −보유세, 입주 시 +(입주시 신축가치 − 분담금)
//   · 민간 분석: t0 −총투자금(분담금·재초환 포함), 입주 시 +입주시 신축가치  → (V/총투)^(1/T)−1 과 동일
//  위험조정 초과수익 = 연환산 − (기준수익률 + 현재 사업단계 프리미엄)
//  단계별 기대가격  P_k = 순유입 ÷ (1 + r_k)^(입주까지 잔여),  r_k = r0 × 요구수익률_k ÷ 요구수익률_현재
// =====================================================================
import { PYEONG_84, PREMIUM, STAGES, gradeOf } from "./data.js";

// 비교단지(실시간 반영 가능) → 실거래 기반 신축시세 추정
export function deriveComplex(c, live) {
  const comps = c.comps.map((r) => {
    const lv = live && live.comps && live.comps[r.key];
    const useLive = !r.isJeonse && lv && lv.count > 0;
    const base = useLive
      ? { ...r, count: lv.count, median: lv.median, max: lv.max, last: lv.last, ppp: lv.ppp, src: "live" }
      : { ...r, src: c.isCustom ? "snap" : "fixed" };
    return { ...base, value: (base.ppp * (1 + r.adj) * PYEONG_84) / 10000 };
  });
  const used = comps.filter((r) => r.weight > 0);
  const wsum = used.reduce((s, r) => s + r.weight, 0);
  const ppp = used.reduce((s, r) => s + r.ppp * (1 + r.adj) * r.weight, 0) / wsum;
  const valueLow = (ppp * PYEONG_84) / 10000;
  const ownTrades = c.ownTrades.map((t) => {
    const lv = live && live.own && live.own[t.key];
    return lv && lv.count > 0
      ? { ...t, count: lv.count, median: lv.median, max: lv.max, last: lv.last, src: "live" }
      : { ...t, src: c.isCustom ? "snap" : "fixed" };
  });
  const repTrade = ownTrades.find((t) => t.key === c.rep.key);
  return {
    ...c, comps, ownTrades, compResultPpp: Math.round(ppp), valueLow,
    baseValue: (valueLow + c.valueHigh) / 2,
    baseYears: (c.yearsLow + c.yearsHigh) / 2,
    buy: repTrade ? repTrade.median : c.rep.buy,
    buySrc: repTrade ? repTrade.src : (c.isCustom ? "snap" : "fixed"),
    buyLast: repTrade ? repTrade.last : null,
    buyCount: repTrade ? repTrade.count : null,
    repMonthly: (live && live.own && live.own[c.rep.key] && live.own[c.rep.key].count > 0 && live.own[c.rep.key].monthly) || c.rep.monthly || [],
  };
}

function npv(cfs, r) { return cfs.reduce((s, cf) => s + cf.v / Math.pow(1 + r, cf.t), 0); }
export function irr(cfs) {
  let lo = -0.9, hi = 1.0;
  let flo = npv(cfs, lo), fhi = npv(cfs, hi);
  if (isNaN(flo) || isNaN(fhi) || flo * fhi > 0) return null;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2, fm = npv(cfs, mid);
    if (Math.abs(fm) < 1e-10) return mid;
    if (flo * fm < 0) { hi = mid; fhi = fm; } else { lo = mid; flo = fm; }
  }
  return (lo + hi) / 2;
}

// ---------------------------------------------------------------------
// 재건축부담금(재초환) 개략 추정 — 재건축초과이익 환수에 관한 법률(2024.3.27 시행 개정) 구조 단순화
//  초과이익(1인당) = 종료시점 주택가액 − 개시시점 주택가액 − 정상주택가격상승분 − 개발비용
//   · 종료시점(준공): 입주시 신축가치 × 공시가격 현실화율
//   · 개발비용 1인당 ≈ 조합원 분담금 (일반분양 수입으로 충당된 사업비는 서로 상쇄 — 비례율 산식에서 유도)
//   · 개시시점: 조합설립인가일, 부과기간 10년 초과 시 준공부터 역산 10년 → 대부분 '준공 − 10년'
//   · 개시시점 가액: 현재 대표 평형 시세 × 현실화율을 시세 상승률로 개시시점까지 환산
//   · 정상주택가격상승분: 개시시점 가액 × ((1 + 정상상승률)^부과기간 − 1)
//  부담금: 8천만원 이하 면제, 초과분 5천만원 구간별 10·20·30·40·50% 누진
//  1세대1주택 장기보유 감면: 6년 10% … 9년 40%, 10년 50%, 15년 60%, 20년 70%
// ---------------------------------------------------------------------
export function levyByExcess(ex) { // 억원
  if (ex <= 0.8) return 0;
  if (ex <= 1.3) return (ex - 0.8) * 0.1;
  if (ex <= 1.8) return 0.05 + (ex - 1.3) * 0.2;
  if (ex <= 2.3) return 0.15 + (ex - 1.8) * 0.3;
  if (ex <= 2.8) return 0.30 + (ex - 2.3) * 0.4;
  return 0.50 + (ex - 2.8) * 0.5;
}
export function reliefRate(years) {
  if (years >= 20) return 0.7; if (years >= 15) return 0.6; if (years >= 10) return 0.5;
  if (years >= 9) return 0.4; if (years >= 8) return 0.3; if (years >= 7) return 0.2; if (years >= 6) return 0.1; return 0;
}
export function estimateLevy({ VT, T, share, buy, growth, stageIdx, arrive1 = 0, unionAgo = null }, p) {
  const rp = p.rp, n = p.normal == null ? growth : p.normal;
  // 개시시점(현재 기준 경과연수, 과거는 음수)
  let tStart;
  if (stageIdx >= 1) tStart = Math.max(T - 10, unionAgo == null ? -Infinity : -unionAgo);
  else tStart = Math.max(arrive1, T - 10);
  const period = T - tStart;
  const startVal = buy * rp * Math.pow(1 + growth, tStart);
  const normal = startVal * (Math.pow(1 + n, period) - 1);
  const endVal = VT * rp;
  const excess = endVal - share - startVal - normal;
  const gross = levyByExcess(excess);
  const relief = p.oneHouse ? reliefRate(T) : 0;
  return { levy: gross * (1 - relief), gross, relief, excess, endVal, startVal, normal, tStart, period, rp, n };
}

// a: { valueAdj, yearAdj, growth, buyAdj?, shareAdj? }
// opt: { basis: "self"|"private", acq, hold, rf, levyMode: "auto"|"manual"|"off", rp, normal(null=시세상승률), oneHouse }
export function evaluate(c, a, opt) {
  const T = c.baseYears + a.yearAdj;
  const req = opt.rf + PREMIUM[c.stageIdx];
  if (!(T > 0.2)) return { ...c, a, isValid: false, years: T, annualReturn: -9, riskAdj: -9, req };
  const V0 = c.baseValue * (1 + a.valueAdj);
  const VT = V0 * Math.pow(1 + a.growth, T);
  const buy = c.buy * (1 + (a.buyAdj || 0));
  const share = c.share * (1 + (a.shareAdj || 0));
  const acqCost = buy * opt.acq;
  const holdYear = buy * opt.hold;
  const selfBasis = opt.basis === "self" || c.privTotal == null; // 민간 분석값이 없는 단지(사용자 추가)는 자체 산정
  // 재건축부담금(재초환) — 입주 시 납부 가정. 민간 분석값 기준은 총투자금에 이미 포함
  const levyMode = opt.levyMode || "manual";
  const levyCalc = estimateLevy({ VT, T, share, buy, growth: a.growth, stageIdx: c.stageIdx, arrive1: (c.arrive[1] || 0) * (T / c.yearsLow), unionAgo: c.unionAgo ?? null },
    { rp: opt.rp ?? 0.69, normal: opt.normal ?? null, oneHouse: !!opt.oneHouse });
  const levy = !selfBasis ? 0 : levyMode === "auto" ? levyCalc.levy : levyMode === "manual" ? (c.levy || 0) : 0;
  const nHold = Math.max(0, Math.ceil(T) - 1);
  let totalCost, annualReturn, cfs;
  if (selfBasis) {
    totalCost = buy + acqCost + share + levy + holdYear * nHold;
    cfs = [{ t: 0, v: -(buy + acqCost) }];
    for (let k = 1; k <= nHold; k++) cfs.push({ t: k, v: -holdYear });
    cfs.push({ t: T, v: VT - share - levy });
    annualReturn = irr(cfs);
  } else {
    totalCost = c.privTotal;
    cfs = [{ t: 0, v: -totalCost }, { t: T, v: VT }];
    annualReturn = Math.pow(VT / totalCost, 1 / T) - 1;
  }
  const profit = VT - totalCost;
  const gap = c.rep.jeonse == null ? null : buy + acqCost - c.rep.jeonse;

  // 단계별 기대가격 경로 (대표 평형 시세 기준, 자체 분담금 사용)
  const net = VT - share - levy;
  const r0 = Math.pow(net / buy, 1 / T) - 1;
  const scale = T / c.yearsLow;
  const path = STAGES.map((nm, k) => {
    const t = c.arrive[k] * scale;
    const passed = k <= c.stageIdx;
    const rk = passed ? r0 : (r0 * (opt.rf + PREMIUM[k])) / req;
    const price = passed ? buy : net / Math.pow(1 + rk, Math.max(0, T - t));
    return { stage: nm, k, t: passed ? 0 : t, passed, rk, price, idx: (price / buy) * 100 };
  });
  const next = path[c.stageIdx + 1];
  const nextReturn = next && next.t > 0 ? Math.pow(next.price / buy, 1 / next.t) - 1 : null;

  return {
    ...c, a, selfBasis, isValid: annualReturn !== null, years: T, V0, VT, buy, share, levy, levyMode, levyCalc, acqCost, holdYear, nHold,
    holdTotal: holdYear * nHold, totalCost, profit, totalReturn: profit / totalCost,
    annualReturn: annualReturn === null ? -9 : annualReturn,
    req, riskAdj: (annualReturn === null ? -9 : annualReturn) - req, gap, grade: gradeOf(c.stageIdx),
    net, r0, path, next, nextReturn, cfs,
  };
}
