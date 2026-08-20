import { describe, expect, it } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import { CallId, type GenerateOptions, type StreamChunk } from '@deepseek-ai/dsh-llm'
import type { ToolExecution } from '@deepseek-ai/dsh-tools'
import {
  APPROVE_FOR_ME_PRESET,
  reviewerModeActive,
} from '../src/dsh-approve-for-me.ts'
import {
  APPROVE_FOR_ME_LABEL,
  APPROVE_FOR_ME_SHIELD_PATH,
  APPROVE_FOR_ME_SPARK_PATH,
  isPermissionPresetMenu,
} from '../src/client/permission-mode-icon.ts'
import { catastrophicReason, deterministicDecision } from '../src/policy.ts'
import {
  lowestReasoningEffort,
  ApprovalReviewer,
  parseReviewDecision,
  parseReviewerRoute,
  redactArguments,
} from '../src/reviewer.ts'

function execution(name: string, args: unknown, cwd = '/workspace'): ToolExecution {
  return {
    callId: CallId('test-call'),
    rootCallId: CallId('test-call'),
    name,
    arguments: args,
    signal: new AbortController().signal,
    token: Symbol('test') as ToolExecution['token'],
    agent: {
      session: { header: { cwd } },
    } as ToolExecution['agent'],
  }
}

describe('deterministic approval boundary', () => {
  it('allows ordinary reads inside the workspace', () => {
    expect(deterministicDecision(execution('read', { path: 'src/index.ts' }))?.decision).toBe('allow')
  })

  it('sends sensitive and outside reads to the model reviewer', () => {
    expect(deterministicDecision(execution('read', { path: '../.ssh/id_ed25519' }))).toBeUndefined()
    expect(deterministicDecision(execution('read', { path: '.env' }))).toBeUndefined()
  })

  it('denies catastrophic broad deletion but not exact temp cleanup', () => {
    expect(catastrophicReason(execution('bash', { command: 'rm -rf /' }))).toContain('根目录')
    expect(catastrophicReason(execution('bash', { command: 'rm -rf /private/tmp/test-case' }))).toBeUndefined()
  })

  it('allows the captured read-only find plus ls command without a model call', () => {
    const command = 'find "/Users/alice/.dsh/attachments/v1/objects" -type f -newermt "2026-08-20 17:39" -print -exec ls -la {} \\;'
    expect(deterministicDecision(execution('bash', { command }))?.decision).toBe('allow')
  })

  it.each([
    'find "/Users/alice/.dsh/attachments/v1/objects" -type f -delete',
    'find "/Users/alice/.dsh/attachments/v1/objects" -type f -exec rm -f {} \\;',
    'find "/Users/alice/.dsh/attachments/v1/objects" -type f -print > /tmp/files.txt',
    'find "$(cat /Users/alice/.ssh/id_ed25519)" -type f -print',
    'find "/Users/alice/.ssh" -type f -print',
    'find "/Users/alice/.dsh/attachments/v1/objects/../.." -type f -print',
    'wc --files0-from=/Users/alice/.ssh/file-list',
  ])('keeps a non-provably-read-only shell command behind the model gate: %s', (command) => {
    expect(deterministicDecision(execution('bash', { command }))).toBeUndefined()
  })
})

describe('permission mode icon contract', () => {
  it('uses the DSH permission shield grid with a distinct AI-review sparkle', () => {
    expect(APPROVE_FOR_ME_SHIELD_PATH).toContain('15.3')
    expect(APPROVE_FOR_ME_SPARK_PATH).toContain('6.405')
    expect(APPROVE_FOR_ME_SPARK_PATH).not.toBe(APPROVE_FOR_ME_SHIELD_PATH)
  })

  it('enhances only the complete DSH permission menu', () => {
    expect(isPermissionPresetMenu([
      'Read Only',
      'Workspace Write',
      APPROVE_FOR_ME_LABEL,
      'Full access',
    ])).toBe(true)
    expect(isPermissionPresetMenu([APPROVE_FOR_ME_LABEL])).toBe(false)
  })
})

