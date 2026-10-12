import type { ReactNode } from 'react'

export function formatTs(ts: string | null): string {
  if (!ts) return '-'
  const d = new Date(ts)
  return Number.isNaN(d.getTime()) ? ts : d.toLocaleString()
}

export function StatusPill({ status }: { status: string }) {
  const labels: Record<string, string> = { active: '启用', disabled: '停用' }
  return <span className={`status-pill ${status}`}>{labels[status] ?? status}</span>
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="dir-field">
      <span className="dir-field-label">{label}</span>
      <span className="dir-field-value">{children}</span>
    </div>
  )
}

export function ActionBar({
  children,
}: {
  children: ReactNode
}) {
  return <div className="dir-actions">{children}</div>
}
