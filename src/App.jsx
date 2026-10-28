import React, { useState, useMemo } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ReferenceLine,
  Cell
} from 'recharts';

// --- 1. 정적 데이터 정의 ---
// [수정 1] 사업단계 표기 정합화: stageLevel은 STAGES 배열 위치와 일치해야 함
//   STAGES: 0 정비구역 지정, 1 조합설립인가, 2 통합심의, 3 사업시행인가, 4 관리처분인가, 5 이주·착공
const COMPLEXES = [
  {
    id: "sinbanpo2",
    name: "신반포2차",
    location: "서초구 잠원동",
    stage: "통합심의 통과",
    stageNote: "조합설립인가(2020.11) 후 통합심의 통과, 사업시행인가 준비",
    stageLevel: 2,
    householdsBefore: 1572,
    householdsAfter: 2057,
    builder: "현대건설",
    totalCost: 52.0,
    initialCost: 42.5,
    baseValue: 61.65,
    valueLow: 57.3,
    valueHigh: 66.0,
    baseYears: 8.9,
    yearsLow: 7.3,
    yearsHigh: 10.5,
    ratio: 0.707,
    ratioSource: "블로그 추정",
    shareNote: "30평 → 36평(전용84) 분담금 약 7.5억 (조합 발표 6.15억)"
  },
  {
    id: "apgujeong5",
    name: "압구정5구역",
    location: "강남구 압구정동",
    stage: "조합설립인가",
    stageNote: "시공자 선정 완료(2026.5), 통합심의 준비",
    stageLevel: 1,
    householdsBefore: 1232,
    householdsAfter: 1401,
    builder: "현대건설·한화",
    totalCost: 57.5,
    initialCost: 41.0,
    baseValue: 69.35,
    valueLow: 65.7,
    valueHigh: 73.0,
    baseYears: 11.25,
    yearsLow: 9.5,
    yearsHigh: 13.0,
    ratio: null,
    ratioSource: "미공개",
    shareNote: "추가분담금 10~30억 예상 (일반분양 물량 거의 없음)"
  },
  {
    id: "eunma",
    name: "대치 은마",
    location: "강남구 대치동",
    stage: "사업시행인가",
    stageNote: "2026.7 인가, 조합원분양신청 완료",
    stageLevel: 3,
    householdsBefore: 4424,
    householdsAfter: 5850,
    builder: "미정",
    totalCost: 41.8,
    initialCost: 30.0,
    baseValue: 46.4,
    valueLow: 44.8,
    valueHigh: 48.0,
    baseYears: 7.9,
    yearsLow: 7.3,
    yearsHigh: 8.5,
    ratio: 0.8219,
    ratioSource: "조합 발표",
    shareNote: "31평 → 전용84 분담금 7.44억 (조합 발표)"
  },
  {
    id: "jamsil5",
    name: "잠실주공5단지",
    location: "송파구 잠실동",
    stage: "사업시행인가",
    stageNote: "2026.7 인가, 2027년 관리처분 예상",
    stageLevel: 3,
    householdsBefore: 3930,
    householdsAfter: 6411,
    builder: "미정",
    totalCost: 38.4,
    initialCost: 36.0,
    baseValue: 48.75,
    valueLow: 46.5,
    valueHigh: 51.0,
    baseYears: 9.15,
    yearsLow: 7.8,
    yearsHigh: 10.5,
    ratio: null,
    ratioSource: "미공개",
    shareNote: "34평 → 전용84 약 2.77억 환급 (조합 발표)"
  }
];

const STAGES = ["정비구역 지정", "조합설립인가", "통합심의", "사업시행인가", "관리처분인가", "이주·착공"];

const fmtMoney = (val) => (val !== null && !isNaN(val) ? `${Number(val).toFixed(1)}억` : "-");
const fmtPct = (val) => (val !== null && !isNaN(val) ? `${(Number(val) * 100).toFixed(2)}%` : "-");
const fmtSignPct = (val) => (val > 0 ? `+${(val * 100).toFixed(0)}%` : `${(val * 100).toFixed(0)}%`);
const fmtSignYears = (val) => (val > 0 ? `+${val.toFixed(1)}년` : `${val.toFixed(1)}년`);