describe('reviewer contracts', () => {
  it('participates only while the dedicated permission preset is selected', () => {
    const agent = execution('read', { file_path: 'README.md' }).agent!
    const context = (preset: string) => ({
      permissionPresets: { current: () => preset },
    }) as unknown as Context
    expect(reviewerModeActive(context(APPROVE_FOR_ME_PRESET), agent, { enabled: true })).toBe(true)
    expect(reviewerModeActive(context('workspace-write'), agent, { enabled: true })).toBe(false)
    expect(reviewerModeActive(context(APPROVE_FOR_ME_PRESET), agent, { enabled: false })).toBe(false)
  })

  it('frames the resolved resume target as untrusted execution evidence', () => {
    const base = execution('read', {
      file_path: '/Users/alice/work/project/outputs/site/index.html',
      limit: 80,
    }, '/Users/alice/work/DSH')
    const callId = CallId('foreign-session-call')
    const agent = {
      ...base.agent,
      session: {
        ...base.agent!.session,
        events: [
          {
            type: 'user/message',
            data: {
              content: [{ type: 'text', text: '/resume-codex 01a01e7e-9c42-7260-ab9b-41149f1e5533' }],
              source: { kind: 'user' },
            },
          },
          {
            type: 'tool/call',
            data: {
              callId,
              name: 'foreign_session_read',
              arguments: '{"provider":"codex","action":"show","reference":"01a01e7e-9c42-7260-ab9b-41149f1e5533"}',
            },
          },
          {
            type: 'tool/result',
            data: {
              message: {
                source: { kind: 'tool', callId },
                content: [{
                  type: 'tool-result',
                  toolCallId: callId,
                  content: [{
                    type: 'text',
                    text: '{"cwd":"/Users/alice/work/project","inert":true}',
                  }],
                }],
              },
            },
          },
        ],
      },
    } as ToolExecution['agent']
    const reviewer = new ApprovalReviewer({} as Context, () => ({}))
    const subject = reviewer.subject({ ...base, agent }, {
      kind: 'ask', reason: 'outside the DSH workspace',
    })
    expect(JSON.stringify(subject.recentExecutionEvidence)).toContain(
      '/Users/alice/work/project',
    )
  })

  it('parses one atomic fixed route', () => {
    expect(parseReviewerRoute(JSON.stringify(['pi-openai-codex', 'gpt-5.3-codex'])))
      .toEqual({ provider: 'pi-openai-codex', model: 'gpt-5.3-codex' })
    expect(parseReviewerRoute('{bad')).toBeUndefined()
  })

  it('accepts only the closed JSON decision vocabulary', () => {
    expect(parseReviewDecision('{"decision":"allow","reason":"in scope"}'))
      .toEqual({ decision: 'allow', reason: 'in scope' })
    expect(() => parseReviewDecision('{"decision":"maybe","reason":"x"}')).toThrow()
  })

  it('redacts credential-shaped fields recursively', () => {
    expect(redactArguments({ apiKey: 'secret', nested: { value: 'token=abc' } }))
      .toEqual({ apiKey: '[REDACTED]', nested: { value: 'token=[REDACTED]' } })
  })

  it('chooses the lowest recognized reasoning effort, independent of display order', () => {
    const effort = lowestReasoningEffort({
      provider: 'pi-openai-codex',
      id: 'model',
      name: 'model',
      reasoning: {
        efforts: [
          { id: 'high' as never, name: 'High' },
          { id: 'low' as never, name: 'Low' },
          { id: 'minimal' as never, name: 'Minimal' },
        ],
      },
    })
    expect(String(effort)).toBe('minimal')
  })

  it('assembles a real reviewer stream and sends the lowest effort', async () => {
    const calls: GenerateOptions[] = []
    const chunks: StreamChunk[] = [
      { type: 'text-delta', index: 0, text: '{"decision":"allow","reason":"authorized"}' },
      { type: 'finish', reason: { kind: 'stop' } },
    ]
    const ctx = {
      llm: {
        listProviders: () => [{ id: 'pi-test', name: 'Test' }],
        listModels: async () => [{ provider: 'pi-test', id: 'model', name: 'Model' }],
        resolveModelInfo: async () => ({
          provider: 'pi-test', id: 'model', name: 'Model',
          reasoning: { efforts: [
            { id: 'high' as never, name: 'High' },
            { id: 'minimal' as never, name: 'Minimal' },
          ] },
        }),
        stream: (options: GenerateOptions) => {
          calls.push(options)
          return (async function* (): AsyncGenerator<StreamChunk> { yield* chunks })()
        },
      },
      logger: { info: () => {} },
    } as unknown as Context
    const reviewer = new ApprovalReviewer(ctx, () => ({
      modelMode: 'fixed',
      reviewerRoute: JSON.stringify(['pi-test', 'model']),
      thinkingMode: 'lowest',
      timeoutMs: 1_000,
    }))
    await expect(reviewer.review({
      stage: 'pre-execute',
      toolName: 'write',
      arguments: { path: 'README.md' },
      recentUserRequests: ['update the README'],
      recentExecutionEvidence: [],
      downstream: { kind: 'allow' },
    })).resolves.toEqual({ decision: 'allow', reason: 'authorized' })
    expect(String(calls[0]?.reasoningEffort)).toBe('minimal')
    expect(calls[0]?.maxTokens).toBe(256)
  })

  it('falls back to a human on provider failure', async () => {
    const ctx = {
      llm: {
        listProviders: () => [{ id: 'pi-test', name: 'Test' }],
        resolveModelInfo: async () => ({ provider: 'pi-test', id: 'model', name: 'Model' }),
        stream: () => (async function* (): AsyncGenerator<StreamChunk> {
          yield { type: 'finish', reason: { kind: 'error', failure: { message: 'auth failed', code: 'AUTH' } } }
        })(),
      },
      logger: { info: () => {} },
    } as unknown as Context
    const reviewer = new ApprovalReviewer(ctx, () => ({
      modelMode: 'fixed', reviewerRoute: JSON.stringify(['pi-test', 'model']), timeoutMs: 1_000,
    }))
    const decision = await reviewer.review({
      stage: 'pre-execute',
      toolName: 'bash',
      arguments: { command: 'echo hi' },
      recentUserRequests: ['say hi'],
      recentExecutionEvidence: [],
      downstream: { kind: 'allow' },
    })
    expect(decision.decision).toBe('ask')
    expect(decision.reason).toContain('auth failed')
  })

  it('retries one transient OAuth stream that ends before its terminal event', async () => {
    let attempts = 0
    const ctx = {
      llm: {
        listProviders: () => [{ id: 'pi-test', name: 'Test' }],
        resolveModelInfo: async () => ({ provider: 'pi-test', id: 'model', name: 'Model' }),
        stream: () => {
          attempts += 1
          if (attempts === 1) {
            return (async function* (): AsyncGenerator<StreamChunk> {
              yield {
                type: 'finish',
                reason: {
                  kind: 'error',
                  failure: {
                    message: 'OpenAI Responses stream ended before a terminal response event',
                    code: 'TRANSPORT',
                  },
                },
              }
            })()
          }
          return (async function* (): AsyncGenerator<StreamChunk> {
            yield { type: 'text-delta', index: 0, text: '{"decision":"allow","reason":"bounded read"}' }
            yield { type: 'finish', reason: { kind: 'stop' } }
          })()
        },
      },
      logger: { info: () => {} },
    } as unknown as Context
    const reviewer = new ApprovalReviewer(ctx, () => ({
      modelMode: 'fixed', reviewerRoute: JSON.stringify(['pi-test', 'model']), timeoutMs: 1_000,
    }))
    const decision = await reviewer.review({
      stage: 'pre-execute',
      toolName: 'read',
      arguments: {
        file_path: '/Users/alice/work/project/outputs/site/index.html',
        limit: 80,
      },
      recentUserRequests: ['/resume-codex 01a01e7e-9c42-7260-ab9b-41149f1e5533'],
      recentExecutionEvidence: [],
      downstream: { kind: 'allow' },
    })
    expect(decision).toEqual({ decision: 'allow', reason: 'bounded read' })
    expect(attempts).toBe(2)
  })

  it('gives a transport retry its own complete deadline', async () => {
    let attempts = 0
    const wait = (milliseconds: number) => new Promise(resolve => setTimeout(resolve, milliseconds))
    const ctx = {
      llm: {
        listProviders: () => [{ id: 'pi-test', name: 'Test Reviewer' }],
        resolveModelInfo: async () => ({ provider: 'pi-test', id: 'model', name: 'Model' }),
        stream: (options: GenerateOptions) => {
          attempts += 1
          if (attempts === 1) {
            return (async function* (): AsyncGenerator<StreamChunk> {
              await wait(30)
              yield {
                type: 'finish',
                reason: {
                  kind: 'error',
                  failure: { message: 'wire closed early', code: 'TRANSPORT' },
                },
              }
            })()
          }
          return (async function* (): AsyncGenerator<StreamChunk> {
            await wait(25)
            if (options.signal?.aborted === true) {
              yield {
                type: 'finish',
                reason: {
                  kind: 'error',
                  failure: {
                    message: 'OpenAI Responses stream ended before a terminal response event',
                    code: 'TRANSPORT',
                  },
                },
              }
              return
            }
            yield { type: 'text-delta', index: 0, text: '{"decision":"allow","reason":"bounded read"}' }
            yield { type: 'finish', reason: { kind: 'stop' } }
          })()
        },
      },
      logger: { info: () => {} },
    } as unknown as Context
    const reviewer = new ApprovalReviewer(ctx, () => ({
      modelMode: 'fixed',
      reviewerRoute: JSON.stringify(['pi-test', 'model']),
      timeoutMs: 40,
      transportRetries: 1,
    }))
    const decision = await reviewer.review({
      stage: 'pre-execute',
      toolName: 'read',
      arguments: { file_path: '/workspace/README.md' },
      recentUserRequests: ['read the README'],
      recentExecutionEvidence: [],
      downstream: { kind: 'allow' },
    })
    expect(decision).toEqual({ decision: 'allow', reason: 'bounded read' })
    expect(attempts).toBe(2)
  })

  it('attributes a local reviewer deadline to the selected model instead of the wire protocol', async () => {
    const ctx = {
      llm: {
        listProviders: () => [{ id: 'pi-test', name: 'Test Reviewer' }],
        resolveModelInfo: async () => ({ provider: 'pi-test', id: 'model', name: 'Model' }),
        stream: (options: GenerateOptions) => (async function* (): AsyncGenerator<StreamChunk> {
          await new Promise<void>((resolve) => {
            if (options.signal?.aborted === true) resolve()
            else options.signal?.addEventListener('abort', () => resolve(), { once: true })
          })
          yield {
            type: 'finish',
            reason: {
              kind: 'error',
              failure: {
                message: 'OpenAI Responses stream ended before a terminal response event',
                code: 'TRANSPORT',
              },
            },
          }
        })(),
      },
      logger: { info: () => {} },
    } as unknown as Context
    const reviewer = new ApprovalReviewer(ctx, () => ({
      modelMode: 'fixed',
      reviewerRoute: JSON.stringify(['pi-test', 'model']),
      timeoutMs: 20,
      transportRetries: 1,
    }))
    const decision = await reviewer.review({
      stage: 'pre-execute',
      toolName: 'bash',
      arguments: { command: 'echo hi' },
      recentUserRequests: ['say hi'],
      recentExecutionEvidence: [],
      downstream: { kind: 'allow' },
    })
    expect(decision.decision).toBe('ask')
    expect(decision.reason).toContain('Test Reviewer · model')
    expect(decision.reason).toContain('20 毫秒')
    expect(decision.reason).not.toContain('OpenAI Responses')
  })
})
