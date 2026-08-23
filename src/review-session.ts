/** Bounded reviewer conversation reuse with ephemeral forks under concurrency. */

import type { Agent } from '@deepseek-ai/dsh-agent'
import {
  createAssistantMessage,
  createUserMessage,
  type Message,
} from '@deepseek-ai/dsh-llm'

export interface ReviewSessionRoute {
  readonly provider: string
  readonly model: string
}

export interface ReviewSessionLease {
  readonly priorMessages: readonly Message[]
  readonly ephemeral: boolean
  commit(input: string, output: string): void
  release(): void
}

export interface ReviewSessionLimits {
  readonly maxPairs: number
  readonly maxChars: number
}

const REVIEW_POLICY_VERSION = 'codex-guardian-v149-2026-08-20'
export const DEFAULT_REVIEW_HISTORY_PAIRS = 4
export const DEFAULT_REVIEW_HISTORY_CHARS = 20_000

function messageChars(message: Message): number {
  return JSON.stringify(message.content).length
}

function ephemeralLease(): ReviewSessionLease {
  return {
    priorMessages: [],
    ephemeral: true,
    commit: () => {},
    release: () => {},
  }
}

class ReviewConversation {
  private busy = false
  private authorizationVersion: string | undefined
  private readonly messages: Message[] = []

  acquire(
    route: ReviewSessionRoute,
    authorizationVersion: string,
    limits: ReviewSessionLimits,
  ): ReviewSessionLease {
    if (this.busy) return ephemeralLease()
    if (this.authorizationVersion !== authorizationVersion) {
      this.messages.length = 0
      this.authorizationVersion = authorizationVersion
    }
    this.trim(limits)
    this.busy = true
    let released = false
    let committed = false
    return {
      priorMessages: [...this.messages],
      ephemeral: false,
      commit: (input, output) => {
        if (released || committed) return
        committed = true
        this.messages.push(
          createUserMessage({
            content: [{ type: 'text', text: input }],
            source: { kind: 'plugin', plugin: 'dsh-approve-for-me' },
          }),
          createAssistantMessage({
            content: [{ type: 'text', text: output }],
            source: { provider: route.provider, model: route.model },
          }),
        )
        this.trim(limits)
      },
      release: () => {
        if (released) return
        released = true
        this.busy = false
      },
    }
  }

  private trim(limits: ReviewSessionLimits): void {
    while (this.messages.length > limits.maxPairs * 2) this.messages.splice(0, 2)
    let chars = this.messages.reduce((sum, message) => sum + messageChars(message), 0)
    while (chars > limits.maxChars && this.messages.length >= 2) {
      const removed = this.messages.splice(0, 2)
      chars -= removed.reduce((sum, message) => sum + messageChars(message), 0)
    }
  }
}

/**
 * Reuses one bounded reviewer conversation per parent agent, route, policy
 * version, and trusted-authorization version. A concurrent review receives an
 * ephemeral empty-history lease rather than sharing mutable conversation state.
 */
export class ReviewSessionManager {
  private readonly sessions = new WeakMap<Agent, Map<string, ReviewConversation>>()

  acquire(
    agent: Agent | undefined,
    route: ReviewSessionRoute,
    authorizationVersion: string,
    limits: ReviewSessionLimits,
  ): ReviewSessionLease {
    if (agent === undefined) return ephemeralLease()
    let routes = this.sessions.get(agent)
    if (routes === undefined) {
      routes = new Map()
      this.sessions.set(agent, routes)
    }
    const key = `${route.provider}\u0000${route.model}\u0000${REVIEW_POLICY_VERSION}`
    let conversation = routes.get(key)
    if (conversation === undefined) {
      conversation = new ReviewConversation()
      routes.set(key, conversation)
    }
    return conversation.acquire(route, authorizationVersion, limits)
  }
}
