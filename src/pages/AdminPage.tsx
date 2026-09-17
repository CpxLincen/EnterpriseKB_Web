import { useCallback, useEffect, useRef, useState } from 'react'
import {
  api,
  getStoredUser,
  type DocumentInfo,
  type KnowledgeBase,
  type RebuildResult,
} from '../api'

interface UploadEntry {
  filename: string
  status: 'uploading' | 'ok' | 'error'
  detail: string
}

const ACCEPT = '.md,.txt,.docx,.xlsx,.pptx,.html,.htm,.epub,.pdf'

export default function AdminPage() {
  const isAdmin = getStoredUser()?.role === 'admin'
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBase[]>([])
  const [targetKb, setTargetKb] = useState('default')
  const [files, setFiles] = useState<File[]>([])
  const [uploads, setUploads] = useState<UploadEntry[]>([])
  const [uploading, setUploading] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [expandedKb, setExpandedKb] = useState<string | null>(null)
  const [documents, setDocuments] = useState<Record<string, DocumentInfo[]>>({})
  const [loadingDocs, setLoadingDocs] = useState<Record<string, boolean>>({})
  const [refreshing, setRefreshing] = useState(false)
  const [kbError, setKbError] = useState<string | null>(null)
  const [opsKb, setOpsKb] = useState('default')
  const [opsSourceDir, setOpsSourceDir] = useState('')
  const [opsLoading, setOpsLoading] = useState<'reingest' | 'rebuild' | null>(null)
  const [opsResult, setOpsResult] = useState<RebuildResult | null>(null)
  const [opsError, setOpsError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const refreshKbs = useCallback(async () => {
    setRefreshing(true)
    try {
      const kbs = await api.listKnowledgeBases()
      setKnowledgeBases(kbs)
      setTargetKb((prev) => (kbs.some((kb) => kb.name === prev) ? prev : kbs[0]?.name ?? 'default'))
      setExpandedKb((prev) => (prev && kbs.some((kb) => kb.name === prev) ? prev : null))
      setKbError(null)
    } catch (err) {
      const text = err instanceof Error ? err.message : String(err)
      setKbError(text)
    } finally {
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    void refreshKbs()
  }, [refreshKbs])

  function handleFiles(list: FileList | null) {
    if (!list) return
    const next = Array.from(list)
    setFiles((prev) => {
      const seen = new Set(prev.map((f) => `${f.name}:${f.size}`))
      return [...prev, ...next.filter((f) => !seen.has(`${f.name}:${f.size}`))]
    })
  }

  async function loadDocuments(kb: string) {
    setLoadingDocs((prev) => ({ ...prev, [kb]: true }))
    try {
      const docs = await api.listDocuments(kb)
      setDocuments((prev) => ({ ...prev, [kb]: docs }))
    } catch (err) {
      const text = err instanceof Error ? err.message : String(err)
      alert(`加载文档失败：${text}`)
    } finally {
      setLoadingDocs((prev) => ({ ...prev, [kb]: false }))
    }
  }

  async function toggleKb(kb: string) {
    if (expandedKb === kb) {
      setExpandedKb(null)
      return
    }
    setExpandedKb(kb)
    if (!documents[kb]) {
      await loadDocuments(kb)
    }
  }

  async function handleUpload() {
    if (files.length === 0 || uploading) return
    const kb = targetKb.trim() || 'default'
    setUploading(true)
    setUploads(files.map((f) => ({ filename: f.name, status: 'uploading' as const, detail: '上传解析中…' })))
    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      try {
        const res = await api.uploadDocument(kb, file)
        let detail =
          res.chunks > 0
            ? `解析成功，已写入 ${res.chunks} 个文本块到向量库`
            : '内容已存在（哈希去重），未重复导入'
        if (res.chunks > 0) {
          const meta = [`正文 ${res.text_chunks ?? 0}`, `表格 ${res.table_chunks ?? 0}`]
          if (res.skipped_pages) meta.push(`跳过扫描页 ${res.skipped_pages}`)
          if (res.ocr_pages) meta.push(`OCR ${res.ocr_pages} 页`)
          if (res.parse_ms != null) meta.push(`解析 ${Math.round(res.parse_ms)}ms`)
          detail += `（${meta.join(' · ')}）`
        }
        if (res.warnings && res.warnings.length > 0) {
          detail += `；⚠️ ${res.warnings.join('；')}`
        }
        setUploads((prev) => prev.map((u, idx) => (idx === i ? { ...u, status: 'ok' as const, detail } : u)))
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err)
        setUploads((prev) => prev.map((u, idx) => (idx === i ? { ...u, status: 'error' as const, detail } : u)))
      }
    }
    setUploading(false)
    setFiles([])
    if (fileInputRef.current) fileInputRef.current.value = ''
    await refreshKbs()
    if (expandedKb === kb) {
      await loadDocuments(kb)
    }
  }

  async function handleDelete(kb: string, doc: DocumentInfo) {
    const ok = window.confirm(`确定删除文档「${doc.filename}」吗？其 ${doc.chunk_count} 个文本块将一并从向量库删除。`)
    if (!ok) return
    try {
      await api.deleteDocument(kb, doc.id)
      await loadDocuments(kb)
      await refreshKbs()
    } catch (err) {
      const text = err instanceof Error ? err.message : String(err)
      alert(`删除失败：${text}`)
    }
  }

  async function handleRebuild(mode: 'reingest' | 'rebuild') {
    const kb = opsKb.trim() || 'default'
    const dir = opsSourceDir.trim()
    if (!dir) {
      setOpsError('请填写服务器本机源文档目录路径')
      return
    }
    if (mode === 'rebuild') {
      const ok = window.confirm(
        `确定重建知识库「${kb}」吗？将清空该库全部文档，并按「${dir}」全量重导；目录之外的旧文档会被删除。`,
      )
      if (!ok) return
    }
    setOpsLoading(mode)
    setOpsResult(null)
    setOpsError(null)
    try {
      const res =
        mode === 'reingest'
          ? await api.reingestKnowledgeBase(kb, dir)
          : await api.rebuildKnowledgeBase(kb, dir)
      setOpsResult(res)
      await refreshKbs()
      if (expandedKb === kb) await loadDocuments(kb)
    } catch (err) {
      setOpsError(err instanceof Error ? err.message : String(err))
    } finally {
      setOpsLoading(null)
    }
  }

  function removeFile(index: number) {
    setFiles((prev) => prev.filter((_, i) => i !== index))
  }

  return (
    <div className="admin-page">
      <header className="page-header">
        <div>
          <h1>知识库管理</h1>
          <p className="page-sub">上传文档并解析入库（向量化），或管理已有知识库</p>
        </div>
        <button className="btn ghost" onClick={() => void refreshKbs()} disabled={refreshing}>
          {refreshing ? '刷新中…' : '↻ 刷新'}
        </button>
      </header>

      {kbError && <div className="alert error">无法连接后端：{kbError}</div>}

      <section className="card upload-card">
        <h2>上传文档</h2>
        <div className="upload-form">
          <label className="kb-picker">
            <span>目标知识库</span>
            <input
              list="admin-kb-options"
              value={targetKb}
              onChange={(e) => setTargetKb(e.target.value)}
              placeholder="输入或选择知识库名称（不存在则自动创建）"
            />
            <datalist id="admin-kb-options">
              {knowledgeBases.map((kb) => (
                <option key={kb.name} value={kb.name} />
              ))}
            </datalist>
          </label>

          <div
            className={`dropzone${dragging ? ' dragging' : ''}`}
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault()
              setDragging(true)
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDragging(false)
              handleFiles(e.dataTransfer.files)
            }}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPT}
              multiple
              hidden
              onChange={(e) => handleFiles(e.target.files)}
            />
            <div className="dropzone-icon">📄</div>
            <p>点击选择或拖拽文件到此处</p>
            <p className="dropzone-sub">支持 .md / .txt / .docx / .xlsx / .pptx / .html / .epub / 文字型 .pdf，可多选</p>
          </div>

          {files.length > 0 && (
            <ul className="file-list">
              {files.map((f, i) => (
                <li key={`${f.name}:${f.size}`}>
                  <span className="file-name">📎 {f.name}</span>
                  <span className="file-size">{(f.size / 1024).toFixed(1)} KB</span>
                  <button className="btn tiny danger" onClick={() => removeFile(i)}>
                    移除
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="upload-actions">
            <button className="btn primary" onClick={() => void handleUpload()} disabled={files.length === 0 || uploading}>
              {uploading ? '上传解析中…' : `上传并解析（${files.length}）`}
            </button>
          </div>
        </div>

        {uploads.length > 0 && (
          <ul className="upload-results">
            {uploads.map((u, i) => (
              <li key={i} className={`upload-result ${u.status}`}>
                <span className="status-icon">{u.status === 'ok' ? '✅' : u.status === 'error' ? '❌' : '⏳'}</span>
                <span className="upload-filename">{u.filename}</span>
                <span className="upload-detail">{u.detail}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {isAdmin && (
        <section className="card">
          <h2>索引运维（重导 / 重建）</h2>
          <p className="page-sub">
            从服务器本机源文档目录重建知识库索引。重导（reingest）保持 Embedding 配置并替换同名文档；
            重建（rebuild）会清空该库后全量重导，用于更换 Embedding 模型或彻底重建。
          </p>
          <div className="upload-form">
            <label className="kb-picker">
              <span>目标知识库</span>
              <input
                list="admin-ops-kb-options"
                value={opsKb}
                onChange={(e) => setOpsKb(e.target.value)}
                placeholder="知识库名"
              />
              <datalist id="admin-ops-kb-options">
                {knowledgeBases.map((kb) => (
                  <option key={kb.name} value={kb.name} />
                ))}
              </datalist>
            </label>
            <label className="kb-picker">
              <span>服务器源目录</span>
              <input
                value={opsSourceDir}
                onChange={(e) => setOpsSourceDir(e.target.value)}
                placeholder="如 E:\EnterpriseKB\examples"
              />
            </label>
            <div className="upload-actions">
              <button className="btn" onClick={() => void handleRebuild('reingest')} disabled={opsLoading !== null}>
                {opsLoading === 'reingest' ? '重导中…' : '↻ 重导（reingest）'}
              </button>
              <button className="btn danger" onClick={() => void handleRebuild('rebuild')} disabled={opsLoading !== null}>
                {opsLoading === 'rebuild' ? '重建中…' : '⟳ 重建（rebuild）'}
              </button>
            </div>
          </div>
          {opsError && <div className="alert error">{opsError}</div>}
          {opsResult && (
            <div className="ops-result">
              <div className="ops-ok">
                ✅ 已处理 {opsResult.processed} 个文件，写入 {opsResult.chunks} 个文本块。
              </div>
              {opsResult.warnings && opsResult.warnings.length > 0 && (
                <div className="ops-warn">⚠️ {opsResult.warnings.join('；')}</div>
              )}
              {opsResult.errors && opsResult.errors.length > 0 && (
                <div className="ops-errors">❌ 部分文件失败：{opsResult.errors.join('；')}</div>
              )}
            </div>
          )}
        </section>
      )}

      <section className="card">
        <h2>知识库列表（{knowledgeBases.length}）</h2>
        {knowledgeBases.length === 0 ? (
          <p className="empty-tip">暂无知识库，上传一个文档后会自动创建。</p>
        ) : (
          <ul className="kb-list">
            {knowledgeBases.map((kb) => (
              <li key={kb.name} className="kb-item">
                <button className="kb-row" onClick={() => void toggleKb(kb.name)}>
                  <span className="kb-name">🗂️ {kb.name}</span>
                  <span className="kb-meta">
                    {kb.embedding_model} · {kb.embedding_dimensions} 维 · {kb.document_count} 篇文档
                  </span>
                  <span className="kb-toggle">{expandedKb === kb.name ? '▲' : '▼'}</span>
                </button>
                {expandedKb === kb.name && (
                  <div className="kb-docs">
                    {loadingDocs[kb.name] ? (
                      <p className="empty-tip">加载中…</p>
                    ) : (documents[kb.name] ?? []).length === 0 ? (
                      <p className="empty-tip">该知识库暂无文档。</p>
                    ) : (
                      <table className="doc-table">
                        <thead>
                          <tr>
                            <th>文件名</th>
                            <th>文本块数</th>
                            <th>导入时间</th>
                            <th>操作</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(documents[kb.name] ?? []).map((doc) => (
                            <tr key={doc.id}>
                              <td className="doc-name">📄 {doc.filename}</td>
                              <td>{doc.chunk_count}</td>
                              <td>{doc.created_at ? new Date(doc.created_at).toLocaleString() : '-'}</td>
                              <td>
                                <button className="btn tiny danger" onClick={() => void handleDelete(kb.name, doc)}>
                                  删除
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
