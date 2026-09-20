import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import type { StreamChunk } from '@deepseek-ai/dsh-llm'
import { ApprovalReviewer, type ReviewSubject } from '../src/reviewer.ts'

const subject: ReviewSubject = {
  stage: 'pre-execute', toolName: 'write', arguments: { file_path: '/outside/plan.md' },
  recentUserRequests: ['save this exact plan'], trustedDeveloperInstructions: [], trustedUserResponses: [],
  recentAssistantMessages: [], recentExecutionEvidence: [], downstream: { kind: 'ask' },
}
function context(llm: Record<string, unknown>): Context {
  return { llm: { listProviders: () => [{ id: 'test', name: 'Test' }], ...llm }, logger: { info: vi.fn() } } as unknown as Context
}
function reviewer(ctx: Context) { return new ApprovalReviewer(ctx, () => ({ modelMode: 'fixed', reviewerRoute: '["test","model"]', timeoutMs: 25, transportRetries: 2 })) }
afterEach(() => vi.useRealTimers())

describe('total review deadline contains uncooperative providers', () => {
  it('includes a stalled model/route lookup before any stream begins', async () => {
    vi.useFakeTimers()
    const stream = vi.fn()
    const worker = reviewer(context({ resolveModelInfo: () => new Promise(() => {}), stream }))
    const answer = worker.review(subject)
    await vi.advanceTimersByTimeAsync(25)
    await expect(answer).resolves.toMatchObject({ source: 'failure', failureKind: 'timeout', decision: 'deny' })
    expect(stream).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('returns timeout even when the stream ignores AbortSignal and never yields', async () => {
    vi.useFakeTimers()
    const stream = vi.fn(() => (async function* (): AsyncGenerator<StreamChunk> { await new Promise(() => {}); yield { type: 'finish', reason: { kind: 'stop' } } })())
    const worker = reviewer(context({ resolveModelInfo: async () => ({ id: 'model', provider: 'test', name: 'Model' }), stream }))
    const answer = worker.review(subject)
    await vi.advanceTimersByTimeAsync(25)
    await expect(answer).resolves.toMatchObject({ source: 'failure', failureKind: 'timeout', model: 'test/model' })
    expect(stream).toHaveBeenCalledOnce()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('discards a valid model allowance arriving after the deadline', async () => {
    vi.useFakeTimers()
    let release!: () => void
    const delayed = new Promise<void>(resolve => { release = resolve })
    const worker = reviewer(context({
      resolveModelInfo: async () => ({ id: 'model', provider: 'test', name: 'Model' }),
      stream: () => (async function* (): AsyncGenerator<StreamChunk> {
        await delayed
        yield { type: 'text-delta', index: 0, text: '{"outcome":"allow"}' }
        yield { type: 'finish', reason: { kind: 'stop' } }
      })(),
    }))
    const answer = worker.review(subject)
    await vi.advanceTimersByTimeAsync(25)
    expect(await answer).toMatchObject({ source: 'failure', failureKind: 'timeout' })
    release()
    await vi.advanceTimersByTimeAsync(1)
    expect(await answer).toMatchObject({ source: 'failure', decision: 'deny' })
  })

  it('parent cancellation during route lookup remains cancellation, not a human-review failure', async () => {
    const controller = new AbortController()
    const worker = reviewer(context({ resolveModelInfo: () => new Promise(() => {}) }))
    const answer = worker.review(subject, controller.signal)
    const assertion = expect(answer).rejects.toThrow('user cancelled')
    controller.abort(new Error('user cancelled'))
    await assertion
  })
})
