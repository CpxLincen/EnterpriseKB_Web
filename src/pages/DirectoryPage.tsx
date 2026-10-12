import { useState } from 'react'
import OrganizationsPanel from './directory/OrganizationsPanel'
import PersonnelPanel from './directory/PersonnelPanel'
import RolesPanel from './directory/RolesPanel'

type TabKey = 'orgs' | 'personnel' | 'roles'

const TABS: { key: TabKey; label: string }[] = [
  { key: 'orgs', label: '组织' },
  { key: 'personnel', label: '人员' },
  { key: 'roles', label: '角色' },
]

export default function DirectoryPage() {
  const [tab, setTab] = useState<TabKey>('orgs')

  return (
    <div className="directory-page">
      <header className="page-header">
        <div>
          <h1>组织架构</h1>
          <p className="page-sub">管理组织、人员与角色，维护企业通讯录（为 SSO 与权限打基础）</p>
        </div>
      </header>

      <div className="mode-tabs">
        {TABS.map((t) => (
          <button
            key={t.key}
            className={`mode-tab${tab === t.key ? ' active' : ''}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="dir-error-wrap">
        {tab === 'orgs' && <OrganizationsPanel />}
        {tab === 'personnel' && <PersonnelPanel />}
        {tab === 'roles' && <RolesPanel />}
      </div>
    </div>
  )
}
