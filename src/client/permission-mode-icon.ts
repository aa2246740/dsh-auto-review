import styles from './styles.module.css'

export const APPROVE_FOR_ME_LABEL = 'Approve for me'

// Match DSH's shipped 16px permission glyph grid. The shield keeps the
// permission/safety meaning; the four-point star distinguishes an AI reviewer
// from Read Only's check, Workspace Write's pencil, and Full access's warning.
export const APPROVE_FOR_ME_SHIELD_PATH = 'M8.20554 0.899994L14.7901 3.36857V7.01026C14.7901 12 11.0466 14.2103 8.20554 15.3C5.36446 14.2103 1.62012 12 1.62012 7.01026V3.36857L8.20554 0.899994Z'
export const APPROVE_FOR_ME_SPARK_PATH = 'M8.205 3.86C8.397 5.283 9.327 6.213 10.75 6.405C9.327 6.597 8.397 7.527 8.205 8.95C8.013 7.527 7.083 6.597 5.66 6.405C7.083 6.213 8.013 5.283 8.205 3.86Z'

const ICON_ATTRIBUTE = 'data-dsh-approve-for-me-icon'
const TRIGGER_ATTRIBUTE = 'data-dsh-approve-for-me-trigger'
const LABEL_ATTRIBUTE = 'data-dsh-approve-for-me-label'
const SVG_NS = 'http://www.w3.org/2000/svg'
const REQUIRED_PERMISSION_ROWS = ['Read Only', 'Workspace Write', 'Full access'] as const

function exactText(element: Element): string {
  return element.textContent?.trim() ?? ''
}

/** Fail closed: only enhance a menu that also contains DSH's three official permission rows. */
export function isPermissionPresetMenu(labels: readonly string[]): boolean {
  return labels.includes(APPROVE_FOR_ME_LABEL)
    && REQUIRED_PERMISSION_ROWS.every(label => labels.includes(label))
}

function createSvg(): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg')
  svg.setAttribute('width', '16')
  svg.setAttribute('height', '16')
  svg.setAttribute('viewBox', '0 0 16 16')
  svg.setAttribute('fill', 'none')
  svg.setAttribute('aria-hidden', 'true')

  const shield = document.createElementNS(SVG_NS, 'path')
  shield.setAttribute('d', APPROVE_FOR_ME_SHIELD_PATH)
  shield.setAttribute('stroke', 'currentColor')
  shield.setAttribute('stroke-width', '1.31831')
  shield.setAttribute('stroke-linejoin', 'round')

  const spark = document.createElementNS(SVG_NS, 'path')
  spark.setAttribute('d', APPROVE_FOR_ME_SPARK_PATH)
  spark.setAttribute('fill', 'currentColor')

  svg.append(shield, spark)
  return svg
}

function createIcon(kind: 'menu' | 'trigger'): HTMLSpanElement {
  const icon = document.createElement('span')
  icon.setAttribute(ICON_ATTRIBUTE, kind)
  icon.classList.add(styles['permissionModeIcon']!)
  icon.classList.add(kind === 'menu'
    ? styles['permissionModeIconMenu']!
    : styles['permissionModeIconTrigger']!)
  icon.append(createSvg())
  return icon
}

function directLabel(button: HTMLButtonElement): HTMLElement | undefined {
  return Array.from(button.children).find((child): child is HTMLElement =>
    child instanceof HTMLElement && exactText(child) === APPROVE_FOR_ME_LABEL)
}

function enhanceMenuRows(root: ParentNode): void {
  for (const menu of root.querySelectorAll<HTMLElement>('[role="menu"]')) {
    const rows = Array.from(menu.querySelectorAll<HTMLButtonElement>('button[role="menuitem"]'))
    if (!isPermissionPresetMenu(rows.map(exactText))) continue
    const button = rows.find(row => exactText(row) === APPROVE_FOR_ME_LABEL)
    if (button === undefined || button.querySelector(`[${ICON_ATTRIBUTE}]`) !== null) continue
    const label = directLabel(button)
    if (label !== undefined) button.insertBefore(createIcon('menu'), label)
  }
}

function enhanceCurrentTrigger(root: ParentNode): void {
  for (const button of root.querySelectorAll<HTMLButtonElement>('button[aria-label]')) {
    if (!button.getAttribute('aria-label')?.includes(APPROVE_FOR_ME_LABEL)) continue
    if (button.querySelector(`[${ICON_ATTRIBUTE}]`) !== null) continue
    const label = directLabel(button)
    if (label === undefined) continue
    button.setAttribute(TRIGGER_ATTRIBUTE, '')
    label.setAttribute(LABEL_ATTRIBUTE, '')
    button.insertBefore(createIcon('trigger'), label)
  }
}

function enhance(root: ParentNode): void {
  enhanceMenuRows(root)
  enhanceCurrentTrigger(root)
}

function touchesPermissionSurface(node: Node): boolean {
  const element = node instanceof Element ? node : node.parentElement
  if (element === null) return false
  if (element.matches('[role="menu"], button[aria-label]')) return true
  if (element.closest('[role="menu"], button[aria-label]') !== null) return true
  return element.querySelector('[role="menu"], button[aria-label]') !== null
}

function relevantMutation(records: readonly MutationRecord[]): boolean {
  return records.some(record => touchesPermissionSurface(record.target)
    || Array.from(record.addedNodes).some(touchesPermissionSurface))
}

/**
 * Add the plugin-owned glyph without patching DSH core. The permission popup
 * is mounted only while open, so a bounded observer reapplies the decoration
 * after React creates or replaces that row. HMR disposal removes every node
 * and attribute owned by this enhancer.
 */
export function installApproveForMeIcon(root: Document = document): () => void {
  enhance(root)
  let queued = false
  const observer = new MutationObserver((records) => {
    if (queued || !relevantMutation(records)) return
    queued = true
    queueMicrotask(() => {
      queued = false
      enhance(root)
    })
  })
  observer.observe(root.documentElement, { childList: true, subtree: true })

  return () => {
    observer.disconnect()
    for (const icon of root.querySelectorAll(`[${ICON_ATTRIBUTE}]`)) icon.remove()
    for (const trigger of root.querySelectorAll(`[${TRIGGER_ATTRIBUTE}]`)) {
      trigger.removeAttribute(TRIGGER_ATTRIBUTE)
    }
    for (const label of root.querySelectorAll(`[${LABEL_ATTRIBUTE}]`)) {
      label.removeAttribute(LABEL_ATTRIBUTE)
    }
  }
}
