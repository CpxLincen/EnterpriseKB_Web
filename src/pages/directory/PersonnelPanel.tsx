import { useCallback, useEffect, useState } from 'react'
import {
  api,
  type DirectoryRole,
  type Organization,
  type Personnel,
  type PersonnelWrite,
} from '../../api'
import { ActionBar, Field, StatusPill, formatTs } from './shared'

const PAGE_SIZE = 20

interface PersonFormState {
  userid: string
  username: string
  company_id: string
  dept_id: string
  status: string
  wework_id: string
}

const EMPTY_FORM: PersonFormState = {
  userid: '',
  username: '',
  company_id: '',
  dept_id: '',
  status: 'active',
  wework_id: '',
}

export default function PersonnelPanel() {
  const [orgs, setOrgs] = useState<Organization[]>([])
  const [roles, setRoles] = useState<DirectoryRole[]>([])
  const [items, setItems] = useState<Personnel[]>([])
  const [total, setTotal] = useState(0)
  const [offset, setOffset] = useState(0)
  const [q, setQ] = useState('')
  const [deptFilter, setDeptFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [detail, setDetail] = useState<Personnel | null>(null)
  const [mode, setMode] = useState<'view' | 'create' | 'edit'>('view')
  const [form, setForm] = useState<PersonFormState>(EMPTY_FORM)
  const [roleIds, setRoleIds] = useState<number[]>([])
  const [roleDirty, setRoleDirty] = useState(false)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [savingRoles, setSavingRoles] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(
    async (nextOffset: number, nextQ = q, nextDept = deptFilter, nextStatus = statusFilter) => {
      setLoading(true)
      setError(null)
      try {
        const res = await api.listPersonnel({
          q: nextQ || undefined,
          dept_id: nextDept ? Number(nextDept) : undefined,
          status: nextStatus || undefined,
          limit: PAGE_SIZE,
          offset: nextOffset,
        })
        setItems(res.items)
        setTotal(res.total)
        setOffset(res.offset)
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      } finally {
        setLoading(false)
      }
    },
    [q, deptFilter, statusFilter],
  )

  useEffect(() => {
    void load(0)
    void api
      .listOrganizations()
      .then(setOrgs)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
    void api
      .listRoles()
      .then(setRoles)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function select(id: number) {
    setSelectedId(id)
    setMode('view')
    setError(null)
    try {
      const person = await api.getPersonnel(id)
      setDetail(person)
      setRoleIds(person.roles.map((r) => r.id))
      setRoleDirty(false)
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
      userid: detail.userid,
      username: detail.username,
      company_id: detail.company_id != null ? String(detail.company_id) : '',
      dept_id: detail.dept_id != null ? String(detail.dept_id) : '',
      status: detail.status,
      wework_id: detail.wework_id ?? '',
    })
    setError(null)
  }

  function set<K extends keyof PersonFormState>(key: K, value: PersonFormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  function toPayload(): PersonnelWrite {
    return {
      userid: form.userid.trim(),
      username: form.username.trim(),
      company_id: form.company_id ? Number(form.company_id) : null,
      dept_id: form.dept_id ? Number(form.dept_id) : null,
      status: form.status,
      wework_id: form.wework_id.trim() || null,
    }
  }

  async function submit() {
    if (!form.userid.trim() || !form.username.trim()) {
      setError('请填写人员账号与姓名')
      return
    }
    setSaving(true)
    setError(null)
    try {
      if (mode === 'create') {
        const created = await api.createPersonnel(toPayload())
        setSelectedId(created.id)
        await load(0)
        await select(created.id)
      } else if (mode === 'edit' && detail) {
        const updated = await api.updatePersonnel(detail.id, toPayload())
        setSelectedId(updated.id)
        await load(offset)
        setDetail(updated)
        setMode('view')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  async function remove(id: number) {
    if (!window.confirm('确定删除该人员吗？其角色关联将一并清除。')) return
    setError(null)
    try {
      await api.deletePersonnel(id)
      setSelectedId(null)
      setDetail(null)
      setMode('view')
      await load(offset)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  function toggleRole(id: number) {
    setRoleIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
    setRoleDirty(true)
  }

  async function saveRoles() {
    if (!detail) return
    setSavingRoles(true)
    setError(null)
    try {
      const updated = await api.setPersonnelRoles(detail.id, roleIds)
      setDetail(updated)
      setRoleIds(updated.roles.map((r) => r.id))
      setRoleDirty(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSavingRoles(false)
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1

  return (
    <>
      {error && <div className="alert error">{error}</div>}
      <div className="dir-layout">
        <section className="dir-side card">
        <div className="dir-side-head">
          <h2>人员（{total}）</h2>
          <button className="btn primary tiny" onClick={startCreate}>
            ＋ 新建人员
          </button>
        </div>
        <div className="dir-toolbar">
          <input
            className="dir-search"
            placeholder="搜索姓名 / 账号 / 企业微信 / 部门"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void load(0, q)
            }}
          />
          <select value={deptFilter} onChange={(e) => { setDeptFilter(e.target.value); void load(0, q, e.target.value, statusFilter) }}>
            <option value="">全部部门</option>
            {orgs.map((o) => (
              <option key={o.id} value={o.id}>
                {o.org_name}
              </option>
            ))}
          </select>
          <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); void load(0, q, deptFilter, e.target.value) }}>
            <option value="">全部状态</option>
            <option value="active">启用</option>
            <option value="disabled">停用</option>
          </select>
        </div>
        {loading ? (
          <p className="empty-tip">加载中…</p>
        ) : items.length === 0 ? (
          <p className="empty-tip">暂无人员。</p>
        ) : (
          <div className="dir-list">
            {items.map((person) => (
              <button
                key={person.id}
                className={`dir-row${selectedId === person.id ? ' active' : ''}`}
                onClick={() => void select(person.id)}
              >
                <span className="dir-row-name">👤 {person.username}</span>
                <span className="dir-row-meta">
                  {person.userid}
                  {person.dept_name ? ` · ${person.dept_name}` : ''}
                  {person.roles.length ? ` · ${person.roles.length} 角色` : ''}
                </span>
                <StatusPill status={person.status} />
              </button>
            ))}
          </div>
        )}
        <div className="pager">
          <span>
            第 {currentPage} / {totalPages} 页
          </span>
          <button className="btn ghost tiny" onClick={() => void load(offset - PAGE_SIZE)} disabled={loading || currentPage <= 1}>
            上一页
          </button>
          <button className="btn ghost tiny" onClick={() => void load(offset + PAGE_SIZE)} disabled={loading || currentPage >= totalPages}>
            下一页
          </button>
        </div>
      </section>

      <section className="dir-detail card">
        {mode === 'create' || mode === 'edit' ? (
          <>
            <h2>{mode === 'create' ? '新建人员' : '编辑人员'}</h2>
            <PersonForm form={form} set={set} orgs={orgs} />
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
            <h2>人员详情</h2>
            <div className="dir-detail-grid">
              <Field label="姓名">{detail.username}</Field>
              <Field label="账号">{detail.userid}</Field>
              <Field label="状态"><StatusPill status={detail.status} /></Field>
              <Field label="公司">{detail.company_name ?? '-'}</Field>
              <Field label="部门">{detail.dept_name ?? '-'}</Field>
              <Field label="企业微信">{detail.wework_id ?? '-'}</Field>
              <Field label="本地账号">{detail.user_id != null ? `#${detail.user_id}` : '未关联'}</Field>
              <Field label="更新时间">{formatTs(detail.updated_at)}</Field>
            </div>

            <div className="dir-sub-block">
              <h3>关联角色（{roleIds.length}）</h3>
              {roles.length === 0 ? (
                <p className="empty-tip">暂无角色可关联，请先到「角色」页新建。</p>
              ) : (
                <div className="role-checkbox-list">
                  {roles.map((role) => (
                    <label key={role.id} className="role-checkbox-item">
                      <input
                        type="checkbox"
                        checked={roleIds.includes(role.id)}
                        onChange={() => toggleRole(role.id)}
                      />
                      <span>{role.name}</span>
                      {role.description ? <em>{role.description}</em> : null}
                    </label>
                  ))}
                </div>
              )}
              <button
                className="btn primary tiny"
                onClick={() => void saveRoles()}
                disabled={savingRoles || !roleDirty}
              >
                {savingRoles ? '保存中…' : roleDirty ? '保存角色关联' : '已保存'}
              </button>
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
          <p className="empty-tip">点击左侧人员查看详情（可关联角色），或「新建人员」。</p>
        )}
        </section>
      </div>
    </>
  )
}

function PersonForm({
  form,
  set,
  orgs,
}: {
  form: PersonFormState
  set: <K extends keyof PersonFormState>(key: K, value: PersonFormState[K]) => void
  orgs: Organization[]
}) {
  return (
    <div className="dir-form">
      <label className="dir-field-row">
        <span>账号（userid）</span>
        <input maxLength={200} value={form.userid} onChange={(e) => set('userid', e.target.value)} placeholder="企业账号 / IdP 唯一标识" />
      </label>
      <label className="dir-field-row">
        <span>姓名</span>
        <input maxLength={200} value={form.username} onChange={(e) => set('username', e.target.value)} placeholder="真实姓名" />
      </label>
      <label className="dir-field-row">
        <span>所属公司</span>
        <select value={form.company_id} onChange={(e) => set('company_id', e.target.value)}>
          <option value="">— 未指定 —</option>
          {orgs.map((o) => (
            <option key={o.id} value={o.id}>
              {o.org_name}
            </option>
          ))}
        </select>
      </label>
      <label className="dir-field-row">
        <span>所属部门</span>
        <select value={form.dept_id} onChange={(e) => set('dept_id', e.target.value)}>
          <option value="">— 未指定 —</option>
          {orgs.map((o) => (
            <option key={o.id} value={o.id}>
              {o.org_name}
            </option>
          ))}
        </select>
      </label>
      <label className="dir-field-row">
        <span>状态</span>
        <select value={form.status} onChange={(e) => set('status', e.target.value)}>
          <option value="active">启用（在职）</option>
          <option value="disabled">停用（离职）</option>
        </select>
      </label>
      <label className="dir-field-row">
        <span>企业微信（可选）</span>
        <input maxLength={200} value={form.wework_id} onChange={(e) => set('wework_id', e.target.value)} placeholder="企业微信 userid" />
      </label>
    </div>
  )
}
