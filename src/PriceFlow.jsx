import React, { useState, useMemo } from 'react';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, ReferenceLine, CartesianGrid } from 'recharts';
import { buildSeries, comparePair } from './flow.js';

// 시세 흐름 비교 — 아실(asil) 방식처럼 단지를 골라 색상별로 겹쳐 보고, 시점별 역전·격차 변화를 확인
export default function PriceFlow({ list, colorOf, fmtYM, basisNote }) {
  const [mode, setMode] = useState("p84");
  const [sel, setSel] = useState(() => list.map((r) => r.id));
  const chosen = list.filter((r) => sel.includes(r.id));
  const series = useMemo(() => chosen.map((r) => buildSeries(r, mode)), [chosen, mode]);
  const pairs = useMemo(() => {
    const out = [];
    for (let i = 0; i < series.length; i++) for (let j = i + 1; j < series.length; j++) out.push(comparePair(series[i], series[j]));
    return out;
  }, [series]);

  const tMin = Math.min(-1, ...series.flatMap((s) => s.past.map((p) => p.t)));
  const tMax = Math.max(1, ...series.map((s) => s.T));
  const ticks = []; for (let y = Math.ceil(tMin); y <= Math.ceil(tMax); y++) ticks.push(y);
  const toggle = (id) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const fmtGap = (g) => `${g >= 0 ? "+" : ""}${g.toFixed(1)}억`;

  const Tip = ({ active, payload }) => {
    if (!active || !payload || !payload.length) return null;
    const p = payload[0].payload; const s = series.find((x) => x.id === payload[0].name.split("|")[0]);
    return (
      <div className="bg-white border border-slate-200 rounded-lg shadow px-3 py-2 text-xs">
        <div className="font-bold" style={{ color: colorOf(s.id) }}>{s.name}</div>
        <div>{fmtYM(p.t)} · <b>{p.v.toFixed(2)}억</b></div>
        <div className="text-slate-500">{p.ym ? `실거래 월 중위 (${p.n}건)` : p.stage === "현재" ? "현재 매수가" : `${p.stage} 도달 시 기대가격`}</div>
      </div>
    );
  };

  return (
    <section id="flow" data-testid="sec-flow" className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 sm:p-8 scroll-mt-20">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between pb-5 border-b border-slate-100 gap-4">
        <div>
          <span className="text-xs font-black tracking-widest text-[#1F3864] uppercase">SECTION 03-1</span>
          <h2 className="text-2xl font-black text-slate-900 mt-0.5">시세 흐름 비교 — 언제 역전되고 좁혀지나</h2>
          <p className="text-xs text-slate-500 mt-1">실선 = 지난 12개월 실거래(월 중위), 점선 = 기대가격 경로(단계 사이엔 완만히 오르고, ○ 단계 통과 시 한 번 더 뛰어 입주 때 신축가치에 도달). 단지를 2개 이상 고르면 역전·격차 변화를 자동으로 짚어 줍니다.</p>
        </div>
        <div className="inline-flex p-1 rounded-xl bg-slate-100 text-xs font-bold">
          {[["p84", "84㎡ 환산가"], ["rep", "대표 평형 매매가"]].map(([v, l]) => (
            <button key={v} data-testid={`flow-mode-${v}`} onClick={() => setMode(v)} className={`px-3 py-1.5 rounded-lg whitespace-nowrap ${mode === v ? "bg-white text-[#1F3864] shadow-sm" : "text-slate-600"}`}>{l}</button>
          ))}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-1.5">
        {list.map((r) => {
          const on = sel.includes(r.id);
          return (
            <button key={r.id} data-testid={`flow-pick-${r.id}`} onClick={() => toggle(r.id)}
              className={`px-2.5 py-1 rounded-full border text-xs font-semibold flex items-center gap-1.5 ${on ? "bg-white" : "bg-slate-50 text-slate-400 border-slate-200"}`}
              style={on ? { borderColor: colorOf(r.id), color: colorOf(r.id) } : {}}>
              <span className="w-2.5 h-2.5 rounded-full" style={{ background: on ? colorOf(r.id) : "#CBD5E1" }}></span>{r.name}
            </button>
          );
        })}
      </div>
      <p className="text-[11px] text-slate-500 mt-2">
        {mode === "p84" ? "84㎡ 환산가 = 대표 평형 가격 + 분담금 + 재초환 → 같은 '새 아파트 84㎡ 한 채'를 얻는 데 드는 값으로 단지 간 직접 비교, 입주 시점에는 신축 84㎡ 가치와 같아짐" : "대표 평형 매매가 = 지금 시장에서 거래되는 구축 가격 그대로(평형이 달라 단지 간 직접 비교에는 한계)"}
        {basisNote ? ` · ${basisNote}` : ""}
      </p>

      <div className="h-96 w-full mt-3" data-testid="flow-chart">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart margin={{ top: 20, right: 30, left: 10, bottom: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
            <XAxis type="number" dataKey="t" domain={[tMin, tMax]} ticks={ticks} tickFormatter={(t) => fmtYM(t)} stroke="#64748B" fontSize={11} allowDuplicatedCategory={false} />
            <YAxis stroke="#64748B" fontSize={11} tickFormatter={(v) => `${v}억`} domain={["auto", "auto"]} width={55} />
            <Tooltip content={<Tip />} />
            <ReferenceLine x={0} stroke="#475569" strokeDasharray="4 4" label={{ value: "현재", position: "top", fontSize: 11, fill: "#475569" }} />
            {series.map((s) => [
              <Line key={`${s.id}p`} name={`${s.id}|past`} data={s.past} dataKey="v" type="monotone" stroke={colorOf(s.id)} strokeWidth={2.5} dot={{ r: 2.5 }} isAnimationActive={false} />,
              <Line key={`${s.id}f`} name={`${s.id}|fut`} data={s.fut} dataKey="v" type="linear" stroke={colorOf(s.id)} strokeWidth={2.5} strokeDasharray="7 4"
                dot={(d) => (d.payload.mark ? <circle key={`${s.id}-${d.index}`} cx={d.cx} cy={d.cy} r={4} fill="#fff" stroke={colorOf(s.id)} strokeWidth={2} /> : <g key={`${s.id}-${d.index}`} />)}
                activeDot={{ r: 4 }} isAnimationActive={false} />,
            ])}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {series.length >= 2 ? (
        <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full text-xs min-w-[640px]" data-testid="flow-pairs">
            <thead className="bg-slate-50 text-slate-600"><tr>
              <th className="p-2.5 text-left">비교</th><th className="p-2.5 text-right">현재 격차</th><th className="p-2.5 text-right">비교 종료 시점</th><th className="p-2.5 text-right">종료 시 격차</th><th className="p-2.5 text-left">변화</th>
            </tr></thead>
            <tbody className="divide-y divide-slate-100">
              {pairs.map((q) => (
                <tr key={`${q.a}-${q.b}`}>
                  <td className="p-2.5 font-semibold">{q.a} − {q.b}</td>
                  <td className="p-2.5 text-right">{fmtGap(q.gap0)}</td>
                  <td className="p-2.5 text-right">{fmtYM(q.end)}</td>
                  <td className="p-2.5 text-right">{fmtGap(q.gapEnd)}</td>
                  <td className="p-2.5">
                    <span className={`px-1.5 py-0.5 rounded font-bold ${q.trend === "역전" ? "bg-rose-100 text-rose-700" : q.trend === "좁혀짐" ? "bg-amber-100 text-amber-800" : q.trend === "벌어짐" ? "bg-sky-100 text-sky-800" : "bg-slate-100 text-slate-600"}`}>{q.trend}</span>
                    {q.crosses.length > 0 && q.crosses.length <= 2 && q.crosses.map((c, i) => <span key={i} className="ml-2 text-slate-600">{fmtYM(c.t)} {c.lead} 앞섬{c.trigger ? ` (${c.trigger} 시점)` : ""}</span>)}
                    {q.crosses.length > 2 && <span className="ml-2 text-slate-600">{fmtYM(q.crosses[0].t)} 첫 역전({q.crosses[0].lead}) → 단계마다 {q.crosses.length}회 엎치락뒤치락 → 최종 {q.crosses.at(-1).lead} 우위 — 사실상 비슷한 수준</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-[11px] text-slate-500 p-2.5 border-t border-slate-100">비교 종료 시점 = 두 단지 중 먼저 입주하는 시점. 미래 경로는 단계별 요구수익률이 낮아지며 가격이 오른다는 이론 경로이며, 가정(시세·기간·상승률·분담금·재초환)을 바꾸면 함께 바뀝니다.</p>
        </div>
      ) : <p className="mt-4 text-xs text-amber-700">단지를 2개 이상 고르면 역전·격차 분석이 나옵니다.</p>}
    </section>
  );
}
