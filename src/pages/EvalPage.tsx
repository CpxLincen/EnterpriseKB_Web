import { useCallback, useEffect, useRef, useState } from 'react'
import {
  api,
  type EvalCase,
  type EvalCaseResult,
  type EvalMetric,
  type EvalRunStatus,
  type EvalSetInfo,
  type EvalSummary,
} from '../api'

const MODE_ORDER = ['dense', 'hybrid', 'rerank'] as const
const MODE_LABELS: Record<string, string> = { dense: '向量', hybrid: '混合', rerank: 'Rerank' }

function caseStatus(r: EvalCaseResult): 'PASS' | 'FAIL' | 'SKIP' {
  const checks: boolean[] = []
  if (r.retrieval_hit != null) checks.push(r.retrieval_hit)
  if (r.fact_hit != null) checks.push(r.fact_hit)
  if (r.no_answer_correct != null) checks.push(r.no_answer_correct)
  if (r.judge_score != null) checks.push(r.judge_score === 1)
  if (checks.length === 0) return 'SKIP'
  return checks.every(Boolean) ? 'PASS' : 'FAIL'
}

function metricRate(m: EvalMetric | null | undefined): string {
  if (!m || m.rate == null) return '—'
  return `${Math.round(m.rate * 100)}%`
}

function metricFrac(m: EvalMetric | null | undefined): string {
  if (!m) return '无样本'
  return `${m.hit ?? m.correct ?? 0}/${m.n}`
}

function CompareRow({
  label,
  pick,
  summaries,
  modes,
}: {
  label: string
  pick: (s: EvalSummary) => EvalMetric | null
  summaries: Record<string, EvalSummary>
  modes: readonly string[]
}) {
  return (
    <tr>
      <td className="compare-label">{label}</td>
      {modes.map((m) => {
        const metric = summaries[m] ? pick(summaries[m]) : null
        const rate = metric?.rate ?? null
        const tone = metric == null || rate == null ? 'muted' : rate === 1 ? 'good' : rate === 0 ? 'bad' : 'warn'
        return (
          <td key={m} className={`metric-cell ${tone}`}>
            <span className="rate">{metricRate(metric)}</span>
            <span className="frac">{metricFrac(metric)}</span>
          </td>
        )
      })}
    </tr>
  )
}

