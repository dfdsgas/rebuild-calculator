import React, { useState, useMemo, useEffect } from 'react';
import {
  ResponsiveContainer, BarChart, Bar, LineChart, Line, XAxis, YAxis,
  Tooltip, Legend, ReferenceLine, Cell, CartesianGrid
} from 'recharts';
import {
  COMPLEXES, STAGES, PREMIUM, GRADE_NOTE, DEFAULT_COST, PYEONG_84, SCHEDULE_BASE,
  TRADE_PERIOD, TRADE_SOURCE, PRIVATE_SOURCE
} from './data.js';
import { deriveComplex, evaluate } from './engine.js';
import AddComplex from './AddComplex.jsx';

// =====================================================================
// 재건축 수익계산기 v4
//  - 총투자금: 자체 산정(실거래 매수가 + 분담금 + 취득·보유비용) / 민간 분석값 전환
//  - 연환산 수익률(IRR) + 사업단계 요구수익률 + 위험조정 초과수익, 순위 기준 전환
//  - 단계별 기대가격 경로, 실투자금(갭), 신뢰도 등급, 토네이도·히트맵 민감도
//  - 신축 시세: 국토부 실거래가 API 실시간(/api/trades), 실패 시 2026.8 수집 고정값
// =====================================================================

const BASE_ADJ = { valueAdj: 0, yearAdj: 0, growth: 0.035 };
const GROWTH_PRESETS = [[0, "0%"], [0.02, "2.0%"], [0.035, "3.5%"], [0.053, "5.3%"]];
const COLORS = { sinbanpo2: "#3B82F6", apgujeong5: "#F59E0B", eunma: "#10B981", jamsil5: "#1F3864" };
const EXTRA_COLORS = ["#E11D48", "#8B5CF6", "#0EA5E9", "#84CC16", "#F97316", "#14B8A6", "#A855F7", "#64748B"];
const STORE_KEY = "rebuild-calculator-custom-v1";
const loadCustom = () => { try { const v = JSON.parse(window.localStorage.getItem(STORE_KEY) || "[]"); return Array.isArray(v) ? v : []; } catch { return []; } };
const HIDE_KEY = "rebuild-calculator-hidden-v1";
const loadHidden = () => { try { const v = JSON.parse(window.localStorage.getItem(HIDE_KEY) || "[]"); return Array.isArray(v) ? v : []; } catch { return []; } };
const saveHidden = (v) => { try { window.localStorage.setItem(HIDE_KEY, JSON.stringify(v)); } catch { /* 무시 */ } };
const saveCustom = (v) => { try { window.localStorage.setItem(STORE_KEY, JSON.stringify(v)); } catch { /* 저장 불가 환경 무시 */ } };
const GRADE_STYLE = { C: "bg-rose-100 text-rose-800", B: "bg-amber-100 text-amber-800", A: "bg-emerald-100 text-emerald-800", "A+": "bg-emerald-600 text-white" };

const fmtMoney = (v) => (v !== null && v !== undefined && !isNaN(v) ? `${Number(v).toFixed(1)}억` : "-");
const fmtVal = (v) => (v !== null && v !== undefined && !isNaN(v) ? `${Math.round(v * 100) / 100}억` : "-");
const fmtSigned = (v) => (v > 0.0001 ? `+${fmtMoney(v)}` : fmtMoney(v));
const fmtPct = (v, d = 2) => (v !== null && v !== undefined && !isNaN(v) && v > -5 ? `${(Number(v) * 100).toFixed(d)}%` : "-");
const fmtPp = (v) => { if (v === null || v === undefined || isNaN(v) || v <= -5) return "-"; const x = Math.round(v * 10000) / 100; return `${x >= 0 ? "+" : ""}${(x === 0 ? 0 : x).toFixed(2)}%p`; };
const fmtSignPct = (v) => { const p = Math.round(v * 1000) / 10; return p > 0 ? `+${p}%` : `${p}%`; };
const fmtSignYears = (v) => { const y = Math.round(v * 10) / 10; return y > 0 ? `+${y.toFixed(1)}년` : `${y.toFixed(1)}년`; };
const fmtDate = (d) => (d && d !== "-" ? `'${d.slice(2, 4)}.${Number(d.slice(5, 7))}.${Number(d.slice(8, 10))}` : "-");
const fmtYM = (t) => { const m = SCHEDULE_BASE.m + Math.round(t * 12); const y = SCHEDULE_BASE.y + Math.floor((m - 1) / 12); return `'${String(y).slice(2)}.${((m - 1) % 12) + 1}`; };
const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;
const isBase = (a) => near(a.valueAdj, 0) && near(a.yearAdj, 0) && near(a.growth, BASE_ADJ.growth);

function SrcBadge({ src, date }) {
  if (src === "snap") return <span className="px-1.5 py-0.5 rounded bg-sky-100 text-sky-800 text-[10px] font-bold whitespace-nowrap">{date ? `${date.slice(2).replaceAll("-", ".")} 조회` : "추가 시 조회"}</span>;
  return src === "live"
    ? <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[10px] font-bold whitespace-nowrap">실시간</span>
    : <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 text-[10px] font-bold whitespace-nowrap">'26.8 수집</span>;
}
function GradeBadge({ g, testid }) {
  return <span data-testid={testid} title={GRADE_NOTE[g]} className={`px-1.5 py-0.5 rounded text-[10px] font-black ${GRADE_STYLE[g]}`}>신뢰도 {g}</span>;
}
function Chip({ active, onClick, children, testid }) {
  return (
    <button onClick={onClick} data-testid={testid}
      className={`px-2 py-0.5 rounded-md text-[11px] font-semibold border transition ${active ? "bg-[#1F3864] text-white border-[#1F3864]" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-100"}`}>
      {children}
    </button>
  );
}
function Toggle({ value, options, onChange, testid }) {
  return (
    <div className="inline-flex p-1 rounded-xl bg-slate-100 text-xs font-bold">
      {options.map(([v, label]) => (
        <button key={v} data-testid={`${testid}-${v}`} onClick={() => onChange(v)}
          className={`px-3 py-1.5 rounded-lg transition ${value === v ? "bg-white text-[#1F3864] shadow-sm" : "text-slate-600"}`}>{label}</button>
      ))}
    </div>
  );
}
function RangeRow({ label, valueText, valueClass = "text-slate-800", sub, min, max, step, value, onChange, testid, children }) {
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between items-baseline gap-2">
        <label className="text-xs font-bold text-slate-700">{label}</label>
        <span className={`text-base font-black ${valueClass}`}>{valueText}</span>
      </div>
      {sub && <div className="text-[11px] text-slate-500 text-right -mt-1">{sub}</div>}
      <input type="range" min={min} max={max} step={step} value={value} data-testid={testid}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-[#1F3864]" />
      {children && <div className="flex flex-wrap gap-1">{children}</div>}
    </div>
  );
}
function SectionHead({ no, title, desc, right }) {
  return (
    <div className="flex flex-col lg:flex-row lg:items-center justify-between pb-5 border-b border-slate-100 gap-4">
      <div>
        <span className="text-xs font-black tracking-widest text-[#1F3864] uppercase">SECTION {no}</span>
        <h2 className="text-2xl font-black text-slate-900 mt-0.5">{title}</h2>
        {desc && <p className="text-xs text-slate-500 mt-1">{desc}</p>}
      </div>
      {right}
    </div>
  );
}
function ComplexSelect({ value, onChange, testid, list }) {
  return (
    <select data-testid={testid} value={value} onChange={(e) => onChange(e.target.value)}
      className="text-sm font-bold border border-slate-300 rounded-xl px-3 py-2 bg-white text-[#1F3864]">
      {list.map((c) => <option key={c.id} value={c.id}>{c.name}{c.isCustom ? " (추가)" : ""}</option>)}
    </select>
  );
}