export default function App() {
  const [valueAdj, setValueAdj] = useState(0);
  const [yearAdj, setYearAdj] = useState(0);
  const [growth, setGrowth] = useState(0.035);

  const [chartMode, setChartMode] = useState("annual");
  const [activeTab, setActiveTab] = useState("line");
  const [selectedDetailId, setSelectedDetailId] = useState("jamsil5");
  const [heatmapComplexId, setHeatmapComplexId] = useState("jamsil5");

  const applyPreset = (v, y, g) => {
    setValueAdj(v);
    setYearAdj(y);
    setGrowth(g);
  };

  const calculatedComplexes = useMemo(() => {
    const list = COMPLEXES.map((comp) => {
      const years = comp.baseYears + yearAdj;
      if (years <= 0) {
        return { ...comp, years: 0, adjBaseValue: null, futureValue: null, profit: null,
                 totalReturn: null, annualReturn: -999, isValid: false };
      }
      const adjBaseValue = comp.baseValue * (1 + valueAdj);
      const futureValue = adjBaseValue * Math.pow(1 + growth, years);
      const profit = futureValue - comp.totalCost;
      const totalReturn = profit / comp.totalCost;
      const annualReturn = Math.pow(futureValue / comp.totalCost, 1 / years) - 1;
      return { ...comp, years, adjBaseValue, futureValue, profit, totalReturn, annualReturn, isValid: true };
    });
    return list.sort((a, b) => b.annualReturn - a.annualReturn);
  }, [valueAdj, yearAdj, growth]);

  const selectedDetailComplex = useMemo(() => {
    return calculatedComplexes.find((c) => c.id === selectedDetailId) || calculatedComplexes[0];
  }, [calculatedComplexes, selectedDetailId]);

  const growthTrendData = useMemo(() => {
    const data = [];
    for (let r = 0; r <= 7.05; r += 0.5) {
      const g = r / 100;
      const item = { growthRate: `${r.toFixed(1)}%`, gVal: g };
      COMPLEXES.forEach((c) => {
        const years = c.baseYears + yearAdj;
        if (years <= 0) {
          item[c.name] = null;
        } else {
          const adjVal = c.baseValue * (1 + valueAdj);
          const fv = adjVal * Math.pow(1 + g, years);
          const ann = (Math.pow(fv / c.totalCost, 1 / years) - 1) * 100;
          item[c.name] = parseFloat(ann.toFixed(2));
        }
      });
      data.push(item);
    }
    return data;
  }, [valueAdj, yearAdj]);

  const heatmapYears = [-3, -2, -1, 0, 1, 2, 3, 5];
  const heatmapValues = [0.30, 0.20, 0.10, 0.05, 0.0, -0.05, -0.10, -0.20, -0.30];

  const getHeatmapColor = (annual) => {
    if (annual === null || isNaN(annual)) return "bg-gray-100 text-gray-400";
    if (annual < 0) return "bg-rose-100 text-rose-800";
    if (annual < 0.02) return "bg-amber-50 text-amber-800";
    if (annual < 0.04) return "bg-emerald-50 text-emerald-800";
    if (annual < 0.06) return "bg-emerald-100 text-emerald-900";
    return "bg-emerald-300 text-emerald-950 font-bold";
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 pb-24">
      <header className="sticky top-0 z-50 bg-white/95 backdrop-blur border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <span className="w-3.5 h-3.5 rounded-full bg-[#1F3864]"></span>
            <span className="font-extrabold text-xl tracking-tight text-[#1F3864]">재건축 수익계산기</span>
          </div>
          <a href="#guide" className="text-sm font-semibold text-slate-600 hover:text-[#1F3864] transition-colors">
            이용 방법 안내 →
          </a>
        </div>
      </header>

      <section className="bg-gradient-to-b from-white to-slate-100 border-b border-slate-200 py-14 px-4">
        <div className="max-w-5xl mx-auto text-center">
          <h1 className="text-3xl sm:text-5xl font-black text-slate-900 tracking-tight mb-4">
            재건축, <span className="text-[#1F3864] underline decoration-4 decoration-amber-400">지금 사면 얼마 남을까?</span>
          </h1>
          <p className="text-base sm:text-lg text-slate-600 max-w-2xl mx-auto leading-relaxed">
            서울 주요 재건축 4개 단지를 <strong>전용 84㎡ 기준</strong>으로 비교합니다. 미래는 알 수 없으니, 가정은 직접 조정하세요.
          </p>
        </div>
      </section>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 pt-10 space-y-16">
        {/* 01 */}
        <section className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 sm:p-8">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-6 border-b border-slate-100 gap-4">
            <div>
              <span className="text-xs font-black tracking-widest text-[#1F3864] uppercase">SECTION 01</span>
              <h2 className="text-2xl font-black text-slate-900 mt-0.5">핵심 가정 시뮬레이션</h2>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-slate-500 mr-1 font-medium">빠른 설정:</span>
              <button onClick={() => applyPreset(-0.10, 2.0, 0.02)}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 transition">보수적으로</button>
              <button onClick={() => applyPreset(0, 0, 0.035)}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#1F3864]/10 hover:bg-[#1F3864]/20 text-[#1F3864] transition">기준값</button>
              <button onClick={() => applyPreset(0.10, -1.0, 0.053)}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 transition">낙관적으로</button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mt-6">
            <div className="space-y-3 bg-slate-50/70 p-4 rounded-xl border border-slate-100">
              <div className="flex justify-between items-baseline">
                <label className="text-sm font-bold text-slate-700">신축 시세 조정</label>
                <span className={`text-xl font-black ${valueAdj > 0 ? 'text-emerald-600' : valueAdj < 0 ? 'text-rose-600' : 'text-slate-800'}`}>
                  {fmtSignPct(valueAdj)}
                </span>
              </div>
              <input type="range" min="-0.30" max="0.30" step="0.05" value={valueAdj}
                onChange={(e) => setValueAdj(parseFloat(e.target.value))}
                className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-[#1F3864]" />
              <div className="text-[11px] text-slate-500 flex justify-between leading-tight pt-1">
                <span>-10% 보수(실거래)</span><span>0% 기준</span><span>+10% 낙관(호가)</span>
              </div>
            </div>

            <div className="space-y-3 bg-slate-50/70 p-4 rounded-xl border border-slate-100">
              <div className="flex justify-between items-baseline">
                <label className="text-sm font-bold text-slate-700">사업기간 조정</label>
                <span className={`text-xl font-black ${yearAdj > 0 ? 'text-rose-600' : yearAdj < 0 ? 'text-emerald-600' : 'text-slate-800'}`}>
                  {fmtSignYears(yearAdj)}
                </span>
              </div>
              <input type="range" min="-3" max="5" step="0.5" value={yearAdj}
                onChange={(e) => setYearAdj(parseFloat(e.target.value))}
                className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-[#1F3864]" />
              <div className="text-[11px] text-slate-500 flex justify-between leading-tight pt-1">
                <span>-2년 순조</span><span>0년 기준</span><span>+3년 지연</span>
              </div>
            </div>

            <div className="space-y-3 bg-slate-50/70 p-4 rounded-xl border border-slate-100">
              <div className="flex justify-between items-baseline">
                <label className="text-sm font-bold text-slate-700">연 상승률 (입주 시까지)</label>
                <span className="text-xl font-black text-[#1F3864]">{(growth * 100).toFixed(1)}%</span>
              </div>
              <input type="range" min="0" max="0.07" step="0.005" value={growth}
                onChange={(e) => setGrowth(parseFloat(e.target.value))}
                className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-[#1F3864]" />
              <div className="text-[11px] text-slate-500 flex justify-between leading-tight pt-1">
                <span>0% 정체</span><span>2% 보수</span><span>3.5% 기준</span><span>5.3% 낙관</span>
              </div>
            </div>
          </div>
        </section>

        {/* 02 */}
        <section className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2">
            <div>
              <span className="text-xs font-black tracking-widest text-[#1F3864] uppercase">SECTION 02</span>
              <h2 className="text-2xl font-black text-slate-900 mt-0.5">단지별 기대수익률 랭킹</h2>
            </div>
            <p className="text-xs text-slate-500 font-medium">연환산수익률 높은 순으로 실시간 재정렬됩니다.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
            {calculatedComplexes.map((c, idx) => {
              const isFirst = idx === 0;
              const isProfitable = c.annualReturn >= 0;
              return (
                <div key={c.id} data-testid={`card-${c.id}`}
                  className={`relative rounded-2xl bg-white p-5 flex flex-col justify-between transition-all duration-300 shadow-sm hover:shadow-md ${
                    isFirst ? "ring-2 ring-[#1F3864] border-transparent" : "border border-slate-200"}`}>
                  <div className="flex items-center justify-between mb-3">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-black ${
                      isFirst ? "bg-[#1F3864] text-white" : "bg-slate-100 text-slate-600"}`}>{idx + 1}위</span>
                    <span className="text-xs font-semibold text-slate-400">{c.location}</span>
                  </div>
                  <div>
                    <h3 className="text-lg font-black text-slate-900 tracking-tight">{c.name}</h3>
                    <p className="text-xs text-slate-500 mb-4">
                      {c.householdsBefore.toLocaleString()}세대 → {c.householdsAfter.toLocaleString()}세대
                    </p>
                    <div className="bg-slate-50 p-3.5 rounded-xl mb-4 border border-slate-100">
                      <span className="text-[11px] font-semibold text-slate-500 block mb-0.5">연환산 수익률</span>
                      <span className={`text-3xl font-black tracking-tight ${
                        !c.isValid ? "text-slate-400" : isProfitable ? "text-emerald-600" : "text-rose-600"}`}
                        data-testid={`annual-${c.id}`}>
                        {c.isValid ? fmtPct(c.annualReturn) : "-"}
                      </span>
                      <div className="mt-1 flex justify-between text-xs text-slate-600 font-medium">
                        <span>총수익률: {c.isValid ? fmtPct(c.totalReturn) : "-"}</span>
                        <span className={c.profit >= 0 ? "text-emerald-600 font-bold" : "text-rose-600 font-bold"}>
                          차익 {c.isValid ? (c.profit > 0 ? `+${fmtMoney(c.profit)}` : fmtMoney(c.profit)) : "-"}
                        </span>
                      </div>
                    </div>
                    <div className="space-y-2 text-xs mb-4">
                      <div className="flex justify-between items-center">
                        <span className="text-slate-500">투자금 흐름</span>
                        <span className="font-semibold text-slate-800">{fmtMoney(c.totalCost)} → {fmtMoney(c.futureValue)}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-slate-500">적용 잔여기간</span>
                        <span className="font-semibold text-[#1F3864]">{c.isValid ? `${c.years.toFixed(1)}년 후 입주` : "기간오류"}</span>
                      </div>
                    </div>
                    <div className="pt-2 border-t border-slate-100">
                      <div className="flex justify-between text-[11px] mb-1 font-medium text-slate-500">
                        {/* [수정 2] 진행막대 라벨을 STAGES 배열 기준으로 표시 */}
                        <span>사업단계: {STAGES[c.stageLevel]}</span>
                        <span>{c.stageLevel + 1}/{STAGES.length}</span>
                      </div>
                      <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden flex">
                        <div className="bg-[#1F3864] h-full rounded-full transition-all duration-500"
                          style={{ width: `${((c.stageLevel + 1) / STAGES.length) * 100}%` }} />
                      </div>
                    </div>
                  </div>
                  <div className="mt-4 pt-3 border-t border-dashed border-slate-200 text-[11px] text-slate-500 leading-snug">
                    💡 {c.shareNote}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between pb-4 mb-4 border-b border-slate-100 gap-3">
              <div>
                <h3 className="font-black text-slate-900 text-lg">시각화 비교</h3>
                <p className="text-xs text-slate-500">지표별 차이를 직관적으로 확인하세요.</p>
              </div>
              <div className="inline-flex p-1 rounded-xl bg-slate-100 text-xs font-semibold">
                <button onClick={() => setChartMode("annual")}
                  className={`px-3 py-1.5 rounded-lg transition ${chartMode === "annual" ? "bg-white text-[#1F3864] shadow-sm font-bold" : "text-slate-600"}`}>
                  연환산 수익률 비교</button>
                <button onClick={() => setChartMode("costValue")}
                  className={`px-3 py-1.5 rounded-lg transition ${chartMode === "costValue" ? "bg-white text-[#1F3864] shadow-sm font-bold" : "text-slate-600"}`}>
                  총투자금 vs 입주시가치</button>
              </div>
            </div>
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                {chartMode === "annual" ? (
                  <BarChart data={calculatedComplexes} margin={{ top: 20, right: 20, left: 0, bottom: 5 }}>
                    <XAxis dataKey="name" stroke="#64748B" fontSize={12} tickLine={false} />
                    <YAxis stroke="#64748B" fontSize={12} tickFormatter={(val) => `${val.toFixed(1)}%`} tickLine={false} />
                    <Tooltip formatter={(val) => [`${Number(val).toFixed(2)}%`, "연환산수익률"]} />
                    <ReferenceLine y={0} stroke="#94A3B8" />
                    <Bar dataKey={(item) => (item.isValid ? parseFloat((item.annualReturn * 100).toFixed(2)) : 0)} radius={[6, 6, 0, 0]}>
                      {calculatedComplexes.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={index === 0 ? "#1F3864" : "#94A3B8"} />
                      ))}
                    </Bar>
                  </BarChart>
                ) : (
                  <BarChart data={calculatedComplexes} margin={{ top: 20, right: 20, left: 0, bottom: 5 }}>
                    <XAxis dataKey="name" stroke="#64748B" fontSize={12} tickLine={false} />
                    <YAxis stroke="#64748B" fontSize={12} tickFormatter={(val) => `${val}억`} tickLine={false} />
                    {/* [수정 3] 툴팁 라벨: 원래 코드는 두 막대 모두 "입주시가치"로 표시되던 오류 */}
                    <Tooltip formatter={(val, name) => [`${Number(val).toFixed(1)}억원`, name]} />
                    <Legend wrapperStyle={{ fontSize: '12px' }} />
                    <Bar dataKey="totalCost" name="총투자금" fill="#94A3B8" radius={[4, 4, 0, 0]} />
                    <Bar dataKey={(item) => (item.isValid ? parseFloat(item.futureValue.toFixed(1)) : 0)}
                      name="입주시가치" fill="#1F3864" radius={[4, 4, 0, 0]} />
                  </BarChart>
                )}
              </ResponsiveContainer>
            </div>
          </div>
        </section>

        {/* 03 */}
        <section className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 sm:p-8">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-6 border-b border-slate-100 gap-4">
            <div>
              <span className="text-xs font-black tracking-widest text-[#1F3864] uppercase">SECTION 03</span>
              <h2 className="text-2xl font-black text-slate-900 mt-0.5">민감도 분석</h2>
              <p className="text-xs text-slate-500 mt-1">가정이 흔들릴 때 단지별 수익률은 어떻게 반응하는지 점검합니다.</p>
            </div>
            <div className="flex bg-slate-100 p-1 rounded-xl text-xs font-bold">
              <button onClick={() => setActiveTab("line")}
                className={`px-4 py-2 rounded-lg transition ${activeTab === "line" ? "bg-white text-[#1F3864] shadow-sm" : "text-slate-600"}`}>
                탭 A — 상승률별 추이</button>
              <button onClick={() => setActiveTab("heatmap")}
                className={`px-4 py-2 rounded-lg transition ${activeTab === "heatmap" ? "bg-white text-[#1F3864] shadow-sm" : "text-slate-600"}`}>
                탭 B — 2변수 히트맵</button>
            </div>
          </div>

          <div className="pt-6">
            {activeTab === "line" ? (
              <div>
                <div className="mb-4 flex flex-col sm:flex-row sm:items-center justify-between text-xs text-slate-500 gap-1">
                  <span>가로축: 연 상승률(0% ~ 7%) | 세로축: 연환산수익률(%)</span>
                  <span className="font-semibold text-[#1F3864]">현재 선택 상승률: {(growth * 100).toFixed(1)}% (세로 점선)</span>
                </div>
                <div className="h-80 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={growthTrendData} margin={{ top: 20, right: 30, left: 10, bottom: 5 }}>
                      <XAxis dataKey="growthRate" stroke="#64748B" fontSize={11} />
                      <YAxis stroke="#64748B" fontSize={11} tickFormatter={(v) => `${v}%`} />
                      <Tooltip formatter={(val, name) => [`${val}%`, name]} />
                      <Legend wrapperStyle={{ fontSize: '12px' }} />
                      <ReferenceLine x={`${(growth * 100).toFixed(1)}%`} stroke="#EF4444" strokeDasharray="4 4"
                        label={{ value: '현재 가정', position: 'top', fill: '#EF4444', fontSize: 11 }} />
                      <Line type="monotone" dataKey="잠실주공5단지" stroke="#1F3864" strokeWidth={3} dot={false} />
                      <Line type="monotone" dataKey="신반포2차" stroke="#3B82F6" strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="압구정5구역" stroke="#F59E0B" strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="대치 은마" stroke="#10B981" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            ) : (
              <div>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 gap-2">
                  <div className="text-xs text-slate-600">
                    <strong>기간 조정(가로)</strong>과 <strong>시세 조정(세로)</strong>에 따른 <strong>연환산수익률(%)</strong> 매트릭스
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-700">단지 선택:</span>
                    <select value={heatmapComplexId} onChange={(e) => setHeatmapComplexId(e.target.value)}
                      className="text-xs border border-slate-300 rounded-lg px-2.5 py-1.5 bg-white font-semibold text-slate-800">
                      {COMPLEXES.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
                    </select>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-center border-collapse">
                    <thead>
                      <tr>
                        <th className="p-2 text-[11px] font-bold text-slate-400 border border-slate-200 bg-slate-50">시세 \ 기간</th>
                        {heatmapYears.map((y) => (
                          <th key={y} className={`p-2 text-[11px] font-bold border border-slate-200 ${
                            y === yearAdj ? "bg-[#1F3864] text-white" : "bg-slate-50 text-slate-700"}`}>
                            {y > 0 ? `+${y}년` : `${y}년`}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {heatmapValues.map((v) => {
                        const t = COMPLEXES.find((c) => c.id === heatmapComplexId);
                        const isSelectedRow = Math.abs(v - valueAdj) < 0.001;
                        return (
                          <tr key={v}>
                            <td className={`p-2 text-[11px] font-bold border border-slate-200 ${
                              isSelectedRow ? "bg-[#1F3864] text-white" : "bg-slate-50 text-slate-700"}`}>
                              {fmtSignPct(v)}
                            </td>
                            {heatmapYears.map((y) => {
                              const years = t.baseYears + y;
                              let annual = null;
                              if (years > 0) {
                                const fv = t.baseValue * (1 + v) * Math.pow(1 + growth, years);
                                annual = Math.pow(fv / t.totalCost, 1 / years) - 1;
                              }
                              const isExactCell = isSelectedRow && y === yearAdj;
                              return (
                                <td key={y} className={`p-2 text-xs border border-slate-200 font-medium transition-all ${getHeatmapColor(annual)} ${
                                  isExactCell ? "ring-2 ring-slate-900 font-black" : ""}`}>
                                  {annual !== null ? `${(annual * 100).toFixed(1)}%` : "-"}
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {/* [수정 4] 범례에 빠져 있던 2~4% 구간 추가 */}
                <div className="mt-3 flex flex-wrap items-center justify-end gap-3 text-[11px] text-slate-500">
                  <span className="flex items-center gap-1"><span className="w-3 h-3 bg-rose-100 rounded"></span> 음수</span>
                  <span className="flex items-center gap-1"><span className="w-3 h-3 bg-amber-50 border border-amber-100 rounded"></span> 0~2%</span>
                  <span className="flex items-center gap-1"><span className="w-3 h-3 bg-emerald-50 border border-emerald-100 rounded"></span> 2~4%</span>
                  <span className="flex items-center gap-1"><span className="w-3 h-3 bg-emerald-100 rounded"></span> 4~6%</span>
                  <span className="flex items-center gap-1"><span className="w-3 h-3 bg-emerald-300 rounded"></span> 6% 이상</span>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* 04 */}
        <section className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 sm:p-8">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-6 border-b border-slate-100 gap-4">
            <div>
              <span className="text-xs font-black tracking-widest text-[#1F3864] uppercase">SECTION 04</span>
              <h2 className="text-2xl font-black text-slate-900 mt-0.5">상세 계산 과정 및 사업 정보</h2>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-700">단지 전환:</span>
              <select value={selectedDetailId} onChange={(e) => setSelectedDetailId(e.target.value)}
                className="text-sm font-bold border border-slate-300 rounded-xl px-3 py-2 bg-white text-[#1F3864]">
                {COMPLEXES.map((c) => (<option key={c.id} value={c.id}>{c.name} ({c.location})</option>))}
              </select>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
            <div className="space-y-3">
              <h4 className="text-xs font-bold text-slate-400 tracking-wider uppercase mb-2">단계별 수익 산출 공식</h4>
              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between">
                <div>
                  <span className="text-xs text-slate-500 font-medium block">기준 신축가치 (전용84)</span>
                  <span className="text-xs text-slate-400">실거래·호가 기반 추정의 중간값</span>
                </div>
                <span className="text-base font-bold text-slate-800">{fmtMoney(selectedDetailComplex.baseValue)}</span>
              </div>
              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between">
                <div>
                  <span className="text-xs text-slate-500 font-medium block">× 시세조정 반영 ({fmtSignPct(valueAdj)})</span>
                  <span className="text-xs text-slate-400">조정 신축가치</span>
                </div>
                <span className="text-base font-bold text-slate-800">{fmtMoney(selectedDetailComplex.adjBaseValue)}</span>
              </div>
              <div className="p-3.5 bg-indigo-50/50 rounded-xl border border-indigo-100 flex items-center justify-between">
                <div>
                  <span className="text-xs text-indigo-900 font-bold block">
                    × (1 + {(growth * 100).toFixed(1)}%)^{selectedDetailComplex.years.toFixed(1)}년
                  </span>
                  <span className="text-xs text-indigo-700">입주시 최종 가치</span>
                </div>
                <span className="text-lg font-black text-[#1F3864]">{fmtMoney(selectedDetailComplex.futureValue)}</span>
              </div>
              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between">
                <div>
                  <span className="text-xs text-slate-500 font-medium block">− 총투자금</span>
                  <span className="text-xs text-slate-400">매매가 + 분담금 + 재초환 추정</span>
                </div>
                <span className="text-base font-bold text-rose-600">− {fmtMoney(selectedDetailComplex.totalCost)}</span>
              </div>
              <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-200 flex items-center justify-between">
                <div>
                  <span className="text-xs text-emerald-800 font-bold block">= 최종 순수익 (차익)</span>
                  <span className="text-xs text-emerald-700 font-medium">총수익률: {fmtPct(selectedDetailComplex.totalReturn)}</span>
                </div>
                <div className="text-right">
                  <span className="text-xl font-black text-emerald-700">
                    {selectedDetailComplex.profit > 0 ? `+${fmtMoney(selectedDetailComplex.profit)}` : fmtMoney(selectedDetailComplex.profit)}
                  </span>
                  <span className="block text-xs font-bold text-emerald-800 mt-0.5">연환산 {fmtPct(selectedDetailComplex.annualReturn)}</span>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <h4 className="text-xs font-bold text-slate-400 tracking-wider uppercase mb-2">사업 및 단지 정보</h4>
              <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
                <table className="w-full text-xs text-left">
                  <tbody className="divide-y divide-slate-200">
                    <tr><th className="py-3 px-4 bg-slate-50 font-bold text-slate-600 w-1/3">단지 위치</th>
                      <td className="py-3 px-4 text-slate-800 font-medium">{selectedDetailComplex.location}</td></tr>
                    <tr><th className="py-3 px-4 bg-slate-50 font-bold text-slate-600">진행 단계</th>
                      <td className="py-3 px-4 text-slate-800 font-medium">
                        <span className="font-bold text-[#1F3864] mr-2">{selectedDetailComplex.stage}</span>({selectedDetailComplex.stageNote})</td></tr>
                    <tr><th className="py-3 px-4 bg-slate-50 font-bold text-slate-600">시공사</th>
                      <td className="py-3 px-4 text-slate-800 font-medium">{selectedDetailComplex.builder}</td></tr>
                    <tr><th className="py-3 px-4 bg-slate-50 font-bold text-slate-600">추정 비례율</th>
                      <td className="py-3 px-4 text-slate-800 font-medium">
                        {selectedDetailComplex.ratio ? `${(selectedDetailComplex.ratio * 100).toFixed(2)}%` : "미공개"}
                        <span className="text-[11px] text-slate-400 ml-1.5">({selectedDetailComplex.ratioSource})</span></td></tr>
                    <tr><th className="py-3 px-4 bg-slate-50 font-bold text-slate-600">초기 필요자금</th>
                      <td className="py-3 px-4 text-slate-800 font-medium">약 {fmtMoney(selectedDetailComplex.initialCost)}
                        <span className="text-[11px] text-slate-400 block font-normal mt-0.5">매매가 − 임대보증금·대출 추정</span></td></tr>
                    <tr><th className="py-3 px-4 bg-slate-50 font-bold text-slate-600">신축가치 추정 범위</th>
                      <td className="py-3 px-4 text-slate-800 font-medium">
                        {fmtMoney(selectedDetailComplex.valueLow)} (보수) ~ {fmtMoney(selectedDetailComplex.valueHigh)} (낙관)</td></tr>
                    <tr><th className="py-3 px-4 bg-slate-50 font-bold text-slate-600">분담금 및 특이사항</th>
                      <td className="py-3 px-4 text-slate-800 font-medium leading-relaxed">{selectedDetailComplex.shareNote}</td></tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </section>

        {/* 05 */}
        <section id="guide" className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 sm:p-8">
          <span className="text-xs font-black tracking-widest text-[#1F3864] uppercase">SECTION 05</span>
          <h2 className="text-2xl font-black text-slate-900 mt-0.5 mb-6">이용 방법</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              ["가정 조정", "3개 슬라이더로 본인의 시세 전망, 입주 지연 가능성, 연평균 상승률을 직접 설정하세요."],
              ["순위 확인", "4개 단지가 연환산수익률 순으로 즉시 정렬됩니다. 자금이 묶이는 기간까지 반영된 수익률입니다."],
              ["민감도 점검", "시세가 빠지거나 기간이 늘어나도 순위가 유지되는지 히트맵에서 확인하세요."],
            ].map(([t, d], i) => (
              <div key={t} className="p-5 rounded-xl border border-slate-100 bg-slate-50/60">
                <span className="w-7 h-7 rounded-full bg-[#1F3864] text-white flex items-center justify-center font-black text-xs mb-3">{i + 1}</span>
                <h3 className="font-bold text-slate-800 text-sm mb-1.5">{t}</h3>
                <p className="text-xs text-slate-600 leading-relaxed">{d}</p>
              </div>
            ))}
          </div>
        </section>

        <footer className="pt-8 border-t border-slate-200 text-xs text-slate-400 space-y-1.5 leading-relaxed">
          <p className="font-semibold text-slate-500">※ 고지 및 데이터 출처</p>
          <p>• 본 분석은 학술 과제용 추정치이며 투자 권유가 아닙니다.</p>
          <p>• 총투자금에는 취득세·보유세·금융비용이 포함되지 않았습니다.</p>
          <p>• 신축 시세·사업기간·상승률은 가정값이며, 조정한 값에 따라 결과가 달라집니다.</p>
          <p>• 데이터 출처: 국토교통부 실거래가 공개시스템, 서울시 정비계획 고시 및 사업시행계획인가 고시, 개인 부동산 블로그 분석자료(까르)</p>
          <p>• 기준값은 실거래 기반 보수 추정과 호가 기반 낙관 추정의 중간값입니다.</p>
        </footer>
      </main>
    </div>
  );
}