function ResultDetail({ result }: { result: EvalCaseResult }) {
  return (
    <div className="eval-result-detail">
      <div className="detail-block">
        <span className="detail-label">回答</span>
        <p className={`detail-answer${result.is_no_answer ? ' no-answer' : ''}`}>{result.answer}</p>
      </div>
      {result.citations.length > 0 && (
        <div className="detail-block">
          <span className="detail-label">引用来源（{result.citations.length}）</span>
          <ul className="detail-citations">
            {result.citations.map((c, i) => (
              <li key={i}>
                {c.filename}
                {c.page_number != null ? ` · 第 ${c.page_number} 页` : ''} · 块 {c.chunk_index}
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="detail-tags">
        {result.retrieval_hit != null && (
          <span className={`tag ${result.retrieval_hit ? 'ok' : 'bad'}`}>
            检索：{result.retrieval_hit ? '命中' : `未命中（预期 ${result.expected_sources.join('、')}）`}
          </span>
        )}
        {result.fact_hit != null && (
          <span className={`tag ${result.fact_hit ? 'ok' : 'bad'}`}>
            事实：{result.fact_hit ? '通过' : '未通过'}
            {result.fact_matched.length > 0 && `（命中 ${result.fact_matched.join('、')}）`}
            {result.fact_missing.length > 0 && `（缺失 ${result.fact_missing.join('、')}）`}
          </span>
        )}
        {result.no_answer_correct != null && (
          <span className={`tag ${result.no_answer_correct ? 'ok' : 'bad'}`}>
            拒答：{result.no_answer_correct ? '正确' : '错误（应拒答但作答）'}
          </span>
        )}
        {result.judge_score != null && (
          <span className={`tag ${result.judge_score === 1 ? 'ok' : 'bad'}`}>
            裁判：{result.judge_score === 1 ? '正确' : '错误'}
            {result.judge_reason && <span className="tag-reason"> · {result.judge_reason}</span>}
          </span>
        )}
      </div>
    </div>
  )
}

export default function EvalPage() {
  const [sets, setSets] = useState<EvalSetInfo[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [cases, setCases] = useState<EvalCase[]>([])
  const [judge, setJudge] = useState(false)
  const [run, setRun] = useState<EvalRunStatus | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loadingSets, setLoadingSets] = useState(true)
  const [loadingCases, setLoadingCases] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [activeMode, setActiveMode] = useState<string>('rerank')
  const pollRef = useRef<number | null>(null)

  const running = run?.status === 'queued' || run?.status === 'running'

  const refreshSets = useCallback(async () => {
    setLoadingSets(true)
    try {
      const list = await api.listEvalSets()
      setSets(list)
      setSelectedId((prev) => (list.some((s) => s.id === prev) ? prev : list[0]?.id ?? ''))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoadingSets(false)
    }
  }, [])

  useEffect(() => {
    void refreshSets()
  }, [refreshSets])

  useEffect(() => {
    if (!selectedId) {
      setCases([])
      return
    }
    setLoadingCases(true)
    api
      .getEvalSet(selectedId)
      .then((d) => setCases(d.cases))
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoadingCases(false))
  }, [selectedId])

  useEffect(() => {
    if (!run || (run.status !== 'queued' && run.status !== 'running')) return
    pollRef.current = window.setInterval(() => {
      api
        .getEvalRun(run.job_id)
        .then(setRun)
        .catch((err) => {
          setError(err instanceof Error ? err.message : String(err))
          if (pollRef.current) window.clearInterval(pollRef.current)
        })
    }, 1000)
    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current)
      pollRef.current = null
    }
  }, [run?.status, run?.job_id])

  async function startRun() {
    if (!selectedId || running) return
    setError(null)
    setExpandedId(null)
    try {
      const { job_id } = await api.runEval(selectedId, judge, [...MODE_ORDER])
      setRun({
        job_id,
        set_id: selectedId,
        judge,
        modes: [...MODE_ORDER],
        status: 'queued',
        progress: 0,
        total: 0,
        summary: null,
        results: {},
        error: null,
        started_at: null,
        finished_at: null,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const progressPct = run && run.total > 0 ? Math.round((run.progress / run.total) * 100) : 0

  return (
    <div className="eval-page">
      <header className="page-header">
        <div>
          <h1>评测</h1>
          <p className="page-sub">对知识库问答做回归验证：检索命中、事实覆盖、拒答正确性</p>
        </div>
        <button className="btn ghost" onClick={() => void refreshSets()} disabled={loadingSets}>
          {loadingSets ? '刷新中…' : '↻ 刷新'}
        </button>
      </header>

      {error && (
        <div className="alert error">
          {error}
          <button className="alert-close" onClick={() => setError(null)}>
            ✕
          </button>
        </div>
      )}

      <section className="card">
        <div className="eval-toolbar">
          <label className="kb-picker">
            <span>评测集</span>
            <select
              value={selectedId}
              onChange={(e) => {
                setSelectedId(e.target.value)
                setRun(null)
              }}
              disabled={running}
            >
              {sets.length === 0 && <option value="">（暂无评测集）</option>}
              {sets.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}（{s.cases} 题）
                </option>
              ))}
            </select>
          </label>

          <label className="check-item">
            <input
              type="checkbox"
              checked={judge}
              onChange={(e) => setJudge(e.target.checked)}
              disabled={running}
            />
            <span>启用 LLM 裁判（语义判分，额外消耗 API）</span>
          </label>

          <button className="btn primary" onClick={() => void startRun()} disabled={!selectedId || running}>
            {running ? '评测中…' : '▶ 运行评测'}
          </button>
        </div>

        {selectedId && sets.find((s) => s.id === selectedId)?.knowledge_base && (
          <p className="eval-meta">
            目标知识库：<strong>{sets.find((s) => s.id === selectedId)?.knowledge_base}</strong>
            {loadingCases ? '（加载题目中…）' : ` · 共 ${cases.length} 题`}
          </p>
        )}
      </section>

      {running && (
        <section className="card">
          <div className="eval-progress-head">
            <span>{run?.status === 'queued' ? '排队中…' : '评测进行中…'}</span>
            <span>
              {run?.progress ?? 0}/{run?.total || '—'}
            </span>
          </div>
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: `${progressPct}%` }} />
          </div>
        </section>
      )}

      {run?.status === 'error' && (
        <div className="alert error">评测失败：{run.error ?? '未知错误'}</div>
      )}

      {run?.status === 'done' && run.summary && (
        <>
          <section className="card">
            <h2>检索方式对比</h2>
            <table className="eval-table compare-table">
              <thead>
                <tr>
                  <th>指标</th>
                  {MODE_ORDER.filter((m) => run.summary?.[m]).map((m) => (
                    <th key={m}>{MODE_LABELS[m]}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <CompareRow
                  label="检索命中率"
                  pick={(s) => s.retrieval_recall}
                  summaries={run.summary}
                  modes={MODE_ORDER}
                />
                <CompareRow
                  label="事实覆盖率"
                  pick={(s) => s.fact_accuracy}
                  summaries={run.summary}
                  modes={MODE_ORDER}
                />
                <CompareRow
                  label="拒答正确率"
                  pick={(s) => s.no_answer_accuracy}
                  summaries={run.summary}
                  modes={MODE_ORDER}
                />
                {judge && (
                  <CompareRow
                    label="LLM 裁判准确率"
                    pick={(s) => s.judge_accuracy}
                    summaries={run.summary}
                    modes={MODE_ORDER}
                  />
                )}
              </tbody>
            </table>
          </section>

          <section className="card">
            <h2>逐题结果</h2>
            <div className="mode-tabs">
              {MODE_ORDER.filter((m) => run.results?.[m]).map((m) => (
                <button
                  key={m}
                  className={`mode-tab${activeMode === m ? ' active' : ''}`}
                  onClick={() => setActiveMode(m)}
                >
                  {MODE_LABELS[m]}
                </button>
              ))}
            </div>
            <table className="eval-table">
              <thead>
                <tr>
                  <th className="col-status">状态</th>
                  <th>ID</th>
                  <th>问题</th>
                  <th>回答摘要</th>
                </tr>
              </thead>
              <tbody>
                {(run.results[activeMode] ?? []).map((r) => {
                  const status = caseStatus(r)
                  const expanded = expandedId === r.id
                  return (
                    <FragmentRow
                      key={r.id}
                      result={r}
                      status={status}
                      expanded={expanded}
                      onToggle={() => setExpandedId(expanded ? null : r.id)}
                    />
                  )
                })}
              </tbody>
            </table>
          </section>
        </>
      )}

      {!run && cases.length > 0 && (
        <section className="card">
          <h2>题目预览（{cases.length}）</h2>
          <table className="eval-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>分类</th>
                <th>问题</th>
                <th>预期事实</th>
                <th>预期来源</th>
              </tr>
            </thead>
            <tbody>
              {cases.map((c) => (
                <tr key={c.id}>
                  <td>{c.id}</td>
                  <td>{c.category}</td>
                  <td>{c.question}</td>
                  <td>{c.expect_no_answer ? '（应拒答）' : c.expected_facts.join('、') || '—'}</td>
                  <td>{c.expected_sources.join('、') || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  )
}

function FragmentRow({
  result,
  status,
  expanded,
  onToggle,
}: {
  result: EvalCaseResult
  status: 'PASS' | 'FAIL' | 'SKIP'
  expanded: boolean
  onToggle: () => void
}) {
  return (
    <>
      <tr className={`eval-row ${status.toLowerCase()}`} onClick={onToggle}>
        <td className="col-status">
          <span className={`status-pill ${status.toLowerCase()}`}>{status}</span>
        </td>
        <td>{result.id}</td>
        <td className="eval-question">{result.question}</td>
        <td className="eval-answer-brief">
          {result.is_no_answer ? '（未找到相关依据）' : result.answer.slice(0, 60)}
          {!result.is_no_answer && result.answer.length > 60 ? '…' : ''}
        </td>
      </tr>
      {expanded && (
        <tr className="eval-row-detail">
          <td colSpan={4}>
            <ResultDetail result={result} />
          </td>
        </tr>
      )}
    </>
  )
}
