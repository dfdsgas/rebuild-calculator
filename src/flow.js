// =====================================================================
// 시세 흐름 비교 — 과거 월별 실거래(실선) + 미래 기대가격 경로(점선)와 역전·격차 분석
//  t: 일정 기준일(2026.9.30)부터 경과연수 (과거는 음수)
//  미래 기대가격 P(t) = 입주 시 순유입 ÷ (1 + r_현재단계)^(입주까지 남은 기간)
//   → 단계 안에서는 시간이 지날수록 완만히 오르고, 단계를 통과하면 할인율이 낮아져 한 번 더 뛰고,
//     입주 시점에 순유입(신축가치 − 분담금 − 재초환)과 같아짐
//  mode "rep": 대표 평형 매매가 / "p84": 84㎡ 환산가 = 대표 평형 가격 + 분담금 + 재초환 (입주 시 = 신축 84㎡ 가치)
// =====================================================================
import { SCHEDULE_BASE } from "./data.js";

export const ymToT = (ym) => (Number(ym.slice(0, 4)) * 12 + Number(ym.slice(4, 6)) - (SCHEDULE_BASE.y * 12 + SCHEDULE_BASE.m)) / 12;

function stageAt(r, t) {
  let cur = { stage: "현재", rk: r.r0 };
  for (const s of r.path) { if (!s.passed && s.t <= t + 1e-9) cur = s; }
  return cur;
}
export function priceAt(r, t, off = 0) {
  const tt = Math.min(Math.max(t, 0), r.years);
  const s = stageAt(r, tt);
  return r.net / Math.pow(1 + s.rk, r.years - tt) + off;
}

export function buildSeries(r, mode) {
  const off = mode === "p84" ? r.share + (r.levy || 0) : 0;
  const past = (r.repMonthly || []).map(([ym, v, n]) => ({ t: +ymToT(ym).toFixed(3), v: +(v + off).toFixed(2), n, ym }));
  const T = r.years;
  const knots = r.path.filter((s) => !s.passed && s.t > 0 && s.t < T).map((s) => s.t);
  const ts = new Set([0, T]);
  for (let t = 0; t < T; t += 0.25) ts.add(+t.toFixed(3));
  knots.forEach((k) => { ts.add(+Math.max(0, k - 0.001).toFixed(4)); ts.add(+k.toFixed(4)); }); // 단계 통과 직전·직후
  const fut = [...ts].sort((a, b) => a - b).map((t) => {
    const s = stageAt(r, t);
    const mark = r.path.find((p) => !p.passed && Math.abs(p.t - t) < 1e-3);
    return { t, v: +priceAt(r, t, off).toFixed(2), stage: t === 0 ? "현재" : mark ? mark.stage : s.stage, mark: t === 0 || !!mark };
  });
  return { id: r.id, name: r.name, past, fut, T, off, r };
}

// 두 단지 비교: 현재 격차 → 공통 기간 끝(먼저 입주하는 시점) 격차, 역전 시점과 계기
export function comparePair(A, B) {
  const end = Math.min(A.T, B.T);
  const va = (t) => priceAt(A.r, t, A.off), vb = (t) => priceAt(B.r, t, B.off);
  const gap0 = va(0) - vb(0), gapEnd = va(end) - vb(end);
  const crosses = [];
  let prev = Math.sign(Math.round(gap0 * 100));
  for (let t = 0.01; t <= end + 1e-9; t += 0.01) {
    const sg = Math.sign(Math.round((va(t) - vb(t)) * 100));
    if (sg !== 0 && prev !== 0 && sg !== prev) {
      const near = (S) => S.r.path.find((p) => !p.passed && Math.abs(p.t - t) <= 0.02);
      const na = near(A), nb = near(B);
      crosses.push({ t, lead: sg > 0 ? A.name : B.name, trigger: [na && `${A.name} ${na.stage}`, nb && `${B.name} ${nb.stage}`].filter(Boolean).join(", ") });
    }
    if (sg !== 0) prev = sg;
  }
  const trend = crosses.length ? "역전" : Math.abs(gapEnd) < Math.abs(gap0) - 0.05 ? "좁혀짐" : Math.abs(gapEnd) > Math.abs(gap0) + 0.05 ? "벌어짐" : "유지";
  return { a: A.name, b: B.name, end, gap0, gapEnd, crosses, trend };
}
