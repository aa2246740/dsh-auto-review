import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type { SettingsScope } from '@deepseek-ai/dsh-client-runtime/client'
import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings-plugins/client'
import { useEffect, useState, useSyncExternalStore } from 'react'
import type { ReactNode } from 'react'
import { installApproveForMeIcon } from './permission-mode-icon.ts'
import styles from './styles.module.css'

export const name = 'dsh-approve-for-me-client'
export const inject = ['slots', 'settingsScope', 'connection']

const SETTINGS_NAMESPACE = 'dsh-approve-for-me'

interface ReviewerSettings {
  enabled?: boolean
  modelMode?: 'follow-agent' | 'fixed'
  reviewerRoute?: string
  thinkingMode?: 'lowest' | 'provider-default'
  timeoutMs?: number
  transportRetries?: number
  maxOutputTokens?: number
  repeatApprovalMode?: 'same-request-exact' | 'off'
}

interface RouteOption {
  value: string
  label: string
}

interface CardInjected {
  scope: SettingsScope<ReviewerSettings>
  loadCatalog: () => Promise<RouteOption[]>
}

/** Register the official Plugins-page card and bind it to durable Host settings. */
export function apply(ctx: ClientContext): void {
  const scope = ctx.settingsScope.bind<ReviewerSettings>({ namespace: SETTINGS_NAMESPACE })
  const connection = ctx.get('connection') as ConnectionHandle
  const loadCatalog = async (): Promise<RouteOption[]> => {
    const response = await connection.api.llm.models({})
    if (!response.result.ok) throw new Error(response.result.error.message)
    return response.result.value.groups.flatMap(group => group.models.map(model => ({
      value: JSON.stringify([group.id, model.id]),
      label: `${group.name} · ${model.name}`,
    })))
  }
  ctx.effect(
    () => installApproveForMeIcon(),
    'dsh-approve-for-me: decorate the dedicated permission preset',
  )
  ctx.slots.inject('settings.plugin.item', () => ctx.slots.register({
    name: 'settings.plugin.item',
    key: SETTINGS_NAMESPACE,
    inject: (): CardInjected => ({ scope, loadCatalog }),
  }, DshApproveForMeCard))
}

function DshApproveForMeCard(props: Partial<CardInjected>): ReactNode {
  const scope = props.scope
  const loadCatalog = props.loadCatalog
  if (scope === undefined || loadCatalog === undefined) return null
  return <LoadedCard scope={scope} loadCatalog={loadCatalog} />
}

