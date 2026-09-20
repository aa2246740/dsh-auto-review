import type { ReactNode } from 'react'
import type { ApprovalDashboard } from '../contracts.ts'
import type { ApprovalTranslate } from './i18n.ts'
import styles from './styles.module.css'

/** Secondary explanations stay discoverable without competing with the controls. */
export function HelpDisclosure({ title, children }: { title: string; children: ReactNode }): ReactNode {
  return <details className={styles['help']}><summary>{title}</summary><div className={styles['helpBody']}>{children}</div></details>
}

export function Overview({ dashboard, t, children, onHistory }: {
  dashboard: ApprovalDashboard; t: ApprovalTranslate; children: ReactNode; onHistory: () => void;
}): ReactNode {
  const recent = dashboard.records.slice(0, 3)
  return <>
    {children}
    <section className={styles['activity']} aria-label={t('recentActivity')}>
      <header className={styles['rowBetween']}><h3>{t('recentActivity')}</h3>
        <button type="button" className={styles['textButton']} onClick={onHistory}>{t('viewHistory')}</button>
      </header>
      {recent.length === 0 ? <div className={styles['quietEmpty']}><p>{t('noActivity')}</p><span>{t('activityHint')}</span></div>
        : <ul className={styles['activityList']}>{recent.map(record => {
          const date = new Date(record.createdAt)
          const validDate = Number.isFinite(date.valueOf())
          return <li key={record.id}>
            <div className={styles['activityName']}><strong title={record.toolName}>{record.toolName}</strong><time dateTime={validDate ? date.toISOString() : undefined}>{validDate ? date.toLocaleString() : t('unknown')}</time></div>
            <span className={styles['badge']}>{t(`status.${record.status}`)}</span>
          </li>
        })}</ul>}
    </section>
    <HelpDisclosure title={t('learnMore')}>
      <p>{t('modeExplanation')}</p>
      <p>{t('fullAccess')}</p>
      <p>{t('humanFallback')}</p>
      <p>{t('capabilityHint')}</p>
      <dl className={styles['supportList']}>
        {(['creatorPlus', 'creator'] as const).map(mode => <div key={mode}>
          <dt>{t(mode)} · {t(dashboard.capabilities[mode].automatic ? 'supported' : 'unsupported')}</dt>
          <dd>{dashboard.capabilities[mode].reason}</dd>
        </div>)}
      </dl>
      <p>{t('boundaries')}</p>
      <p>{t('retention', { days: dashboard.storage.retentionDays, count: dashboard.storage.maxRecords })}</p>
    </HelpDisclosure>
  </>
}