export default function App() {
  const [custom, setCustom] = useState(loadCustom);
  const ALL = useMemo(() => [...COMPLEXES, ...custom], [custom]);
  const [adj, setAdj] = useState(() => Object.fromEntries([...COMPLEXES, ...loadCustom()].map((c) => [c.id, { ...BASE_ADJ }])));
  const [levy, setLevy] = useState(() => Object.fromEntries([...COMPLEXES, ...loadCustom()].map((c) => [c.id, 0])));
  const [showAdd, setShowAdd] = useState(false);
  useEffect(() => { saveCustom(custom); }, [custom]);
  const addCustom = (c) => {
    setAdj((p) => ({ ...p, [c.id]: { ...BASE_ADJ } })); setLevy((p) => ({ ...p, [c.id]: 0 }));
    setCustom((p) => [...p, c]); setShowAdd(false); setDetailId(c.id);
  };
  const [hidden, setHidden] = useState(loadHidden); // 기본 단지 숨기기(삭제 아님, 언제든 복원)
  const [confirmDel, setConfirmDel] = useState(null); // 삭제 확인 대기 단지 id
  useEffect(() => { saveHidden(hidden); }, [hidden]);
  const SHOWN = useMemo(() => ALL.filter((c) => !hidden.includes(c.id)), [ALL, hidden]);
  const removeCustom = (id) => {
    setCustom((p) => p.filter((c) => c.id !== id));
    setHidden((h) => h.filter((x) => x !== id));
    setConfirmDel(null);
  };
  const toggleHide = (id) => setHidden((h) => (h.includes(id) ? h.filter((x) => x !== id) : SHOWN.length <= 1 ? h : [...h, id]));
  const removeAllCustom = () => { setCustom([]); setHidden((h) => h.filter((x) => COMPLEXES.some((c) => c.id === x))); setConfirmDel(null); };
  const colorOf = (id) => COLORS[id] || EXTRA_COLORS[Math.max(0, custom.findIndex((c) => c.id === id)) % EXTRA_COLORS.length];
  const [mode, setMode] = useState("all");
  const [basis, setBasis] = useState("self");
  const [rankBy, setRankBy] = useState("annual");
  const [cost, setCost] = useState(DEFAULT_COST);
  const [showAdv, setShowAdv] = useState(false);
  const [chartMode, setChartMode] = useState("annual");
  const [sensTab, setSensTab] = useState("tornado");
  const [sensId, setSensId] = useState("jamsil5");
  const [pathId, setPathId] = useState("jamsil5");
  const [detailId, setDetailId] = useState("jamsil5");
  const [live, setLive] = useState(null);
  const [liveStatus, setLiveStatus] = useState("loading");
  const [liveReason, setLiveReason] = useState("");
  const [dataMode, setDataMode] = useState("live");

  useEffect(() => {
    let alive = true;
    fetch("/api/trades")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((j) => {
        if (!alive) return;
        if (j && j.ok) { setLive(j); setLiveStatus("ok"); }
        else { setLiveStatus("fail"); setLiveReason((j && j.reason) || "응답 오류"); }
      })
      .catch(() => { if (alive) { setLiveStatus("fail"); setLiveReason("실거래가 서버에 연결하지 못했습니다"); } });
    return () => { alive = false; };
  }, []);

  const useLive = dataMode === "live" && liveStatus === "ok";
  const opt = useMemo(() => ({ basis, ...cost }), [basis, cost]);
  const ACTIVE = useMemo(() => ALL.map((c) => ({ ...deriveComplex(c, useLive && !c.isCustom ? live : null), levy: levy[c.id] || 0 })), [ALL, useLive, live, levy]);
  const fmtYm = (ym) => `${ym.slice(0, 4)}.${Number(ym.slice(4, 6))}`;
  const periodText = useLive ? `${fmtYm(live.period.from)} ~ ${fmtYm(live.period.to)} (최근 12개월, 실시간 조회)` : `${TRADE_PERIOD}, 2026.9 수집 고정값`;
  const fetchedText = useLive ? new Date(live.fetchedAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }) : "";

  const setAll = (key, val) => setAdj((p) => Object.fromEntries(Object.keys(p).map((id) => [id, { ...p[id], [key]: val }])));
  const setOne = (id, key, val) => setAdj((p) => ({ ...p, [id]: { ...p[id], [key]: val } }));
  const resetOne = (id) => setAdj((p) => ({ ...p, [id]: { ...BASE_ADJ } }));
  const applyPreset = (v, y, g) => setAdj(Object.fromEntries(ALL.map((c) => [c.id, { valueAdj: v, yearAdj: y, growth: g }])));
  const uniform = (key) => { const vs = ALL.map((c) => adj[c.id][key]); return vs.every((v) => near(v, vs[0])) ? vs[0] : null; };
  const avg = (key) => ALL.reduce((s, c) => s + adj[c.id][key], 0) / ALL.length;
  const uV = uniform("valueAdj"), uY = uniform("yearAdj"), uG = uniform("growth");
  const allUniform = uV !== null && uY !== null && uG !== null;

  const results = useMemo(() => ACTIVE.map((c) => evaluate(c, adj[c.id] || BASE_ADJ, opt)), [ACTIVE, adj, opt]);
  const shownRes = useMemo(() => results.filter((r) => !hidden.includes(r.id)), [results, hidden]);
  const ranked = useMemo(() => [...shownRes].sort((x, y) => (rankBy === "annual" ? y.annualReturn - x.annualReturn : y.riskAdj - x.riskAdj)), [shownRes, rankBy]);
  const rankOf = (id) => ranked.findIndex((c) => c.id === id) + 1;
  const byId = (id) => results.find((r) => r.id === id);
  const pick = (id) => shownRes.find((r) => r.id === id) || shownRes[0]; // 숨김·삭제된 단지 선택 시 첫 표시 단지로 대체
  const activeById = (id) => ACTIVE.find((c) => c.id === id);
  const d = pick(detailId);

  const goDetail = (id) => { setDetailId(id); const el = document.getElementById("evidence"); if (el) el.scrollIntoView({ behavior: "smooth", block: "start" }); };

  // 민감도: 상승률 추이
  const growthData = useMemo(() => {
    const out = [];
    for (let r = 0; r <= 7.05; r += 0.5) {
      const item = { growthRate: `${r.toFixed(1)}%` };
      ACTIVE.filter((c) => !hidden.includes(c.id)).forEach((c) => { const e = evaluate(c, { ...adj[c.id], growth: r / 100 }, opt); item[c.name] = e.isValid ? +(e.annualReturn * 100).toFixed(2) : null; });
      out.push(item);
    }
    return out;
  }, [ACTIVE, adj, opt, hidden]);

  // 민감도: 토네이도
  const tornado = useMemo(() => {
    const c = activeById(pick(sensId).id); const a = adj[c.id] || BASE_ADJ; const base = evaluate(c, a, opt).annualReturn;
    const f = (o) => (evaluate(c, { ...a, ...o }, opt).annualReturn - base) * 100;
    const rows = [
      { name: "신축 시세 ±10%", lo: f({ valueAdj: a.valueAdj - 0.1 }), hi: f({ valueAdj: a.valueAdj + 0.1 }) },
      { name: "사업기간 ±2년", lo: f({ yearAdj: a.yearAdj + 2 }), hi: f({ yearAdj: a.yearAdj - 2 }) },
      { name: "연 상승률 ±1%p", lo: f({ growth: Math.max(0, a.growth - 0.01) }), hi: f({ growth: a.growth + 0.01 }) },
    ];
    if (basis === "self" || c.privTotal == null) {
      rows.push({ name: "매수가 ±10%", lo: f({ buyAdj: 0.1 }), hi: f({ buyAdj: -0.1 }) });
      rows.push({ name: c.share >= 0 ? "분담금 ±30%" : "환급금 ±30%", lo: f({ shareAdj: c.share >= 0 ? 0.3 : -0.3 }), hi: f({ shareAdj: c.share >= 0 ? -0.3 : 0.3 }) });
    }
    return rows.map((r) => ({ ...r, lo: +r.lo.toFixed(2), hi: +r.hi.toFixed(2), width: Math.abs(r.hi - r.lo) })).sort((x, y) => y.width - x.width);
  }, [ACTIVE, adj, opt, sensId, basis, shownRes]);

  const heatYears = [-3, -2, -1, 0, 1, 2, 3, 5];
  const heatValues = [0.30, 0.20, 0.10, 0.05, 0.0, -0.05, -0.10, -0.20, -0.30];
  const heatColor = (v) => {
    if (v === null || isNaN(v)) return "bg-gray-100 text-gray-400";
    if (v < 0) return "bg-rose-100 text-rose-800";
    if (v < 0.02) return "bg-amber-50 text-amber-800";
    if (v < 0.04) return "bg-emerald-50 text-emerald-800";
    if (v < 0.06) return "bg-emerald-100 text-emerald-900";
    return "bg-emerald-300 text-emerald-950 font-bold";
  };

  const p = pick(pathId);
  const pathData = p.path.filter((s, k) => k >= p.stageIdx).map((s) => ({ ...s, label: s.k === p.stageIdx ? `현재(${STAGES[p.stageIdx]})` : s.stage, priceR: +s.price.toFixed(2) }));

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 pb-24">
      <header className="sticky top-0 z-50 bg-white/95 backdrop-blur border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <span className="w-3.5 h-3.5 rounded-full bg-[#1F3864]"></span>
            <span className="font-extrabold text-xl tracking-tight text-[#1F3864]">재건축 수익계산기</span>
          </div>
          <nav className="flex items-center gap-4 text-sm font-semibold text-slate-600">
            <a href="#stage" className="hidden md:inline hover:text-[#1F3864]">사업단계</a>
            <a href="#sens" className="hidden md:inline hover:text-[#1F3864]">민감도</a>
            <a href="#evidence" className="hidden sm:inline hover:text-[#1F3864]">근거 데이터</a>
            <a href="#guide" className="hover:text-[#1F3864]">이용 방법 →</a>
          </nav>
        </div>
      </header>

      <section className="bg-gradient-to-b from-white to-slate-100 border-b border-slate-200 py-14 px-4">
        <div className="max-w-5xl mx-auto text-center">
          <h1 className="text-3xl sm:text-5xl font-black text-slate-900 tracking-tight mb-4">
            재건축, <span className="text-[#1F3864] underline decoration-4 decoration-amber-400">지금 사면 얼마 남을까?</span>
          </h1>
          <p className="text-base sm:text-lg text-slate-600 max-w-2xl mx-auto leading-relaxed">
            서울 주요 재건축 4개 단지를 <strong>전용 84㎡ 배정 기준</strong>으로 비교합니다. 사업단계별 위험과 자금이 묶이는 기간까지 반영하고, 가정은 <strong>단지별로</strong> 바꿔볼 수 있습니다.
          </p>
          <div className="mt-5 inline-flex flex-col sm:flex-row items-center gap-2 sm:gap-3 bg-white border border-slate-200 rounded-xl px-3 py-2 shadow-sm" data-testid="data-status">
            <span className="flex items-center gap-1.5 text-xs font-semibold">
              <span className={`w-2 h-2 rounded-full ${liveStatus === "ok" ? (useLive ? "bg-emerald-500" : "bg-slate-400") : liveStatus === "loading" ? "bg-amber-400 animate-pulse" : "bg-rose-500"}`}></span>
              {liveStatus === "loading" && "국토부 실거래가 조회 중…"}
              {liveStatus === "ok" && (useLive ? `실시간 실거래 반영 · ${fetchedText} 조회${live.partial ? " (일부 단지 조회 실패 → 고정값)" : ""}` : "고정 기준값 사용 중 (2026.8까지 거래)")}
              {liveStatus === "fail" && `실시간 연결 실패 → 고정 기준값 사용 (${liveReason})`}
            </span>
            <div className="inline-flex p-0.5 rounded-lg bg-slate-100 text-[11px] font-bold">
              <button data-testid="data-live" disabled={liveStatus !== "ok"} onClick={() => setDataMode("live")}
                className={`px-2.5 py-1 rounded-md ${useLive ? "bg-white text-[#1F3864] shadow-sm" : "text-slate-500"} disabled:opacity-40`}>실시간</button>
              <button data-testid="data-fixed" onClick={() => setDataMode("fixed")}
                className={`px-2.5 py-1 rounded-md ${!useLive ? "bg-white text-[#1F3864] shadow-sm" : "text-slate-500"}`}>고정 기준</button>
            </div>
          </div>
        </div>
      </section>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 pt-10 space-y-16">
        {/* ===================== 01 가정 ===================== */}
        <section data-testid="sec-assume" className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 sm:p-8">
          <SectionHead no="01" title="핵심 가정 시뮬레이션"
            right={
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs text-slate-500 font-medium">전체 적용:</span>
                <button onClick={() => applyPreset(-0.10, 2.0, 0.02)} className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700">보수적</button>
                <button data-testid="preset-base" onClick={() => applyPreset(0, 0, 0.035)} className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-[#1F3864]/10 hover:bg-[#1F3864]/20 text-[#1F3864]">기준값</button>
                <button onClick={() => applyPreset(0.10, -1.0, 0.053)} className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700">낙관적</button>
              </div>
            } />

          <div className="mt-5 grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="rounded-xl border border-slate-200 p-3">
              <div className="text-[11px] font-bold text-slate-500 mb-1.5">① 조정 방식</div>
              <Toggle testid="mode" value={mode} onChange={setMode} options={[["all", "전체 일괄"], ["each", "단지별 개별"]]} />
            </div>
            <div className="rounded-xl border border-slate-200 p-3">
              <div className="text-[11px] font-bold text-slate-500 mb-1.5">② 총투자금 기준</div>
              <Toggle testid="basis" value={basis} onChange={setBasis} options={[["self", "자체 산정"], ["private", "민간 분석값"]]} />
              <div className="text-[10px] text-slate-500 mt-1.5 leading-snug">
                {basis === "self" ? "실거래 매수가 + 분담금(고시·조합 발표) + 취득·보유비용. 재초환은 아래 고급 가정에서 입력" : "민간 분석 총투자금(매매가+분담금+재초환 추정) 고정값"}
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 p-3">
              <div className="text-[11px] font-bold text-slate-500 mb-1.5">③ 순위 기준</div>
              <Toggle testid="rank" value={rankBy} onChange={setRankBy} options={[["annual", "연환산 수익률"], ["riskAdj", "위험조정 초과수익"]]} />
              <div className="text-[10px] text-slate-500 mt-1.5 leading-snug">위험조정 = 연환산 − (기준수익률 {fmtPct(cost.rf, 1)} + 사업단계 프리미엄)</div>
            </div>
          </div>

          {mode === "all" ? (
            <div className="mt-6">
              {!allUniform && (
                <div className="mb-4 text-xs bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-3 py-2">
                  현재 단지별로 가정이 다릅니다. 아래 슬라이더를 움직이면 해당 항목이 <strong>4개 단지 모두 같은 값</strong>으로 맞춰집니다.
                </div>
              )}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-slate-50/70 p-4 rounded-xl border border-slate-100">
                  <RangeRow label="신축 시세 조정 (기준 대비)" testid="all-value" valueText={uV === null ? "단지별 상이" : fmtSignPct(uV)}
                    valueClass={uV > 0 ? "text-emerald-600" : uV < 0 ? "text-rose-600" : "text-slate-800"}
                    min="-0.30" max="0.30" step="0.05" value={uV ?? avg("valueAdj")} onChange={(v) => setAll("valueAdj", v)} />
                  <div className="text-[11px] text-slate-500 flex justify-between pt-2"><span>−3~7% 실거래 추정</span><span>0% 기준</span><span>+3~7% 민간분석</span></div>
                </div>
                <div className="bg-slate-50/70 p-4 rounded-xl border border-slate-100">
                  <RangeRow label="사업기간 조정 (기준 대비)" testid="all-years" valueText={uY === null ? "단지별 상이" : fmtSignYears(uY)}
                    valueClass={uY > 0 ? "text-rose-600" : uY < 0 ? "text-emerald-600" : "text-slate-800"}
                    min="-3" max="5" step="0.5" value={uY ?? avg("yearAdj")} onChange={(v) => setAll("yearAdj", v)} />
                  <div className="text-[11px] text-slate-500 flex justify-between pt-2"><span>−2년 순조</span><span>0년 기준</span><span>+3년 지연</span></div>
                </div>
                <div className="bg-slate-50/70 p-4 rounded-xl border border-slate-100">
                  <RangeRow label="신축 시세 연 상승률 (입주 시까지)" testid="all-growth" valueText={uG === null ? "단지별 상이" : `${(uG * 100).toFixed(1)}%`} valueClass="text-[#1F3864]"
                    min="0" max="0.07" step="0.005" value={uG ?? avg("growth")} onChange={(v) => setAll("growth", v)} />
                  <div className="text-[11px] text-slate-500 flex justify-between pt-2"><span>0% 정체</span><span>2% 보수</span><span>3.5% 기준</span><span>5.3% 낙관</span></div>
                </div>
              </div>
            </div>
          ) : (
            <div className="mt-6">
              <p className="text-xs text-slate-500 mb-4">단지마다 가정을 따로 정합니다. 버튼으로 <strong>실거래 추정 / 기준 / 민간분석</strong> 값을 바로 불러올 수 있습니다.</p>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                {ACTIVE.filter((c) => !hidden.includes(c.id)).map((c) => {
                  const a = adj[c.id]; const r = byId(c.id);
                  const val = c.baseValue * (1 + a.valueAdj); const yrs = c.baseYears + a.yearAdj;
                  const vLow = c.valueLow / c.baseValue - 1, vHigh = c.valueHigh / c.baseValue - 1;
                  const yLow = c.yearsLow - c.baseYears, yHigh = c.yearsHigh - c.baseYears;
                  return (
                    <div key={c.id} data-testid={`panel-${c.id}`} className={`rounded-xl border p-4 space-y-4 ${isBase(a) ? "border-slate-200 bg-slate-50/60" : "border-[#1F3864]/40 bg-indigo-50/30"}`}>
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="font-black text-slate-900">{c.name}</div>
                          <div className="text-[11px] text-slate-500">{STAGES[c.stageIdx]} · 총투자 {fmtMoney(r.totalCost)}</div>
                        </div>
                        <div className="text-right">
                          <div className="text-lg font-black text-[#1F3864]" data-testid={`panel-annual-${c.id}`}>{fmtPct(r.annualReturn)}</div>
                          <div className="text-[11px] text-slate-500">{rankOf(c.id)}위</div>
                        </div>
                      </div>
                      <RangeRow label="신축 시세 (전용84)" testid={`v-${c.id}`} valueText={fmtVal(val)}
                        sub={`기준 대비 ${fmtSignPct(a.valueAdj)} · 평당 ${(val / PYEONG_84).toFixed(2)}억`}
                        valueClass={a.valueAdj > 0.0001 ? "text-emerald-600" : a.valueAdj < -0.0001 ? "text-rose-600" : "text-slate-800"}
                        min="-0.30" max="0.30" step="0.01" value={a.valueAdj} onChange={(v) => setOne(c.id, "valueAdj", v)}>
                        <Chip active={near(a.valueAdj, vLow)} onClick={() => setOne(c.id, "valueAdj", vLow)}>실거래 {c.valueLow.toFixed(1)}</Chip>
                        <Chip active={near(a.valueAdj, 0)} onClick={() => setOne(c.id, "valueAdj", 0)}>기준 {Math.round(c.baseValue * 100) / 100}</Chip>
                        {!c.isCustom && <Chip active={near(a.valueAdj, vHigh)} onClick={() => setOne(c.id, "valueAdj", vHigh)}>민간 {c.valueHigh.toFixed(1)}</Chip>}
                      </RangeRow>
                      <RangeRow label="입주까지 기간" testid={`y-${c.id}`} valueText={`${yrs.toFixed(1)}년`} sub={`기준 대비 ${fmtSignYears(a.yearAdj)}`}
                        valueClass={a.yearAdj > 0.01 ? "text-rose-600" : a.yearAdj < -0.01 ? "text-emerald-600" : "text-slate-800"}
                        min="-3" max="5" step="0.1" value={a.yearAdj} onChange={(v) => setOne(c.id, "yearAdj", v)}>
                        {!c.isCustom && <Chip active={near(a.yearAdj, yLow)} onClick={() => setOne(c.id, "yearAdj", yLow)}>자체 {c.yearsLow}년</Chip>}
                        <Chip active={near(a.yearAdj, 0)} onClick={() => setOne(c.id, "yearAdj", 0)}>기준 {c.baseYears}년</Chip>
                        {!c.isCustom && <Chip active={near(a.yearAdj, yHigh)} onClick={() => setOne(c.id, "yearAdj", yHigh)}>민간 {c.yearsHigh}년</Chip>}
                      </RangeRow>
                      <RangeRow label="연 상승률" testid={`g-${c.id}`} valueText={`${(a.growth * 100).toFixed(1)}%`} valueClass="text-[#1F3864]"
                        min="0" max="0.07" step="0.005" value={a.growth} onChange={(v) => setOne(c.id, "growth", v)}>
                        {GROWTH_PRESETS.map(([g, t]) => <Chip key={t} active={near(a.growth, g)} onClick={() => setOne(c.id, "growth", g)}>{t}</Chip>)}
                      </RangeRow>
                      <div className="flex justify-between items-center pt-1">
                        <button onClick={() => goDetail(c.id)} className="text-[11px] font-semibold text-[#1F3864] hover:underline">근거 데이터 보기 ↓</button>
                        <button onClick={() => resetOne(c.id)} disabled={isBase(a)} className="text-[11px] font-semibold text-slate-500 hover:text-slate-800 disabled:opacity-40">기준값으로</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="mt-6 border-t border-slate-100 pt-4">
            <button data-testid="adv-toggle" onClick={() => setShowAdv(!showAdv)} className="text-xs font-bold text-slate-600 hover:text-[#1F3864]">
              {showAdv ? "▾" : "▸"} 고급 가정 (취득·보유비용, 기준수익률, 재초환)
            </button>
            {showAdv && (
              <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <RangeRow label="취득부대비율" testid="acq" valueText={fmtPct(cost.acq, 1)} min="0" max="0.134" step="0.002" value={cost.acq} onChange={(v) => setCost({ ...cost, acq: v })} />
                  <RangeRow label="보유세(매수가 대비/년)" testid="hold" valueText={fmtPct(cost.hold, 2)} min="0" max="0.015" step="0.0005" value={cost.hold} onChange={(v) => setCost({ ...cost, hold: v })} />
                  <RangeRow label="기준수익률(무위험)" testid="rf" valueText={fmtPct(cost.rf, 1)} min="0.02" max="0.05" step="0.0025" value={cost.rf} onChange={(v) => setCost({ ...cost, rf: v })} />
                  <p className="sm:col-span-3 text-[11px] text-slate-500 leading-relaxed">
                    · 취득부대비 4%: 1주택 취득세·중개보수 수준 [가정] — 다주택 중과 시 상향<br />
                    · 보유세 0.4%/년: 재산세·종부세 평균치 [가정] · 기준수익률 3%: 국고채 10년물 수준 [확인필요]
                  </p>
                </div>
                <div>
                  <div className="text-xs font-bold text-slate-700 mb-2">재건축부담금(재초환) 추정 — 자체 산정에만 적용, 입주 시 납부</div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {SHOWN.map((c) => (
                      <label key={c.id} className="text-[11px] text-slate-600">
                        {c.name}
                        <div className="flex items-center gap-1 mt-0.5">
                          <input type="number" min="0" max="30" step="0.5" value={levy[c.id] || 0} data-testid={`levy-${c.id}`}
                            onChange={(e) => setLevy({ ...levy, [c.id]: Math.max(0, parseFloat(e.target.value) || 0) })}
                            className="w-full border border-slate-300 rounded-md px-2 py-1 text-xs" />
                          <span>억</span>
                        </div>
                      </label>
                    ))}
                  </div>
                  <p className="text-[11px] text-rose-600 mt-2 leading-relaxed">
                    기본값 0 = 미반영. 재건축초과이익 환수에 관한 법률에 따른 부담금은 단지별 공식 통지액이 없어 넣지 않았습니다 [확인필요]. 고가 단지일수록 부담이 커 순위에 영향이 큽니다.
                  </p>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* ===================== 02 랭킹 ===================== */}
        <section data-testid="sec-rank" className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2">
            <div>
              <span className="text-xs font-black tracking-widest text-[#1F3864] uppercase">SECTION 02</span>
              <h2 className="text-2xl font-black text-slate-900 mt-0.5">단지별 기대수익률 랭킹</h2>
            </div>
            <div className="flex flex-col sm:items-end gap-2">
            <button data-testid="add-open" onClick={() => setShowAdd(!showAdd)} className="px-3 py-2 rounded-lg bg-[#1F3864] text-white text-xs font-bold hover:bg-[#162a4d]">＋ 다른 재건축 단지 추가</button>
            <p className="text-xs text-slate-500 font-medium">
              순위 기준: <strong className="text-[#1F3864]">{rankBy === "annual" ? "연환산 수익률(IRR)" : "위험조정 초과수익"}</strong> · 총투자금: <strong className="text-[#1F3864]">{basis === "self" ? "자체 산정" : "민간 분석값"}</strong>
            </p>
            </div>
          </div>

          {showAdd && <AddComplex onAdd={addCustom} onClose={() => setShowAdd(false)} />}
          <div data-testid="manage-bar" className="bg-white rounded-xl border border-slate-200 p-3 flex flex-col gap-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-bold text-slate-700">비교 대상 {SHOWN.length}개 <span className="font-normal text-slate-500">— 눌러서 표시/숨기기, 추가 단지는 ✕로 삭제</span></span>
              <div className="flex items-center gap-2 text-[11px]">
                {hidden.length > 0 && <button data-testid="show-all" onClick={() => setHidden([])} className="font-semibold text-[#1F3864] hover:underline">숨긴 단지 모두 표시</button>}
                {custom.length > 0 && (confirmDel === "__all__"
                  ? <span className="flex items-center gap-1"><span className="text-rose-600 font-bold">추가 단지 {custom.length}개 모두 삭제할까요?</span>
                      <button data-testid="del-all-yes" onClick={removeAllCustom} className="px-2 py-0.5 rounded bg-rose-600 text-white font-bold">삭제</button>
                      <button onClick={() => setConfirmDel(null)} className="px-2 py-0.5 rounded bg-slate-100 font-bold">취소</button></span>
                  : <button data-testid="del-all" onClick={() => setConfirmDel("__all__")} className="font-semibold text-rose-600 hover:underline">추가 단지 전체 삭제</button>)}
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {ALL.map((c) => {
                const on = !hidden.includes(c.id);
                return (
                  <span key={c.id} className={`inline-flex items-center rounded-full border text-xs font-semibold overflow-hidden ${on ? "border-[#1F3864] bg-indigo-50 text-[#1F3864]" : "border-slate-200 bg-slate-50 text-slate-400 line-through"}`}>
                    <button data-testid={`toggle-${c.id}`} onClick={() => toggleHide(c.id)} title={on ? "숨기기" : "다시 표시"} className="px-2.5 py-1">
                      {on ? "✓ " : ""}{c.name}{c.isCustom ? " (추가)" : ""}
                    </button>
                    {c.isCustom && (confirmDel === c.id
                      ? <span className="flex items-center gap-1 pr-1.5 no-underline"><button data-testid={`del-yes-${c.id}`} onClick={() => removeCustom(c.id)} className="px-1.5 rounded bg-rose-600 text-white">삭제</button><button onClick={() => setConfirmDel(null)} className="px-1.5 rounded bg-slate-200 text-slate-700">취소</button></span>
                      : <button data-testid={`del-${c.id}`} onClick={() => setConfirmDel(c.id)} title="삭제" className="pr-2 pl-0.5 text-slate-400 hover:text-rose-600">✕</button>)}
                  </span>
                );
              })}
            </div>
            {SHOWN.length <= 1 && <span className="text-[11px] text-amber-700">최소 1개 단지는 표시되어야 합니다.</span>}
          </div>

          {custom.length > 0 && (
            <p className="text-[11px] text-slate-500">· 기본 4개 단지는 고시·조합 자료로 정밀 검증한 사례, <span className="text-sky-700 font-bold">사용자 추가</span> 단지는 자동 조회 + 입력값 기반 추정입니다. 추가 단지는 이 브라우저에만 저장됩니다.</p>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
            {ranked.map((c, idx) => {
              const first = idx === 0; const top = c.ownTrades.find((t) => t.key === c.rep.key) || c.ownTrades[0];
              return (
                <div key={c.id} data-testid={`card-${c.id}`} className={`relative rounded-2xl bg-white p-5 flex flex-col shadow-sm hover:shadow-md transition ${first ? "ring-2 ring-[#1F3864]" : "border border-slate-200"}`}>
                  <div className="flex items-center justify-between mb-3 gap-1">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-black ${first ? "bg-[#1F3864] text-white" : "bg-slate-100 text-slate-600"}`}>{idx + 1}위</span>
                    <div className="flex items-center gap-1">
                      {!isBase(c.a) && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">가정 변경</span>}
                      <GradeBadge g={c.grade} testid={`grade-${c.id}`} />
                      {!c.isCustom && <button data-testid={`hide-${c.id}`} onClick={() => toggleHide(c.id)} disabled={SHOWN.length <= 1} title="이 단지 숨기기(상단 비교 대상에서 다시 표시)" className="ml-0.5 text-slate-300 hover:text-slate-600 text-xs font-bold disabled:opacity-30">✕</button>}
                    </div>
                  </div>
                  <h3 className="text-lg font-black text-slate-900 tracking-tight">{c.name}</h3>
                  <p className="text-xs text-slate-500 mb-3">{c.location}{c.householdsBefore ? ` · ${c.householdsBefore.toLocaleString()}→${c.householdsAfter.toLocaleString()}세대` : c.buildYear ? ` · ${c.buildYear}년 준공` : ""}</p>
                  {c.isCustom && (
                    <div className="flex items-center justify-between -mt-2 mb-3 text-[10px]">
                      <span className="px-1.5 py-0.5 rounded bg-sky-100 text-sky-800 font-bold">사용자 추가 · 자동 추정</span>
                      {confirmDel === c.id
                        ? <span className="flex items-center gap-1"><button data-testid={`remove-yes-${c.id}`} onClick={() => removeCustom(c.id)} className="px-2 py-0.5 rounded bg-rose-600 text-white font-bold">삭제 확인</button><button onClick={() => setConfirmDel(null)} className="px-2 py-0.5 rounded bg-slate-100 font-bold text-slate-600">취소</button></span>
                        : <button data-testid={`remove-${c.id}`} onClick={() => setConfirmDel(c.id)} className="px-2 py-0.5 rounded border border-rose-200 text-rose-600 hover:bg-rose-50 font-bold">삭제</button>}
                    </div>
                  )}
                  <div className="bg-slate-50 p-3.5 rounded-xl mb-3 border border-slate-100">
                    <div className="flex justify-between items-end">
                      <div>
                        <span className="text-[11px] font-semibold text-slate-500 block">연환산 수익률(IRR)</span>
                        <span className={`text-3xl font-black tracking-tight ${!c.isValid ? "text-slate-400" : c.annualReturn >= 0 ? "text-emerald-600" : "text-rose-600"}`} data-testid={`annual-${c.id}`}>{fmtPct(c.annualReturn)}</span>
                      </div>
                      <div className="text-right">
                        <span className="text-[11px] font-semibold text-slate-500 block">위험조정</span>
                        <span className={`text-base font-black ${c.riskAdj >= 0 ? "text-emerald-700" : "text-rose-600"}`} data-testid={`risk-${c.id}`}>{fmtPp(c.riskAdj)}</span>
                      </div>
                    </div>
                    <div className="mt-1.5 flex justify-between text-[11px] text-slate-600">
                      <span>단계 요구수익률 {fmtPct(c.req, 1)}</span>
                      <span className={c.profit >= 0 ? "text-emerald-600 font-bold" : "text-rose-600 font-bold"}>차익 {fmtSigned(c.profit)}</span>
                    </div>
                  </div>
                  <div className="space-y-1.5 text-xs mb-3">
                    <div className="flex justify-between"><span className="text-slate-500">총투자 → 입주시 가치</span><span className="font-semibold">{fmtMoney(c.totalCost)} → {fmtMoney(c.VT)}</span></div>
                    <div className="flex justify-between"><span className="text-slate-500">실투자금(전세 끼고)</span><span className="font-semibold" data-testid={`gap-${c.id}`}>{c.gap === null ? "전세 미입력" : fmtMoney(c.gap)}</span></div>
                    <div className="flex justify-between"><span className="text-slate-500">적용 가정</span><span className="font-semibold text-[#1F3864]">{fmtVal(c.V0)} · {c.years.toFixed(1)}년 · 연 {(c.a.growth * 100).toFixed(1)}%</span></div>
                    <div className="flex justify-between gap-2"><span className="text-slate-500 whitespace-nowrap">다음 단계 기대</span><span className="font-semibold text-right">{c.next ? `${c.next.stage}(${fmtYM(c.next.t)}) 연 ${fmtPct(c.nextReturn, 1)}` : "-"}</span></div>
                  </div>
                  <div className="rounded-lg bg-slate-50 border border-slate-100 p-2.5 text-[11px] leading-relaxed space-y-1">
                    <div><span className="font-bold text-slate-600">현재 실거래</span> {top.label} 중위 {top.median.toFixed(1)}억 ({top.count}건, 최근 {fmtDate(top.last)}) <SrcBadge src={top.src} date={c.snapDate} /></div>
                    <div><span className="font-bold text-slate-600">신축시세 근거</span> {c.compShort}</div>
                    <button onClick={() => goDetail(c.id)} data-testid={`evidence-link-${c.id}`} className="font-semibold text-[#1F3864] hover:underline">근거 데이터 보기 ↓</button>
                  </div>
                  <div className="pt-3 mt-auto">
                    <div className="flex justify-between text-[11px] mb-1 font-medium text-slate-500 mt-3"><span>사업단계: {STAGES[c.stageIdx]}</span><span>{c.stageIdx + 1}/{STAGES.length}</span></div>
                    <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden"><div className="bg-[#1F3864] h-full rounded-full transition-all" style={{ width: `${((c.stageIdx + 1) / STAGES.length) * 100}%` }} /></div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* 비교표 */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 sm:p-6">
            <h3 className="font-black text-slate-900 text-lg mb-1">단지 비교표</h3>
            <p className="text-xs text-slate-500 mb-4">전용 84㎡ 1채 배정 기준, 금액 억원. 순위 순으로 정렬</p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs min-w-[720px]" data-testid="compare-table">
                <thead><tr className="bg-slate-50 text-slate-600">
                  <th className="p-2.5 text-left font-bold">항목</th>
                  {ranked.map((c, i) => <th key={c.id} className="p-2.5 text-right font-bold">{i + 1}위 {c.name}</th>)}
                </tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {[
                    ["사업단계 / 신뢰도", (c) => `${STAGES[c.stageIdx]} / ${c.grade}`],
                    ...(basis === "self" ? [
                      ["매수가 (대표 평형 실거래 중위)", (c) => fmtVal(c.buy)],
                      ["+ 취득부대비", (c) => fmtMoney(c.acqCost)],
                      ["+ 분담금 (− 환급)", (c) => fmtSigned(c.share)],
                      ["+ 보유세 누계", (c) => fmtMoney(c.holdTotal)],
                      ["+ 재초환 추정", (c) => (c.levy ? fmtMoney(c.levy) : "미반영")],
                    ] : [["민간 분석 총투자금", (c) => (c.privTotal == null ? "없음→자체 산정" : fmtMoney(c.privTotal))]]),
                    ["= 총투자금", (c) => fmtMoney(c.totalCost), true],
                    ["실투자금 (매수+취득 − 전세)", (c) => (c.gap === null ? "-" : fmtMoney(c.gap))],
                    ["신축 84㎡ 시세 (현재 / 평당)", (c) => `${fmtVal(c.V0)} / ${(c.V0 / PYEONG_84).toFixed(2)}억`],
                    ["입주까지 기간", (c) => `${c.years.toFixed(1)}년`],
                    ["입주시 가치", (c) => fmtMoney(c.VT)],
                    ["차익", (c) => fmtSigned(c.profit)],
                    ["연환산 수익률 (IRR)", (c) => fmtPct(c.annualReturn), true],
                    ["단계 요구수익률", (c) => fmtPct(c.req, 1)],
                    ["위험조정 초과수익", (c) => fmtPp(c.riskAdj), true],
                    ["다음 단계까지 기대 연환산", (c) => (c.nextReturn !== null ? fmtPct(c.nextReturn, 1) : "-")],
                  ].map(([label, fn, strong]) => (
                    <tr key={label} className={strong ? "bg-indigo-50/40 font-bold text-[#1F3864]" : ""}>
                      <td className="p-2.5 text-slate-600 whitespace-nowrap">{label}</td>
                      {ranked.map((c) => <td key={c.id} className="p-2.5 text-right whitespace-nowrap">{fn(c)}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between pb-4 mb-4 border-b border-slate-100 gap-3">
              <div>
                <h3 className="font-black text-slate-900 text-lg">시각화 비교</h3>
                <p className="text-xs text-slate-500">연환산 수익률이 사업단계 요구수익률을 넘는지 확인하세요.</p>
              </div>
              <Toggle testid="chart" value={chartMode} onChange={setChartMode} options={[["annual", "연환산 vs 요구수익률"], ["costValue", "총투자금 vs 입주시가치"]]} />
            </div>
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                {chartMode === "annual" ? (
                  <BarChart data={ranked.map((c) => ({ name: c.name, 연환산: +(c.annualReturn * 100).toFixed(2), 요구수익률: +(c.req * 100).toFixed(2) }))} margin={{ top: 20, right: 20, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                    <XAxis dataKey="name" stroke="#64748B" fontSize={12} tickLine={false} />
                    <YAxis stroke="#64748B" fontSize={12} tickFormatter={(v) => `${v}%`} tickLine={false} />
                    <Tooltip formatter={(v, n) => [`${Number(v).toFixed(2)}%`, n]} />
                    <Legend wrapperStyle={{ fontSize: '12px' }} />
                    <ReferenceLine y={0} stroke="#94A3B8" />
                    <Bar dataKey="연환산" fill="#1F3864" radius={[6, 6, 0, 0]} />
                    <Bar dataKey="요구수익률" fill="#CBD5E1" radius={[6, 6, 0, 0]} />
                  </BarChart>
                ) : (
                  <BarChart data={ranked.map((c) => ({ name: c.name, 총투자금: +c.totalCost.toFixed(1), 입주시가치: +c.VT.toFixed(1) }))} margin={{ top: 20, right: 20, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                    <XAxis dataKey="name" stroke="#64748B" fontSize={12} tickLine={false} />
                    <YAxis stroke="#64748B" fontSize={12} tickFormatter={(v) => `${v}억`} tickLine={false} />
                    <Tooltip formatter={(v, n) => [`${Number(v).toFixed(1)}억원`, n]} />
                    <Legend wrapperStyle={{ fontSize: '12px' }} />
                    <Bar dataKey="총투자금" fill="#94A3B8" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="입주시가치" fill="#1F3864" radius={[4, 4, 0, 0]} />
                  </BarChart>
                )}
              </ResponsiveContainer>
            </div>
          </div>
        </section>

        {/* ===================== 03 사업단계·시간가치 ===================== */}
        <section id="stage" data-testid="sec-stage" className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 sm:p-8 scroll-mt-20">
          <SectionHead no="03" title="사업단계·시간가치 분석"
            desc="재건축 가격은 단계를 통과할 때마다 위험이 줄어 계단식으로 오릅니다. 단계가 이를수록 요구수익률이 높습니다."
            right={<div className="flex items-center gap-2"><span className="text-xs font-bold text-slate-700">경로 단지:</span><ComplexSelect list={SHOWN} testid="path-select" value={p.id} onChange={setPathId} /></div>} />

          <div className="mt-6 overflow-x-auto">
            <table className="w-full text-xs min-w-[860px] text-center" data-testid="stage-table">
              <thead><tr className="bg-slate-50 text-slate-600">
                <th className="p-2 text-left font-bold">단지</th>
                {STAGES.map((s, k) => <th key={s} className="p-2 font-bold">{s}<div className="text-[10px] font-medium text-slate-400">요구 {fmtPct(cost.rf + PREMIUM[k], 1)}</div></th>)}
                <th className="p-2 font-bold">신뢰도</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-100">
                {shownRes.map((c) => (
                  <tr key={c.id}>
                    <td className="p-2 text-left font-bold whitespace-nowrap">{c.name}</td>
                    {c.path.map((s) => (
                      <td key={s.k} className={`p-2 ${s.k === c.stageIdx ? "bg-[#1F3864] text-white font-black rounded" : s.passed ? "text-emerald-700" : "text-slate-600"}`}>
                        {s.k === c.stageIdx ? "현재" : s.passed ? "✓" : fmtYM(s.t)}
                      </td>
                    ))}
                    <td className="p-2"><GradeBadge g={c.grade} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-[11px] text-slate-500 mt-2">예정 시점은 기준일(2026.9.30)부터의 자체 일정 가정을 현재 적용 기간에 맞춰 비례 조정한 값입니다 [가정]. 신뢰도: {Object.entries(GRADE_NOTE).map(([g, n]) => `${g} ${n}`).join(" / ")}</p>
          </div>

          <div className="mt-8 grid grid-cols-1 lg:grid-cols-5 gap-6 items-start">
            <div className="lg:col-span-3">
              <h4 className="text-sm font-black text-slate-800 mb-1">{p.name} — 단계별 기대가격 경로 (대표 평형 {p.rep.label})</h4>
              <p className="text-[11px] text-slate-500 mb-3">현재 매수가 {fmtVal(p.buy)}에서 출발, 입주 시 순유입(신축가치 − 분담금{p.levy ? " − 재초환" : ""}) {fmtMoney(p.net)}까지</p>
              <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={pathData} margin={{ top: 20, right: 30, left: 10, bottom: 30 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                    <XAxis dataKey="label" stroke="#64748B" fontSize={10} interval={0} angle={-20} textAnchor="end" />
                    <YAxis stroke="#64748B" fontSize={11} tickFormatter={(v) => `${v}억`} domain={["auto", "auto"]} />
                    <Tooltip formatter={(v) => [`${Number(v).toFixed(2)}억`, "기대가격"]} />
                    <Line type="stepAfter" dataKey="priceR" stroke={colorOf(p.id)} strokeWidth={3} dot={{ r: 4 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="lg:col-span-2">
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full text-xs" data-testid="path-table">
                  <thead className="bg-slate-50 text-slate-600"><tr>
                    <th className="p-2 text-left font-bold">단계</th><th className="p-2 text-right font-bold">예정</th>
                    <th className="p-2 text-right font-bold">할인율</th><th className="p-2 text-right font-bold">기대가격</th><th className="p-2 text-right font-bold">현재=100</th>
                  </tr></thead>
                  <tbody className="divide-y divide-slate-100">
                    {pathData.map((s) => (
                      <tr key={s.k} className={s.k === p.stageIdx ? "font-bold text-[#1F3864]" : ""}>
                        <td className="p-2">{s.label}</td><td className="p-2 text-right">{s.k === p.stageIdx ? "현재" : fmtYM(s.t)}</td>
                        <td className="p-2 text-right">{fmtPct(s.rk, 2)}</td><td className="p-2 text-right">{fmtVal(s.price)}</td><td className="p-2 text-right">{s.idx.toFixed(1)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-3 text-[11px] text-slate-600 leading-relaxed bg-slate-50 rounded-lg p-3 border border-slate-100">
                · 시장 내재할인율 r0 = (순유입 ÷ 매수가)^(1/기간) − 1 = <b>{fmtPct(p.r0)}</b><br />
                · 단계 통과 시 r_k = r0 × 요구수익률_k ÷ 현재 요구수익률({fmtPct(p.req, 1)})<br />
                · 다음 단계({p.next ? p.next.stage : "-"}) 도달 시 기대 연환산 <b>{fmtPct(p.nextReturn, 1)}</b> — 이론치이며 금리·규제에 따라 실제와 다를 수 있음
              </div>
            </div>
          </div>
        </section>

        {/* ===================== 04 민감도 ===================== */}
        <section id="sens" data-testid="sec-sens" className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 sm:p-8 scroll-mt-20">
          <SectionHead no="04" title="민감도 분석" desc="어떤 가정이 흔들릴 때 수익률이 크게 바뀌는지 점검합니다."
            right={<Toggle testid="sens" value={sensTab} onChange={setSensTab} options={[["tornado", "토네이도"], ["heat", "히트맵"], ["line", "상승률별 추이"]]} />} />
          <div className="pt-6">
            {sensTab !== "line" && (
              <div className="flex items-center gap-2 mb-4"><span className="text-xs font-bold text-slate-700">단지 선택:</span><ComplexSelect list={SHOWN} testid="sens-select" value={pick(sensId).id} onChange={setSensId} />
                <span className="text-xs text-slate-500">현재 연환산 <b className="text-[#1F3864]">{fmtPct(pick(sensId).annualReturn)}</b></span></div>
            )}
            {sensTab === "tornado" && (
              <div>
                <p className="text-xs text-slate-600 mb-3">각 변수를 한쪽씩 바꿨을 때 연환산 수익률 변동폭(%p). 막대가 길수록 결과를 좌우하는 변수입니다.</p>
                <div className="h-72 w-full" data-testid="tornado">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={tornado} layout="vertical" stackOffset="sign" margin={{ top: 10, right: 30, left: 30, bottom: 10 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#E2E8F0" />
                      <XAxis type="number" stroke="#64748B" fontSize={11} tickFormatter={(v) => `${v}%p`} />
                      <YAxis type="category" dataKey="name" stroke="#64748B" fontSize={11} width={110} />
                      <Tooltip formatter={(v, n) => [`${v > 0 ? "+" : ""}${Number(v).toFixed(2)}%p`, n === "lo" ? "불리한 쪽" : "유리한 쪽"]} />
                      <ReferenceLine x={0} stroke="#475569" />
                      <Bar dataKey="lo" stackId="t" name="lo">{tornado.map((r, i) => <Cell key={i} fill={r.lo < 0 ? "#F43F5E" : "#10B981"} />)}</Bar>
                      <Bar dataKey="hi" stackId="t" name="hi">{tornado.map((r, i) => <Cell key={i} fill={r.hi < 0 ? "#F43F5E" : "#10B981"} />)}</Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <p className="text-[11px] text-slate-500 mt-2">빨강 = 불리한 쪽(시세↓·기간↑·상승률↓·매수가↑·분담금↑), 초록 = 유리한 쪽 · 가장 큰 변수: <b>{tornado[0].name}</b> ({tornado[0].lo.toFixed(2)} ~ +{tornado[0].hi.toFixed(2)}%p){basis === "private" && " · 매수가·분담금 변수는 자체 산정 기준에서만 표시"}</p>
              </div>
            )}
            {sensTab === "heat" && (() => {
              const hc = activeById(pick(sensId).id); const ha = adj[hc.id] || BASE_ADJ;
              return (
                <div>
                  <div className="text-xs text-slate-600 mb-3"><strong>기간 조정(가로)</strong> × <strong>시세 조정(세로)</strong> → 연환산 수익률 · 상승률은 이 단지의 현재 가정 <strong>{(ha.growth * 100).toFixed(1)}%</strong></div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-center border-collapse" data-testid="heatmap">
                      <thead><tr>
                        <th className="p-2 text-[11px] font-bold text-slate-400 border border-slate-200 bg-slate-50">시세 \ 기간</th>
                        {heatYears.map((y) => <th key={y} className={`p-2 text-[11px] font-bold border border-slate-200 ${near(y, ha.yearAdj) ? "bg-[#1F3864] text-white" : "bg-slate-50 text-slate-700"}`}>{y > 0 ? `+${y}년` : `${y}년`}</th>)}
                      </tr></thead>
                      <tbody>
                        {heatValues.map((v) => {
                          const sel = near(v, ha.valueAdj, 0.001);
                          return (
                            <tr key={v}>
                              <td className={`p-2 text-[11px] font-bold border border-slate-200 ${sel ? "bg-[#1F3864] text-white" : "bg-slate-50 text-slate-700"}`}>{fmtSignPct(v)}</td>
                              {heatYears.map((y) => {
                                const r = evaluate(hc, { ...ha, valueAdj: v, yearAdj: y }, opt); const an = r.isValid ? r.annualReturn : null;
                                return <td key={y} className={`p-2 text-xs border border-slate-200 font-medium ${heatColor(an)} ${sel && near(y, ha.yearAdj) ? "ring-2 ring-slate-900 font-black" : ""}`}>{an !== null ? `${(an * 100).toFixed(1)}%` : "-"}</td>;
                              })}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center justify-end gap-3 text-[11px] text-slate-500">
                    <span className="flex items-center gap-1"><span className="w-3 h-3 bg-rose-100 rounded"></span> 음수</span>
                    <span className="flex items-center gap-1"><span className="w-3 h-3 bg-amber-50 border border-amber-100 rounded"></span> 0~2%</span>
                    <span className="flex items-center gap-1"><span className="w-3 h-3 bg-emerald-50 border border-emerald-100 rounded"></span> 2~4%</span>
                    <span className="flex items-center gap-1"><span className="w-3 h-3 bg-emerald-100 rounded"></span> 4~6%</span>
                    <span className="flex items-center gap-1"><span className="w-3 h-3 bg-emerald-300 rounded"></span> 6% 이상</span>
                  </div>
                </div>
              );
            })()}
            {sensTab === "line" && (
              <div>
                <div className="mb-3 text-xs text-slate-500">가로축: 신축 시세 연 상승률 | 세로축: 연환산 수익률 (시세·기간은 단지별 현재 가정 유지){uG !== null && ` · 현재 ${(uG * 100).toFixed(1)}%(점선)`}</div>
                <div className="h-80 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={growthData} margin={{ top: 20, right: 30, left: 10, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                      <XAxis dataKey="growthRate" stroke="#64748B" fontSize={11} />
                      <YAxis stroke="#64748B" fontSize={11} tickFormatter={(v) => `${v}%`} />
                      <Tooltip formatter={(v, n) => [`${v}%`, n]} />
                      <Legend wrapperStyle={{ fontSize: '12px' }} />
                      {uG !== null && <ReferenceLine x={`${(Math.round(uG * 200) / 2).toFixed(1)}%`} stroke="#EF4444" strokeDasharray="4 4" label={{ value: '현재 가정', position: 'top', fill: '#EF4444', fontSize: 11 }} />}
                      {SHOWN.map((c) => <Line key={c.id} type="monotone" dataKey={c.name} stroke={colorOf(c.id)} strokeWidth={c.id === "jamsil5" ? 3 : 2} dot={false} />)}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* ===================== 05 근거 데이터 ===================== */}
        <section id="evidence" data-testid="sec-evidence" className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 sm:p-8 scroll-mt-20">
          <SectionHead no="05" title="근거 데이터 및 계산 과정" desc="신축 시세를 어느 단지에서, 언제 거래된 얼마의 실거래로 추정했는지 확인하세요."
            right={<div className="flex items-center gap-2"><span className="text-xs font-bold text-slate-700">단지 전환:</span><ComplexSelect list={SHOWN} testid="detail-select" value={d.id} onChange={setDetailId} /></div>} />

          <div className="mt-6">
            <h4 className="text-sm font-black text-slate-800 mb-3">① 기준값 구성</h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="rounded-xl border border-slate-200 p-4">
                <div className="text-xs font-bold text-slate-500 mb-2">신축 시세 (전용84 ≈ {PYEONG_84}평)</div>
                <div className="space-y-1 text-xs">
                  <div className="flex justify-between"><span>실거래 기반 추정 (보수)</span><b>{fmtVal(d.valueLow)}</b></div>
                  <div className="flex justify-between"><span>민간 분석 현재가치 (호가·임장)</span><b>{fmtMoney(d.valueHigh)}</b></div>
                  <div className="flex justify-between pt-1 border-t border-slate-100 text-[#1F3864]"><span className="font-bold">기준값 = 두 값의 중간</span><b>{fmtVal(d.baseValue)}</b></div>
                  <div className="text-[11px] text-slate-500">평당 {(d.baseValue / PYEONG_84).toFixed(2)}억</div>
                </div>
              </div>
              <div className="rounded-xl border border-slate-200 p-4">
                <div className="text-xs font-bold text-slate-500 mb-2">입주까지 기간</div>
                <div className="space-y-1 text-xs">
                  <div className="flex justify-between"><span>자체 가정 (고시·보도 일정)</span><b>{d.yearsLow}년</b></div>
                  <div className="flex justify-between"><span>민간 분석 소요시간</span><b>{d.yearsHigh}년</b></div>
                  <div className="flex justify-between pt-1 border-t border-slate-100 text-[#1F3864]"><span className="font-bold">기준값 = 두 값의 중간</span><b>{d.baseYears}년</b></div>
                </div>
              </div>
              <div className="rounded-xl border border-slate-200 p-4">
                <div className="text-xs font-bold text-slate-500 mb-2">총투자금 ({basis === "self" ? "자체 산정" : "민간 분석값"})</div>
                <div className="space-y-1 text-xs">
                  <div className="flex justify-between"><span>매수가 {d.rep.label} <SrcBadge src={d.buySrc} date={d.snapDate} /></span><b>{fmtVal(d.buy)}</b></div>
                  <div className="flex justify-between"><span>분담금(− 환급)</span><b>{fmtSigned(d.share)}</b></div>
                  <div className="flex justify-between"><span>취득·보유비용{d.levy ? "·재초환" : ""}</span><b>{fmtMoney(d.acqCost + d.holdTotal + (d.levy || 0))}</b></div>
                  <div className="flex justify-between pt-1 border-t border-slate-100 text-[#1F3864]"><span className="font-bold">자체 산정 총투자금</span><b>{fmtMoney(d.buy + d.acqCost + d.share + d.holdTotal + (d.levy || 0))}</b></div>
                  <div className="flex justify-between text-slate-500"><span>참고: 민간 분석 총투자금</span><span>{d.privTotal == null ? "없음" : fmtMoney(d.privTotal)}</span></div>
                </div>
              </div>
            </div>
            <div className="mt-3 text-[11px] text-slate-600 bg-slate-50 rounded-lg p-3 border border-slate-100 leading-relaxed">
              · 분담금 근거: {d.shareSrc}<br />· 참고: {d.shareAlt}<br />
              · 민간 분석 총투자금은 매매가 + 추가분담금 + 재초환 추정액(출처: {PRIVATE_SOURCE}). 자체 산정은 재초환 미반영(고급 가정에서 입력 가능)
            </div>
          </div>

          <div className="mt-8">
            <h4 className="text-sm font-black text-slate-800 mb-1">② 신축 시세 근거 — 비교 신축단지 실거래</h4>
            <p className="text-[11px] text-slate-500 mb-3">거래기간 {periodText} · {TRADE_SOURCE} · 금액은 거래 중위값(억원)<br />산식: 비교단지 공급평당 중위가 × (1 + 보정률) → 가중평균 → × {PYEONG_84}평</p>
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full text-xs min-w-[920px]" data-testid="comp-table">
                <thead className="bg-slate-50 text-slate-600"><tr className="text-left">
                  <th className="p-2.5 font-bold">비교 단지</th><th className="p-2.5 font-bold">준공</th><th className="p-2.5 font-bold">자료</th>
                  <th className="p-2.5 font-bold text-right">건수</th><th className="p-2.5 font-bold">시점</th><th className="p-2.5 font-bold text-right">중위가</th><th className="p-2.5 font-bold text-right">최고가</th>
                  <th className="p-2.5 font-bold">최근 거래</th><th className="p-2.5 font-bold text-right">평당(만원)</th><th className="p-2.5 font-bold text-right">보정</th><th className="p-2.5 font-bold text-right">가중치</th>
                  <th className="p-2.5 font-bold text-right">84㎡ 환산</th><th className="p-2.5 font-bold">보정 근거</th>
                </tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {d.comps.map((r, i) => (
                    <tr key={i} className={r.weight === 0 ? "text-slate-400" : "text-slate-800"}>
                      <td className="p-2.5 font-bold">{r.name}</td><td className="p-2.5">{r.built}</td><td className="p-2.5">{r.type}</td>
                      <td className="p-2.5 text-right">{r.count}</td><td className="p-2.5"><SrcBadge src={r.src} date={d.snapDate} /></td>
                      <td className="p-2.5 text-right font-semibold">{r.isJeonse ? `전세 ${r.median.toFixed(1)}억` : `${r.median.toFixed(1)}억`}</td>
                      <td className="p-2.5 text-right">{r.max ? `${r.max.toFixed(1)}억` : "-"}</td><td className="p-2.5">{fmtDate(r.last)}</td>
                      <td className="p-2.5 text-right">{r.ppp.toLocaleString()}</td><td className="p-2.5 text-right">{r.adj ? `+${Math.round(r.adj * 100)}%` : "0%"}</td>
                      <td className="p-2.5 text-right">{r.weight ? `${Math.round(r.weight * 100)}%` : "참고"}</td>
                      <td className="p-2.5 text-right font-semibold">{r.value.toFixed(1)}억</td><td className="p-2.5 text-[11px] leading-snug">{r.note}</td>
                    </tr>
                  ))}
                  <tr className="bg-indigo-50/60 font-bold text-[#1F3864]">
                    <td className="p-2.5" colSpan={8}>실거래 기반 추정 (가중평균)</td><td className="p-2.5 text-right">{d.compResultPpp.toLocaleString()}</td>
                    <td className="p-2.5" colSpan={2}></td><td className="p-2.5 text-right">{fmtVal(d.valueLow)}</td><td className="p-2.5 text-[11px] font-medium">→ 기준값의 하한(보수)</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="text-[11px] text-slate-500 mt-2">
              · 민간 분석 현재가치 {fmtMoney(d.valueHigh)}는 실거래 기반 추정 {fmtVal(d.valueLow)}보다 {((d.valueHigh / d.valueLow - 1) * 100).toFixed(1)}% 높음(대장·희소성 프리미엄) → 두 값의 중간을 기준값으로 사용<br />
              · 입주권 거래는 신고금액에 잔여 분담금 포함 여부가 거래별로 다를 수 있어 보수적 참고치로 사용 [확인필요] · 회색 행은 가중치 0(참고용)
            </p>
          </div>

          <div className="mt-8">
            <h4 className="text-sm font-black text-slate-800 mb-1">③ {d.name} 현재 실거래 (구축)</h4>
            <p className="text-[11px] text-slate-500 mb-3">매매 거래기간 {periodText} · 전세 중위는 2025.9~2026.8 수집값 · 억원</p>
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full text-xs min-w-[640px]" data-testid="own-table">
                <thead className="bg-slate-50 text-slate-600"><tr className="text-left">
                  <th className="p-2.5 font-bold">평형</th><th className="p-2.5 font-bold text-right">매매 건수</th><th className="p-2.5 font-bold text-right">매매 중위</th>
                  <th className="p-2.5 font-bold text-right">매매 최고</th><th className="p-2.5 font-bold">최근 거래일</th><th className="p-2.5 font-bold">시점</th><th className="p-2.5 font-bold text-right">전세 중위</th>
                </tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {d.ownTrades.map((t) => (
                    <tr key={t.key} className={t.key === d.rep.key ? "bg-indigo-50/40" : ""}>
                      <td className="p-2.5 font-bold">{t.label}{t.key === d.rep.key && <span className="ml-1 text-[10px] text-[#1F3864]">(대표 매물)</span>}</td>
                      <td className="p-2.5 text-right">{t.count}</td><td className="p-2.5 text-right font-semibold">{fmtVal(t.median)}</td>
                      <td className="p-2.5 text-right">{fmtVal(t.max)}</td><td className="p-2.5">{t.last.replaceAll("-", ".")}</td>
                      <td className="p-2.5"><SrcBadge src={t.src} date={d.snapDate} /></td><td className="p-2.5 text-right">{t.jeonse == null ? "-" : `${t.jeonse.toFixed(2)}억`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-[11px] text-slate-500 mt-2">· 실투자금 = 매수가 × (1 + 취득부대비) − 전세 중위. 이주 단계에서 전세보증금 반환이 필요(이주비 대출 등으로 충당) [확인필요: 이주비 조건]</p>
          </div>

          <div className="mt-8 grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
            <div className="space-y-3">
              <h4 className="text-sm font-black text-slate-800 mb-2">④ 계산 과정 (현재 가정)</h4>
              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between">
                <div><span className="text-xs text-slate-500 font-medium block">신축 84㎡ 현재 시세 × 시세조정({fmtSignPct(d.a.valueAdj)})</span></div>
                <span className="text-base font-bold">{fmtVal(d.V0)}</span>
              </div>
              <div className="p-3.5 bg-indigo-50/50 rounded-xl border border-indigo-100 flex items-center justify-between">
                <div><span className="text-xs text-indigo-900 font-bold block">× (1 + {(d.a.growth * 100).toFixed(1)}%)^{d.years.toFixed(1)}년 = 입주시 가치</span></div>
                <span className="text-lg font-black text-[#1F3864]">{fmtMoney(d.VT)}</span>
              </div>
              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between">
                <div><span className="text-xs text-slate-500 font-medium block">− 총투자금 ({basis === "self" ? "자체 산정" : "민간 분석"})</span></div>
                <span className="text-base font-bold text-rose-600">− {fmtMoney(d.totalCost)}</span>
              </div>
              <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-200 flex items-center justify-between">
                <div><span className="text-xs text-emerald-800 font-bold block">= 차익 {fmtSigned(d.profit)}</span><span className="text-xs text-emerald-700">총수익률 {fmtPct(d.totalReturn)}</span></div>
                <div className="text-right"><span className="text-xl font-black text-emerald-700" data-testid="detail-annual">연환산 {fmtPct(d.annualReturn)}</span>
                  <span className="block text-xs font-bold text-emerald-800 mt-0.5">위험조정 {fmtPp(d.riskAdj)}</span></div>
              </div>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                {basis === "self"
                  ? "연환산 = 현금흐름 내재수익률(IRR): 매수 시 −(매수가+취득부대비), 매년 −보유세, 입주 시 +(입주시 가치 − 분담금 − 재초환). 분담금은 입주 시 정산 가정(실제 분할 납부 시 IRR 소폭 하락)"
                  : "연환산 = (입주시 가치 ÷ 민간 분석 총투자금)^(1 ÷ 기간) − 1"}
              </p>
            </div>
            <div className="space-y-4">
              <h4 className="text-sm font-black text-slate-800 mb-2">⑤ 사업 및 단지 정보</h4>
              <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
                <table className="w-full text-xs text-left"><tbody className="divide-y divide-slate-200">
                  <tr><th className="py-3 px-4 bg-slate-50 font-bold text-slate-600 w-1/3">위치</th><td className="py-3 px-4">{d.location}</td></tr>
                  <tr><th className="py-3 px-4 bg-slate-50 font-bold text-slate-600">진행 단계</th><td className="py-3 px-4"><span className="font-bold text-[#1F3864] mr-2">{STAGES[d.stageIdx]}</span>({d.stageNote}) <GradeBadge g={d.grade} /></td></tr>
                  <tr><th className="py-3 px-4 bg-slate-50 font-bold text-slate-600">세대수</th><td className="py-3 px-4">{d.householdsBefore ? `${d.householdsBefore.toLocaleString()} → ${d.householdsAfter.toLocaleString()}세대` : "미입력(사용자 추가 단지)"}</td></tr>
                  <tr><th className="py-3 px-4 bg-slate-50 font-bold text-slate-600">시공사</th><td className="py-3 px-4">{d.builder}</td></tr>
                  <tr><th className="py-3 px-4 bg-slate-50 font-bold text-slate-600">비례율</th><td className="py-3 px-4">{d.ratio ? `${(d.ratio * 100).toFixed(2)}%` : "미공개"} <span className="text-[11px] text-slate-400">({d.ratioSource})</span></td></tr>
                  <tr><th className="py-3 px-4 bg-slate-50 font-bold text-slate-600">투자 유의</th><td className="py-3 px-4 leading-relaxed">조합원 지위양도 제한(도시정비법 제39조), 재건축초과이익 환수 대상 여부 확인 필요 [확인필요]</td></tr>
                </tbody></table>
              </div>
            </div>
          </div>
        </section>

        {/* ===================== 06 이용 방법 ===================== */}
        <section id="guide" className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 sm:p-8">
          <span className="text-xs font-black tracking-widest text-[#1F3864] uppercase">SECTION 06</span>
          <h2 className="text-2xl font-black text-slate-900 mt-0.5 mb-6">이용 방법</h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
            {[
              ["가정 조정", "‘전체 일괄’ 또는 ‘단지별 개별’로 신축 시세·기간·상승률을 바꿉니다. 총투자금 기준(자체/민간)도 전환할 수 있습니다."],
              ["순위 확인", "연환산 수익률(IRR) 또는 사업단계 위험을 뺀 위험조정 초과수익 기준으로 순위를 봅니다."],
              ["단계·민감도", "단계별 기대가격 경로와 토네이도·히트맵으로 결과를 좌우하는 변수를 확인합니다."],
              ["근거 확인", "비교 신축단지 실거래(건수·최근 거래일)와 분담금 출처를 SECTION 05에서 확인합니다."],
            ].map(([t, desc], i) => (
              <div key={t} className="p-5 rounded-xl border border-slate-100 bg-slate-50/60">
                <span className="w-7 h-7 rounded-full bg-[#1F3864] text-white flex items-center justify-center font-black text-xs mb-3">{i + 1}</span>
                <h3 className="font-bold text-slate-800 text-sm mb-1.5">{t}</h3>
                <p className="text-xs text-slate-600 leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </section>

        <footer className="pt-8 border-t border-slate-200 text-xs text-slate-400 space-y-1.5 leading-relaxed">
          <p className="font-semibold text-slate-500">※ 고지 및 데이터 출처</p>
          <p>• 본 분석은 학술 과제용 추정치이며 투자 권유가 아닙니다.</p>
          <p>• 신축 시세·사업기간·상승률·단계 프리미엄·취득·보유비용은 가정값이며, 조정한 값에 따라 결과가 달라집니다. 양도세·대출이자는 미반영.</p>
          <p>• 실거래: {TRADE_SOURCE}, {periodText}</p>
          <p>• 사업 정보·분담금: 서울시 정비계획 결정 고시, 구청 사업시행계획인가 고시, 조합 발표</p>
          <p>• 민간 분석 현재가치·소요시간·총투자금: {PRIVATE_SOURCE}</p>
        </footer>
      </main>
    </div>
  );
}