function LoadedCard({ scope, loadCatalog }: CardInjected): ReactNode {
  const snapshot = useSyncExternalStore(
    listener => scope.subscribe(listener),
    () => scope.getSnapshot(),
  )
  const [options, setOptions] = useState<RouteOption[]>([])
  const [catalogState, setCatalogState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [catalogError, setCatalogError] = useState('')
  const [writing, setWriting] = useState(false)
  const settings = snapshot.value
  const refresh = (): void => {
    setCatalogState('loading')
    setCatalogError('')
    void loadCatalog()
      .then((next) => {
        setOptions(next)
        setCatalogState('ready')
      })
      .catch((error: unknown) => {
        setCatalogState('error')
        setCatalogError(error instanceof Error ? error.message : String(error))
      })
  }

  useEffect(refresh, [loadCatalog])

  const write = async (operation: () => Promise<void>): Promise<void> => {
    setWriting(true)
    try {
      await operation()
    } finally {
      setWriting(false)
    }
  }

  if (snapshot.status === 'loading' || settings === undefined) {
    return <div className={styles['card']}><p className={styles['muted']}>正在读取审批设置…</p></div>
  }
  if (snapshot.status === 'unavailable') {
    return (
      <div className={styles['card']}>
        <h3 className={styles['title']}>替我审批</h3>
        <p className={styles['warning']}>当前连接不提供可写的 Host 设置，自动审批保持不可配置。</p>
      </div>
    )
  }

  const enabled = settings.enabled !== false
  const selected = settings.modelMode === 'fixed' ? settings.reviewerRoute ?? '' : ''
  const selectedAvailable = selected === '' || options.some(option => option.value === selected)

  return (
    <section className={styles['card']} aria-busy={writing}>
      <div className={styles['heading']}>
        <div>
          <h3 className={styles['title']}>替我审批</h3>
          <p className={styles['subtitle']}>先在输入框权限菜单选择 Approve for me；其他三种官方模式不会被本插件接管。</p>
        </div>
        <label className={styles['switchLabel']}>
          <input
            type="checkbox"
            checked={enabled}
            disabled={!snapshot.writable || writing}
            onChange={event => { void write(() => scope.set('enabled', event.target.checked)) }}
          />
          <span>{enabled ? '模式内启用' : '已关闭'}</span>
        </label>
      </div>

      <label className={styles['field']}>
        <span className={styles['fieldLabel']}>审批模型</span>
        <select
          value={selected}
          disabled={!enabled || !snapshot.writable || writing || catalogState === 'loading'}
          onChange={(event) => {
            const value = event.target.value
            void write(async () => {
              if (value === '') {
                await scope.set('modelMode', 'follow-agent')
                return
              }
              // Store the complete route first; only then switch the active mode.
              await scope.set('reviewerRoute', value)
              await scope.set('modelMode', 'fixed')
            })
          }}
        >
          <option value="">跟随当前会话最近使用的模型（默认）</option>
          {!selectedAvailable && <option value={selected}>当前选择已离线</option>}
          {options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </label>

      <label className={styles['field']}>
        <span className={styles['fieldLabel']}>思考强度</span>
        <select
          value={settings.thinkingMode ?? 'lowest'}
          disabled={!enabled || !snapshot.writable || writing}
          onChange={event => {
            void write(() => scope.set('thinkingMode', event.target.value))
          }}
        >
          <option value="lowest">该模型支持的最低档（默认）</option>
          <option value="provider-default">服务商默认档</option>
        </select>
      </label>

      <div className={styles['statusRow']}>
        <span className={catalogState === 'error' ? styles['warning'] : styles['muted']}>
          {catalogState === 'loading' && '正在读取 DSH 模型目录…'}
          {catalogState === 'ready' && options.length === 0 && '当前没有已注册模型；需要审批时会回退给你。'}
          {catalogState === 'ready' && options.length > 0 && `可用 DSH 模型 ${String(options.length)} 个`}
          {catalogState === 'error' && `无法读取 DSH 模型目录：${catalogError}`}
        </span>
        <button type="button" className={styles['refresh']} onClick={refresh} disabled={catalogState === 'loading'}>
          刷新
        </button>
      </div>

      <label className={styles['field']}>
        <span className={styles['fieldLabel']}>相同操作复用</span>
        <select
          value={settings.repeatApprovalMode ?? 'same-request-exact'}
          disabled={!enabled || !snapshot.writable || writing}
          onChange={event => {
            void write(() => scope.set('repeatApprovalMode', event.target.value))
          }}
        >
          <option value="same-request-exact">同一用户任务内精确匹配（默认）</option>
          <option value="off">每次重新审批</option>
        </select>
      </label>

      <details className={styles['details']}>
        <summary>安全边界与高级参数</summary>
        <p>只处理注册工具的 pre-execute 与 approval 请求；斜杠命令、后台任务和插件私有 Host RPC 不在覆盖面内。</p>
        <p>保留 Workspace Write 沙箱；OAuth 与 API Key 模型都通过 DSH 的统一 LLM 目录调用，Full access 仍由官方模式负责。</p>
        <p>精确复用同时绑定工具名、完整参数、工作目录和最近一条用户请求；新用户消息、换会话或重启 Host 后自动失效。</p>
        <p>模型失败、重试耗尽、超时、输出不合规或上下文不足时不会放行，而是继续显示人工审批。</p>
        <div className={styles['advancedGrid']}>
          <label>
            超时（秒）
            <input
              type="number"
              min={1}
              max={120}
              value={Math.round((settings.timeoutMs ?? 30_000) / 1_000)}
              disabled={!snapshot.writable || writing}
              onChange={event => {
                const seconds = Number(event.target.value)
                if (Number.isFinite(seconds)) void write(() => scope.set('timeoutMs', Math.round(seconds * 1_000)))
              }}
            />
          </label>
          <label>
            传输失败重试次数
            <input
              type="number"
              min={0}
              max={2}
              value={settings.transportRetries ?? 1}
              disabled={!snapshot.writable || writing}
              onChange={event => {
                const retries = Number(event.target.value)
                if (Number.isFinite(retries)) void write(() => scope.set('transportRetries', Math.round(retries)))
              }}
            />
          </label>
          <label>
            最大输出 tokens
            <input
              type="number"
              min={128}
              max={4096}
              value={settings.maxOutputTokens ?? 256}
              disabled={!snapshot.writable || writing}
              onChange={event => {
                const tokens = Number(event.target.value)
                if (Number.isFinite(tokens)) void write(() => scope.set('maxOutputTokens', Math.round(tokens)))
              }}
            />
          </label>
        </div>
      </details>
    </section>
  )
}
