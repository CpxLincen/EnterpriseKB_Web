import { useCallback, useEffect, useState } from 'react'
import { api, type DirectoryRole } from '../../api'
import { ActionBar, Field, formatTs } from './shared'

export default function RolesPanel() {
  const [roles, setRoles] = useState<DirectoryRole[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [detail, setDetail] = useState<DirectoryRole | null>(null)
  const [mode, setMode] = useState<'view' | 'create' | 'edit'>('view')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setRoles(await api.listRoles())
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function select(id: number) {
    setSelectedId(id)
    setMode('view')
    setError(null)
    try {
      setDetail(await api.getRole(id))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  function startCreate() {
    setSelectedId(null)
    setDetail(null)
    setMode('create')
    setName('')
    setDescription('')
    setError(null)
  }

  function startEdit() {
    if (!detail) return
    setMode('edit')
    setName(detail.name)
    setDescription(detail.description ?? '')
    setError(null)
  }

  async function submit() {
    if (!name.trim()) {
      setError('请填写角色名称')
      return
    }
    setSaving(true)
    setError(null)
    try {
      if (mode === 'create') {
        const created = await api.createRole({ name: name.trim(), description: description.trim() || null })
        setSelectedId(created.id)
        await load()
        await select(created.id)
      } else if (mode === 'edit' && detail) {
        const updated = await api.updateRole(detail.id, { name: name.trim(), description: description.trim() || null })
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
    if (!window.confirm('确定删除该角色吗？关联到人员上的该角色将一并解除。')) return
    setError(null)
    try {
      await api.deleteRole(id)
      setSelectedId(null)
      setDetail(null)
      setMode('view')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <>
      {error && <div className="alert error">{error}</div>}
      <div className="dir-layout">
        <section className="dir-side card">
        <div className="dir-side-head">
          <h2>角色（{roles.length}）</h2>
          <button className="btn primary tiny" onClick={startCreate}>
            ＋ 新建角色
          </button>
        </div>
        {loading ? (
          <p className="empty-tip">加载中…</p>
        ) : roles.length === 0 ? (
          <p className="empty-tip">暂无角色，点击右上角新建。</p>
        ) : (
          <div className="dir-list">
            {roles.map((role) => (
              <button
                key={role.id}
                className={`dir-row${selectedId === role.id ? ' active' : ''}`}
                onClick={() => void select(role.id)}
              >
                <span className="dir-row-name">🔑 {role.name}</span>
                <span className="dir-row-meta">{role.personnel_count} 人</span>
              </button>
            ))}
          </div>
        )}
      </section>

      <section className="dir-detail card">
        {mode === 'create' || mode === 'edit' ? (
          <>
            <h2>{mode === 'create' ? '新建角色' : '编辑角色'}</h2>
            <div className="dir-form">
              <label className="dir-field-row">
                <span>角色名称</span>
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="如 制度管理员" />
              </label>
              <label className="dir-field-row">
                <span>角色描述</span>
                <textarea
                  rows={4}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="该角色的职责说明（可选）"
                />
              </label>
            </div>
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
            <h2>角色详情</h2>
            <div className="dir-detail-grid">
              <Field label="名称">{detail.name}</Field>
              <Field label="人员数">{detail.personnel_count}</Field>
              <Field label="创建时间">{formatTs(detail.created_at)}</Field>
            </div>
            <div className="dir-sub-block">
              <h3>描述</h3>
              <p className="dir-desc">{detail.description || '（无描述）'}</p>
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
          <p className="empty-tip">点击左侧角色查看详情，或「新建角色」。</p>
        )}
        </section>
      </div>
    </>
  )
}
