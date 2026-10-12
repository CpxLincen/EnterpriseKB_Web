import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { api, type Organization, type OrganizationDetail, type OrganizationWrite } from '../../api'
import { ActionBar, Field, StatusPill, formatTs } from './shared'

interface OrgFormState {
  org_name: string
  org_type: string
  pid: string
  status: string
  external_id: string
}

const EMPTY_FORM: OrgFormState = {
  org_name: '',
  org_type: 'dept',
  pid: '',
  status: 'active',
  external_id: '',
}

const ORG_TYPE_HINTS = ['company', 'dept', 'team', 'group']

export default function OrganizationsPanel() {
  const [orgs, setOrgs] = useState<Organization[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [detail, setDetail] = useState<OrganizationDetail | null>(null)
  const [mode, setMode] = useState<'view' | 'create' | 'edit'>('view')
  const [form, setForm] = useState<OrgFormState>(EMPTY_FORM)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setOrgs(await api.listOrganizations())
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const childrenMap = useMemo(() => {
    const map = new Map<number | null, Organization[]>()
    for (const org of orgs) {
      const key = org.pid
      const list = map.get(key) ?? []
      list.push(org)
      map.set(key, list)
    }
    return map
  }, [orgs])

  async function select(id: number) {
    setSelectedId(id)
    setMode('view')
    setError(null)
    try {
      setDetail(await api.getOrganization(id))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  function startCreate() {
    setSelectedId(null)
    setDetail(null)
    setMode('create')
    setForm(EMPTY_FORM)
    setError(null)
  }

  function startEdit() {
    if (!detail) return
    setMode('edit')
    setForm({
      org_name: detail.org_name,
      org_type: detail.org_type,
      pid: detail.pid != null ? String(detail.pid) : '',
      status: detail.status,
      external_id: detail.external_id ?? '',
    })
    setError(null)
  }

  function set<K extends keyof OrgFormState>(key: K, value: OrgFormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  function toPayload(): OrganizationWrite {
    return {
      org_name: form.org_name.trim(),
      org_type: form.org_type.trim() || 'dept',
      pid: form.pid ? Number(form.pid) : null,
      status: form.status,
      external_id: form.external_id.trim() || null,
    }
  }

  async function submit() {
    if (!form.org_name.trim()) {
      setError('请填写组织名称')
      return
    }
    setSaving(true)
    setError(null)
    try {
      if (mode === 'create') {
        const created = await api.createOrganization(toPayload())
        setSelectedId(created.id)
        await load()
        await select(created.id)
      } else if (mode === 'edit' && detail) {
        const updated = await api.updateOrganization(detail.id, toPayload())
        setSelectedId(updated.id)
        await load()
        await select(updated.id)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  async function remove(id: number) {
    if (!window.confirm('确定删除该组织吗？存在子组织或人员归属时将无法删除。')) return
    setError(null)
    try {
      await api.deleteOrganization(id)
      setSelectedId(null)
      setDetail(null)
      setMode('view')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const renderTree = (parentId: number | null, depth: number): ReactNode => {
    const nodes = childrenMap.get(parentId) ?? []
    return nodes.map((org) => (
      <div key={org.id}>
        <button
          className={`dir-row${selectedId === org.id ? ' active' : ''}`}
          style={{ paddingLeft: `${12 + depth * 18}px` }}
          onClick={() => void select(org.id)}
        >
          <span className="dir-row-name">
            {depth === 0 ? '🏢' : '└'} {org.org_name}
          </span>
          <span className="dir-row-meta">
            {org.org_type} · 层级 {org.layer} · {org.personnel_count} 人
          </span>
          <StatusPill status={org.status} />
        </button>
        {renderTree(org.id, depth + 1)}
      </div>
    ))
  }

  return (
    <>
      {error && <div className="alert error">{error}</div>}
      <div className="dir-layout">
        <section className="dir-side card">
        <div className="dir-side-head">
          <h2>组织树（{orgs.length}）</h2>
          <button className="btn primary tiny" onClick={startCreate}>
            ＋ 新建组织
          </button>
        </div>
        {loading ? (
          <p className="empty-tip">加载中…</p>
        ) : orgs.length === 0 ? (
          <p className="empty-tip">暂无组织，点击右上角新建。</p>
        ) : (
          <div className="dir-list">{renderTree(null, 0)}</div>
        )}
      </section>

      <section className="dir-detail card">
        {mode === 'create' || mode === 'edit' ? (
          <>
            <h2>{mode === 'create' ? '新建组织' : '编辑组织'}</h2>
            <OrgForm form={form} set={set} orgs={orgs} excludeId={detail?.id ?? null} />
            <ActionBar>
              <button className="btn primary" onClick={() => void submit()} disabled={saving}>
                {saving ? '保存中…' : '保存'}
              </button>
              <button className="btn ghost" onClick={() => setMode('view')} disabled={saving}>
                取消
              </button>
            </ActionBar>
          </>
        ) : detail ? (
          <>
            <h2>组织详情</h2>
            <div className="dir-detail-grid">
              <Field label="名称">{detail.org_name}</Field>
              <Field label="类型">{detail.org_type}</Field>
              <Field label="层级">{detail.layer}</Field>
              <Field label="状态"><StatusPill status={detail.status} /></Field>
              <Field label="父组织">{detail.parent ? detail.parent.org_name : '—（根组织）'}</Field>
              <Field label="外部标识">{detail.external_id ?? '-'}</Field>
              <Field label="人员数">{detail.personnel_count}</Field>
              <Field label="更新时间">{formatTs(detail.updated_at)}</Field>
            </div>
            <div className="dir-sub-block">
              <h3>子组织（{detail.children.length}）</h3>
              {detail.children.length === 0 ? (
                <p className="empty-tip">无子组织。</p>
              ) : (
                <ul className="dir-tags">
                  {detail.children.map((c) => (
                    <li key={c.id} className="dir-tag">
                      {c.org_name}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <ActionBar>
              <button className="btn" onClick={startEdit}>
                ✎ 编辑
              </button>
              <button className="btn danger" onClick={() => void remove(detail.id)}>
                删除
              </button>
            </ActionBar>
          </>
        ) : (
          <p className="empty-tip">点击左侧组织查看详情，或「新建组织」。</p>
        )}
        </section>
      </div>
    </>
  )
}

function OrgForm({
  form,
  set,
  orgs,
  excludeId,
}: {
  form: OrgFormState
  set: <K extends keyof OrgFormState>(key: K, value: OrgFormState[K]) => void
  orgs: Organization[]
  excludeId: number | null
}) {
  const parentOptions = orgs.filter((o) => o.id !== excludeId)
  return (
    <div className="dir-form">
      <label className="dir-field-row">
        <span>组织名称</span>
        <input maxLength={200} value={form.org_name} onChange={(e) => set('org_name', e.target.value)} placeholder="如 综合管理部" />
      </label>
      <label className="dir-field-row">
        <span>组织类型</span>
        <input maxLength={50} list="org-type-hints" value={form.org_type} onChange={(e) => set('org_type', e.target.value)} />
        <datalist id="org-type-hints">
          {ORG_TYPE_HINTS.map((t) => (
            <option key={t} value={t} />
          ))}
        </datalist>
      </label>
      <label className="dir-field-row">
        <span>父组织</span>
        <select value={form.pid} onChange={(e) => set('pid', e.target.value)}>
          <option value="">— 无（作为根组织）—</option>
          {parentOptions.map((o) => (
            <option key={o.id} value={o.id}>
              {o.org_name}
            </option>
          ))}
        </select>
      </label>
      <label className="dir-field-row">
        <span>状态</span>
        <select value={form.status} onChange={(e) => set('status', e.target.value)}>
          <option value="active">启用</option>
          <option value="disabled">停用</option>
        </select>
      </label>
      <label className="dir-field-row">
        <span>外部标识（可选）</span>
        <input maxLength={200} value={form.external_id} onChange={(e) => set('external_id', e.target.value)} placeholder="IdP 侧组织 ID（全局唯一）" />
      </label>
    </div>
  )
}
