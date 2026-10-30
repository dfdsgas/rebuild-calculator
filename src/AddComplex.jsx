import React, { useState, useMemo } from 'react';
import { SEOUL_GU, STAGES, PYEONG_84, DEFAULT_COST, defaultYears, arriveFrom, SHARE_DEFAULTS } from './data.js';
import { deriveComplex, evaluate } from './engine.js';

// =====================================================================
// 단지 추가 — 서울 어느 재건축 단지든 비교 목록에 추가
//  자동: 대상 단지 평형별 실거래, 주변 신축·입주권 84㎡ 후보 (/api/district)
//  입력: 사업단계·기간, 분담금(직접 또는 간이 산식), 전세(선택)
// =====================================================================

const fmt = (v, d = 1) => (v === null || v === undefined || isNaN(v) ? "-" : `${Number(v).toFixed(d)}`);
const fmtD = (d) => (d ? d.replaceAll("-", ".") : "-");
const cur = new Date().getFullYear();

function Step({ n, title, children, done }) {
  return (
    <div className={`rounded-xl border p-4 ${done ? "border-slate-200" : "border-dashed border-slate-300"}`}>
      <div className="text-xs font-black text-[#1F3864] mb-3">{n}. {title}</div>
      {children}
    </div>
  );
}

export default function AddComplex({ onAdd, onClose }) {
  const [lawd, setLawd] = useState("");
  const [status, setStatus] = useState("idle"); // idle | loading | ok | fail
  const [reason, setReason] = useState("");
  const [data, setData] = useState(null);
  const [query, setQuery] = useState("");
  const [onlyOld, setOnlyOld] = useState(true);
  const [cxKey, setCxKey] = useState(null);
  const [areaK, setAreaK] = useState(null);
  const [picked, setPicked] = useState({}); // compKey -> adj
  const [stageIdx, setStageIdx] = useState(3);
  const [years, setYears] = useState(defaultYears(3));
  const [shareMode, setShareMode] = useState("formula");
  const [shareDirect, setShareDirect] = useState("");
  const [member, setMember] = useState("");
  const [prev, setPrev] = useState("");
  const [ratio, setRatio] = useState(String(SHARE_DEFAULTS.ratio * 100));
  const [jeonse, setJeonse] = useState("");

  const guName = (SEOUL_GU.find(([c]) => c === lawd) || [])[1] || "";
  const endYear = data ? Number(data.period.to.slice(0, 4)) : cur;

  const load = (code) => {
    setLawd(code); setData(null); setCxKey(null); setAreaK(null); setPicked({});
    if (!code) return;
    setStatus("loading");
    fetch(`/api/district?lawd=${code}`)
      .then((r) => r.json())
      .then((j) => { if (j && j.ok) { setData(j); setStatus("ok"); } else { setStatus("fail"); setReason((j && j.reason) || "응답 오류"); } })
      .catch(() => { setStatus("fail"); setReason("실거래가 서버에 연결하지 못했습니다"); });
  };

  const list = useMemo(() => {
    if (!data) return [];
    const q = query.replace(/\s/g, "");
    return data.complexes
      .filter((c) => (!onlyOld || (c.y && c.y <= endYear - 30)) && (!q || `${c.n}${c.u}`.replace(/\s/g, "").includes(q)))
      .slice(0, 60);
  }, [data, query, onlyOld, endYear]);

  const cx = data && cxKey ? data.complexes.find((c) => `${c.u}|${c.n}` === cxKey) : null;
  const grp = cx && areaK !== null ? cx.g.find((g) => g.k === areaK) : null;
  const compKey = (c) => `${c.type}|${c.u}|${c.n}`;

  const candidates = useMemo(() => {
    if (!data || !cx) return [];
    return [...data.comps]
      .filter((c) => !(c.n === cx.n && c.u === cx.u))
      .sort((a, b) => ((b.u === cx.u) - (a.u === cx.u)) || (b.c - a.c));
  }, [data, cx]);

  const selectComplex = (k) => {
    setCxKey(k);
    const c = data.complexes.find((x) => `${x.u}|${x.n}` === k);
    const main = [...c.g].sort((a, b) => b.c - a.c)[0];
    setAreaK(main ? main.k : null);
    // 기본 비교단지 2곳: 준공 15년 이내 매매 또는 입주권 중 점수순
    //  같은 동 +2, 입주권(곧 입주할 재건축 신축) +1.5, 준공 10년 이내 +1, 거래 5건 이상 +1 → 동점이면 거래 많은 순
    const score = (x) => (x.u === c.u ? 2 : 0) + (x.type === "입주권" ? 1.5 : 0) + (x.y && x.y >= endYear - 10 ? 1 : 0) + (x.c >= 5 ? 1 : 0);
    const pool = [...data.comps].filter((x) => !(x.n === c.n && x.u === c.u) && (x.type === "입주권" || x.y >= endYear - 15))
      .sort((a, b) => (score(b) - score(a)) || (b.c - a.c)).slice(0, 2);
    setPicked(Object.fromEntries(pool.map((x) => [compKey(x), 0])));
  };

  const chosen = candidates.filter((c) => picked[compKey(c)] !== undefined);
  const valueLow = chosen.length ? (chosen.reduce((s, c) => s + c.p * (1 + picked[compKey(c)]), 0) / chosen.length) * PYEONG_84 / 10000 : null;
  const buy = grp ? grp.m : null;

  // 분담금
  const memberV = member !== "" ? parseFloat(member) : valueLow ? valueLow * SHARE_DEFAULTS.memberToNew : null;
  const prevV = prev !== "" ? parseFloat(prev) : buy ? buy * SHARE_DEFAULTS.prevToBuy : null;
  const ratioV = (parseFloat(ratio) || 0) / 100;
  const usedDefault = shareMode === "formula" && (member === "" || prev === "");
  const share = shareMode === "direct" ? (shareDirect === "" ? null : parseFloat(shareDirect)) : (memberV !== null && prevV !== null ? memberV - prevV * ratioV : null);

  const ready = cx && grp && chosen.length > 0 && share !== null && !isNaN(share) && years > 0.5;

  const build = () => {
    const id = `u_${Date.now()}`;
    const dflt = defaultYears(stageIdx);
    const arrive = arriveFrom(stageIdx).map((t) => Math.round(t * (years / dflt) * 100) / 100);
    return {
      id, name: cx.n, location: `${guName} ${cx.u}`, isCustom: true, lawd,
      snapDate: data.fetchedAt.slice(0, 10), period: data.period,
      stageIdx, stageNote: "사용자 입력",
      householdsBefore: null, householdsAfter: null, builder: "-", buildYear: cx.y,
      rep: { key: `g${grp.k}`, label: `전용 ${grp.a}㎡`, buy: grp.m, jeonse: jeonse === "" ? null : parseFloat(jeonse) },
      share: Math.round(share * 100) / 100,
      shareSrc: shareMode === "direct" ? "사용자 입력" : `간이 산식: 조합원분양가 ${fmt(memberV, 2)}억 − 종전평가 ${fmt(prevV, 2)}억 × 비례율 ${fmt(ratioV * 100, 1)}%`,
      shareAlt: usedDefault ? "조합원분양가·종전평가 기본값은 검증 4개 단지(정비계획 고시) 평균 비율로 추정 [가정] — 실제 고시·조합 자료로 바꿔 넣을 것" : "사용자 입력값",
      privTotal: null, privInit: null, valueHigh: valueLow, yearsLow: years, yearsHigh: years, arrive,
      ratio: shareMode === "formula" ? ratioV : null, ratioSource: shareMode === "formula" ? "사용자 입력" : "미입력",
      compShort: chosen.map((c) => `${c.n}(${c.type})`).join("·"),
      comps: chosen.map((c, i) => ({
        key: `c${i}`, name: c.n, built: c.y ? String(c.y) : "-", type: `${c.type} 84㎡`, count: c.c, median: c.m, max: c.x, last: c.l,
        ppp: c.p, adj: picked[compKey(c)], weight: 1 / chosen.length, note: `자동 추천 후보 중 사용자 선택 (${c.u})`,
      })),
      ownTrades: cx.g.map((g) => ({ key: `g${g.k}`, label: `전용 ${g.a}㎡`, count: g.c, median: g.m, max: g.x, last: g.l, jeonse: g.k === grp.k && jeonse !== "" ? parseFloat(jeonse) : null })),
    };
  };

  const preview = useMemo(() => {
    if (!ready) return null;
    const c = deriveComplex(build(), null);
    return evaluate(c, { valueAdj: 0, yearAdj: 0, growth: 0.035 }, { basis: "self", ...DEFAULT_COST });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, cxKey, areaK, picked, stageIdx, years, shareMode, shareDirect, member, prev, ratio, jeonse]);

  const input = "border border-slate-300 rounded-md px-2 py-1 text-xs w-24";

  return (
    <div data-testid="add-panel" className="bg-white rounded-2xl shadow-sm border-2 border-[#1F3864]/30 p-5 sm:p-6 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-black text-slate-900 text-lg">단지 추가 — 서울 재건축 단지 직접 분석</h3>
          <p className="text-xs text-slate-500 mt-1">실거래·주변 신축 시세는 국토부 API로 자동 조회하고, 사업단계·분담금만 입력합니다. 추가한 단지는 이 브라우저에 저장됩니다.</p>
        </div>
        <button onClick={onClose} className="text-xs font-bold text-slate-500 hover:text-slate-900">닫기 ✕</button>
      </div>

      <Step n="1" title="구 선택 · 단지 검색" done={!!cx}>
        <div className="flex flex-wrap items-center gap-2">
          <select data-testid="add-gu" value={lawd} onChange={(e) => load(e.target.value)} className="text-sm font-bold border border-slate-300 rounded-lg px-2 py-1.5">
            <option value="">구 선택</option>
            {SEOUL_GU.map(([c, n]) => <option key={c} value={c}>{n}</option>)}
          </select>
          {status === "loading" && <span className="text-xs text-amber-700">국토부 실거래 12개월 조회 중… (첫 조회 10~30초)</span>}
          {status === "fail" && <span className="text-xs text-rose-600">조회 실패: {reason}</span>}
          {status === "ok" && (
            <>
              <input data-testid="add-search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="단지명·동 검색 (예: 은마, 대치동)" className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm w-60" />
              <label className="text-xs text-slate-600 flex items-center gap-1"><input type="checkbox" checked={onlyOld} onChange={(e) => setOnlyOld(e.target.checked)} /> 준공 30년 이상만</label>
              {data.partial && <span className="text-[11px] text-amber-700">⚠ {data.reason}</span>}
              <span className="text-[11px] text-slate-400">{data.period.from.slice(0, 4)}.{Number(data.period.from.slice(4))}~{data.period.to.slice(0, 4)}.{Number(data.period.to.slice(4))} 거래 · {data.complexes.length}개 단지</span>
            </>
          )}
        </div>
        {status === "ok" && (
          <div className="mt-3 max-h-56 overflow-y-auto border border-slate-100 rounded-lg divide-y divide-slate-100" data-testid="add-list">
            {list.length === 0 && <div className="p-3 text-xs text-slate-500">검색 결과가 없습니다. '준공 30년 이상만'을 해제해 보세요.</div>}
            {list.map((c) => {
              const k = `${c.u}|${c.n}`;
              return (
                <button key={k} onClick={() => selectComplex(k)} className={`w-full text-left px-3 py-2 text-xs flex justify-between hover:bg-slate-50 ${k === cxKey ? "bg-indigo-50 font-bold text-[#1F3864]" : ""}`}>
                  <span>{c.n} <span className="text-slate-400">({c.u})</span></span>
                  <span className="text-slate-500">준공 {c.y || "-"} · 12개월 {c.c}건</span>
                </button>
              );
            })}
          </div>
        )}
      </Step>

      {cx && (
        <Step n="2" title={`보유(매수) 평형 — ${cx.n}`} done={!!grp}>
          <div className="flex flex-wrap gap-2">
            {cx.g.map((g) => (
              <button key={g.k} data-testid={`add-area-${g.k}`} onClick={() => setAreaK(g.k)}
                className={`px-3 py-2 rounded-lg border text-xs text-left ${g.k === areaK ? "border-[#1F3864] bg-indigo-50" : "border-slate-200 hover:bg-slate-50"}`}>
                <div className="font-bold">전용 {g.a}㎡</div>
                <div className="text-slate-500">중위 {fmt(g.m, 2)}억 · {g.c}건 · 최근 {fmtD(g.l)}</div>
              </button>
            ))}
          </div>
          <div className="mt-3 flex items-center gap-2 text-xs">
            <span className="text-slate-600">전세 보증금(선택, 실투자금 계산용)</span>
            <input data-testid="add-jeonse" type="number" step="0.1" value={jeonse} onChange={(e) => setJeonse(e.target.value)} className={input} placeholder="억" /><span>억</span>
          </div>
        </Step>
      )}

      {cx && (
        <Step n="3" title="신축 84㎡ 시세 — 비교 신축단지 선택 (같은 구, 준공 20년 이내 매매·입주권, 3건 이상)" done={chosen.length > 0}>
          <div className="max-h-64 overflow-auto border border-slate-100 rounded-lg">
            <table className="w-full text-xs min-w-[640px]" data-testid="add-comps">
              <thead className="bg-slate-50 text-slate-600 sticky top-0"><tr>
                <th className="p-2 text-left">선택</th><th className="p-2 text-left">단지</th><th className="p-2">준공/자료</th><th className="p-2 text-right">건수</th>
                <th className="p-2 text-right">중위가</th><th className="p-2">최근</th><th className="p-2 text-right">평당(만원)</th><th className="p-2 text-right">보정</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-100">
                {candidates.map((c) => {
                  const k = compKey(c); const on = picked[k] !== undefined;
                  return (
                    <tr key={k} className={on ? "bg-indigo-50/50" : ""}>
                      <td className="p-2"><input type="checkbox" checked={on} onChange={(e) => {
                        const n = { ...picked }; if (e.target.checked) n[k] = 0; else delete n[k]; setPicked(n);
                      }} /></td>
                      <td className="p-2 font-semibold">{c.n} <span className="text-slate-400 font-normal">{c.u}{c.u === cx.u ? " · 같은 동" : ""}</span></td>
                      <td className="p-2 text-center">{c.type === "입주권" ? "입주권" : c.y}</td><td className="p-2 text-right">{c.c}</td>
                      <td className="p-2 text-right">{fmt(c.m, 2)}억</td><td className="p-2 text-center">{fmtD(c.l)}</td><td className="p-2 text-right">{c.p.toLocaleString()}</td>
                      <td className="p-2 text-right">{on ? (
                        <select value={picked[k]} onChange={(e) => setPicked({ ...picked, [k]: parseFloat(e.target.value) })} className="border border-slate-300 rounded px-1">
                          {[-0.2, -0.1, -0.05, 0, 0.05, 0.1, 0.15, 0.2, 0.3, 0.4].map((v) => <option key={v} value={v}>{v > 0 ? "+" : ""}{Math.round(v * 100)}%</option>)}
                        </select>) : "-"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-slate-500 mt-2">
            선택 단지 평당가 × (1+보정) 단순평균 × {PYEONG_84}평 = <b className="text-[#1F3864]" data-testid="add-value">{valueLow ? `${fmt(valueLow, 2)}억` : "-"}</b>
            {valueLow ? ` (평당 ${fmt(valueLow / PYEONG_84, 2)}억)` : ""} · 보정 예: 연식이 오래된 비교단지 +, 입지 열위 단지 −
          </p>
        </Step>
      )}

      {cx && (
        <Step n="4" title="사업단계 · 입주까지 기간" done>
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <select data-testid="add-stage" value={stageIdx} onChange={(e) => { const s = Number(e.target.value); setStageIdx(s); setYears(defaultYears(s)); }} className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm">
              {STAGES.slice(0, 7).map((s, i) => <option key={s} value={i}>{s}</option>)}
            </select>
            <span>입주까지</span>
            <input data-testid="add-years" type="number" step="0.5" min="1" value={years} onChange={(e) => setYears(parseFloat(e.target.value) || 0)} className={input} /><span>년</span>
            <span className="text-[11px] text-slate-500">기본값 {defaultYears(stageIdx)}년 = 단계별 표준 소요 합계 [가정]. 조합 공지 일정이 있으면 바꿔 넣으세요.</span>
          </div>
        </Step>
      )}

      {cx && (
        <Step n="5" title="분담금 (84㎡ 배정 기준, 환급은 음수)" done={share !== null}>
          <div className="flex gap-2 mb-3 text-xs font-bold">
            {[["formula", "간이 산식"], ["direct", "직접 입력(조합 발표값)"]].map(([v, l]) => (
              <button key={v} data-testid={`add-share-${v}`} onClick={() => setShareMode(v)} className={`px-3 py-1.5 rounded-lg ${shareMode === v ? "bg-[#1F3864] text-white" : "bg-slate-100 text-slate-600"}`}>{l}</button>
            ))}
          </div>
          {shareMode === "direct" ? (
            <div className="flex items-center gap-2 text-xs">
              <input data-testid="add-share" type="number" step="0.1" value={shareDirect} onChange={(e) => setShareDirect(e.target.value)} className={input} placeholder="억" /><span>억</span>
            </div>
          ) : (
            <div className="space-y-2 text-xs">
              <div className="flex flex-wrap items-center gap-2">
                <span>조합원분양가(84㎡)</span><input type="number" step="0.1" value={member} onChange={(e) => setMember(e.target.value)} className={input} placeholder={memberV ? fmt(memberV, 2) : "억"} /><span>억</span>
                <span className="ml-3">− 종전평가액</span><input type="number" step="0.1" value={prev} onChange={(e) => setPrev(e.target.value)} className={input} placeholder={prevV ? fmt(prevV, 2) : "억"} /><span>억</span>
                <span className="ml-1">× 비례율</span><input type="number" step="1" value={ratio} onChange={(e) => setRatio(e.target.value)} className={input} /><span>%</span>
                <span className="ml-3 font-bold text-[#1F3864]">= 분담금 {share !== null ? `${fmt(share, 2)}억` : "-"}</span>
              </div>
              <p className="text-[11px] text-amber-700">빈칸이면 검증 4개 단지(정비계획 고시) 평균 비율로 추정합니다: 조합원분양가 = 신축 시세 × {SHARE_DEFAULTS.memberToNew}, 종전평가 = 매수가 × {SHARE_DEFAULTS.prevToBuy}, 비례율 {SHARE_DEFAULTS.ratio * 100}% [가정]. 고시·조합 자료가 있으면 꼭 바꿔 넣으세요.</p>
            </div>
          )}
        </Step>
      )}

      {cx && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl bg-slate-50 border border-slate-200 p-4">
          <div className="text-xs text-slate-700" data-testid="add-preview">
            {preview ? (
              <>미리보기(기준 가정): 총투자금 <b>{fmt(preview.totalCost)}억</b> → 입주시 가치 <b>{fmt(preview.VT)}억</b> · 연환산 <b className="text-[#1F3864]">{fmt(preview.annualReturn * 100, 2)}%</b> · 위험조정 <b>{fmt(preview.riskAdj * 100, 2)}%p</b>
                {(preview.annualReturn > 0.10 || preview.annualReturn < 0) && (
                  <div data-testid="add-warn" className="mt-1.5 text-rose-600 font-semibold">⚠ 결과가 {preview.annualReturn > 0.10 ? "비정상적으로 높습니다(연 10% 초과)" : "음수입니다"}. 비교 신축단지가 대상 단지와 입지·규모가 맞는지, 분담금 기본값 대신 고시·조합 자료를 넣었는지 확인하세요.</div>
                )}
                {usedDefault && <div className="mt-1 text-amber-700">분담금이 기본 비율 추정값입니다 [가정]</div>}</>
            ) : "보유 평형·비교 신축단지·분담금을 정하면 미리보기가 나옵니다."}
          </div>
          <button data-testid="add-submit" disabled={!ready} onClick={() => { onAdd(build()); }}
            className="px-4 py-2 rounded-lg bg-[#1F3864] text-white text-sm font-bold disabled:opacity-40">비교 목록에 추가</button>
        </div>
      )}
    </div>
  );
}
