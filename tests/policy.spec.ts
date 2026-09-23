import { describe, expect, it } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import { type GenerateOptions, type StreamChunk } from '@deepseek-ai/dsh-llm'
import { ToolCallId } from '@deepseek-ai/dsh-llm/brand'
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
import { AutoReviewCoordinator } from '../src/coordinator.ts'
import { ReviewSessionManager } from '../src/review-session.ts'
import {
  preferredLowReasoningEffort,
  ApprovalReviewer,
  parseReviewDecision,
  parseReviewerRoute,
  redactArguments,
  type ReviewDecision,
  type ReviewSubject,
} from '../src/reviewer.ts'

function execution(name: string, args: unknown, cwd = '/workspace'): ToolExecution {
  return {
    callId: ToolCallId('test-call'),
    rootCallId: ToolCallId('test-call'),
    name,
    arguments: args,
    signal: new AbortController().signal,
    token: Symbol('test') as ToolExecution['token'],
    agent: {
      session: { header: { cwd }, snapshotEvents: () => [], requestHeader: () => undefined },
    } as ToolExecution['agent'],
  }
}

const CAPTURED_PROMPTED_OBSERVATIONS = [
  {
    label: 'lists the active Creator Mode+ preset',
    name: 'bash',
    arguments: {
      command: 'ls /Users/alice/.dsh/.agent-presets/creator-plus/ 2>&1; echo "---"; ls /Users/alice/.dsh/.agent-presets/creator-plus/skills/creator-mode-plus/ 2>&1',
    },
  },
  {
    label: 'reads the active agent preset',
    name: 'read',
    arguments: { file_path: '/Users/alice/.dsh/.agent-presets/creator-plus/agent.cordis.yml' },
  },
  {
    label: 'reads the active preset metadata',
    name: 'read',
    arguments: { file_path: '/Users/alice/.dsh/.agent-presets/creator-plus/preset.yml' },
  },
  {
    label: 'finds Harness client declarations',
    name: 'bash',
    arguments: {
      command: 'find /Users/alice/Documents/Codex/deepseek-harness-rc8 -name "*.d.ts" -path "*dsh-client-ui-conversation*" 2>&1 | head -10',
    },
  },
  {
    label: 'lists external plugins in the Harness checkout',
    name: 'bash',
    arguments: {
      command: 'ls /Users/alice/Documents/Codex/deepseek-harness-rc8/my-plugins/ 2>&1',
    },
  },
  {
    label: 'reads a dependency declaration',
    name: 'read',
    arguments: {
      file_path: '/Users/alice/Documents/Codex/deepseek-harness-rc8/my-plugins/dsh-glance-hub/node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/types/client/contract/slots.d.ts',
    },
  },
  {
    label: 'searches dependency declarations',
    name: 'grep',
    arguments: {
      pattern: 'thinking|running|busy|pending|streaming',
      path: '/Users/alice/Documents/Codex/deepseek-harness-rc8/my-plugins/dsh-glance-hub/node_modules/@deepseek-ai/dsh-client-runtime',
      include: '*.d.ts',
    },
  },
  {
    label: 'finds slot package directories',
    name: 'bash',
    arguments: {
      command: 'find /Users/alice/Documents/Codex/deepseek-harness-rc8/my-plugins/dsh-glance-hub/node_modules -maxdepth 3 -type d -name "dsh-client-ui-slots*" 2>&1 | head -3',
    },
  },
  {
    label: 'finds slot declarations',
    name: 'bash',
    arguments: {
      command: 'find /Users/alice/Documents/Codex/deepseek-harness-rc8/my-plugins -name "PropsRuntime*" -o -name "*slots.d.ts" 2>&1 | head -10',
    },
  },
  {
    label: 'searches Harness slot declarations',
    name: 'grep',
    arguments: {
      pattern: 'interface.*PropsRuntime|export type PropsRuntime|interface SlotMap',
      path: '/Users/alice/Documents/Codex/deepseek-harness-rc8/packages/extensions/ui-cordis/lib/types/client',
      include: 'slots.d.ts',
    },
  },
] as const

describe('deterministic approval boundary', () => {
  it('allows ordinary reads inside the workspace', () => {
    expect(deterministicDecision(execution('read', { path: 'src/index.ts' }))?.decision).toBe('allow')
  })

  it('keeps sensitive reads behind the model reviewer', () => {
    expect(deterministicDecision(execution('read', { path: '../.ssh/id_ed25519' }))).toBeUndefined()
    expect(deterministicDecision(execution('read', { path: '.env' }))).toBeUndefined()
    expect(deterministicDecision(execution('read', { path: '.env.local' }))).toBeUndefined()
    expect(deterministicDecision(execution('read', { path: '/workspace/.env.production' }))).toBeUndefined()
    expect(deterministicDecision(execution('read', { path: '/Users/alice/.codex/auth.json' }))).toBeUndefined()
    expect(deterministicDecision(execution('read', { path: 'auth.json' }, '/Users/alice/.codex'))).toBeUndefined()
    expect(deterministicDecision(execution('bash', {
      command: 'head auth.json',
      workdir: '/Users/alice/.codex',
    }))).toBeUndefined()
    expect(deterministicDecision(execution('read', { path: 'src/environment.ts' }))?.decision).toBe('allow')
  })

  it.each(CAPTURED_PROMPTED_OBSERVATIONS)(
    'fast-allows the captured read-only action: $label',
    ({ name, arguments: args }) => {
      expect(deterministicDecision(execution(name, args, '/Users/alice/Documents/DSH'))?.decision)
        .toBe('allow')
    },
  )

  it('denies catastrophic broad deletion but not exact temp cleanup', () => {
    expect(catastrophicReason(execution('bash', { command: 'rm -rf /' }))).toContain('根目录')
    expect(catastrophicReason(execution('bash', { command: 'rm -rf /private/tmp/test-case' }))).toBeUndefined()
  })

  it('allows the captured read-only find plus ls command without a model call', () => {
    const command = 'find "/Users/alice/.dsh/attachments/v1/objects" -type f -newermt "2026-08-20 17:39" -print -exec ls -la {} \\;'
    expect(deterministicDecision(execution('bash', { command }))?.decision).toBe('allow')
  })

  it('fast-allows the fixed DSHX status tool and read-only knowledge commands', () => {
    expect(deterministicDecision(execution('dshx_status', {}))?.decision).toBe('allow')
    expect(deterministicDecision(execution('bash', {
      command: 'dshx kb cat contracts/client-build 2>&1 | head -300',
    }))?.decision).toBe('allow')
    expect(deterministicDecision(execution('bash', {
      command: 'dshx activate-new-client unsafe-plugin',
    }))).toBeUndefined()
  })

  it.each([
    'find "/Users/alice/.dsh/attachments/v1/objects" -type f -delete',
    'find "/Users/alice/.dsh/attachments/v1/objects" -type f -exec rm -f {} \\;',
    'find "/Users/alice/.dsh/attachments/v1/objects" -type f -print > /tmp/files.txt',
    'find "$(cat /Users/alice/.ssh/id_ed25519)" -type f -print',
    'find "/Users/alice/.ssh" -type f -print',
    'find "/Users/alice/.dsh/attachments/v1/objects/../.." -type f -print',
    'wc --files0-from=/Users/alice/.ssh/file-list',
    'find /Users/alice/Documents/DSH -type f | sh',
    'ls /Users/alice/Documents/DSH; rm -rf /Users/alice/Documents/DSH',
    'echo changed > /Users/alice/Documents/DSH/result.txt',
  ])('keeps a non-provably-read-only shell command behind the model gate: %s', (command) => {
    expect(deterministicDecision(execution('bash', { command }))).toBeUndefined()
  })
})

describe('auto-review coordinator', () => {
  const allowDecision = {
    source: 'model',
    decision: 'allow',
    riskLevel: 'low',
    userAuthorization: 'unknown',
    reason: 'bounded action',
  } satisfies ReviewDecision
  const denyDecision = {
    source: 'model',
    decision: 'deny',
    riskLevel: 'high',
    userAuthorization: 'low',
    reason: 'risky side effect lacks authorization',
  } satisfies ReviewDecision

  function agentHarness(): {
    agent: NonNullable<ToolExecution['agent']>
    injections: string[]
    cancellations: string[]
  } {
    const base = execution('write', { path: 'README.md', content: 'hello' }, '/workspace/project')
    const injections: string[] = []
    const cancellations: string[] = []
    const agent = {
      ...base.agent!,
      session: {
        ...base.agent!.session,
        snapshotEvents: () => [{
          type: 'user/message',
          data: { source: { kind: 'user' }, content: [{ type: 'text', text: 'update the local file' }] },
        }],
      },
      inject: () => { injections.push('injected') },
      cancel: (cause: { reason?: string }) => { cancellations.push(cause.reason ?? '') },
    } as NonNullable<ToolExecution['agent']>
    return { agent, injections, cancellations }
  }

  function coordinatorHarness(decisions: ReviewDecision[]): {
    coordinator: AutoReviewCoordinator
    reviewed: ReviewSubject[]
  } {
    const reviewed: ReviewSubject[] = []
    const reviewer = {
      subject(exec: ToolExecution, downstream: ReviewSubject['downstream']): ReviewSubject {
        return {
          stage: 'pre-execute',
          toolName: exec.name,
          arguments: exec.arguments,
          ...exec.agent === undefined ? {} : { agent: exec.agent },
          recentUserRequests: [],
          trustedDeveloperInstructions: [],
          trustedUserResponses: [],
          recentAssistantMessages: [],
          recentExecutionEvidence: [],
          downstream,
        }
      },
      async review(subject: ReviewSubject): Promise<ReviewDecision> {
        reviewed.push(subject)
        const decision = decisions.shift()
        if (decision === undefined) throw new Error('unexpected reviewer call')
        return decision
      },
      log: () => {},
    } satisfies Pick<ApprovalReviewer, 'subject' | 'review' | 'log'>
    return {
      coordinator: new AutoReviewCoordinator(reviewer, () => true),
      reviewed,
    }
  }

  it('reviews only calls that DSH would otherwise ask to approve', async () => {
    const { agent } = agentHarness()
    const { coordinator, reviewed } = coordinatorHarness([allowDecision])
    const exec = { ...execution('write', { path: 'README.md', content: 'hello' }), agent }

    await expect(coordinator.preExecute(exec, { kind: 'allow' })).resolves.toEqual({ kind: 'allow' })
    expect(reviewed).toHaveLength(0)
    await expect(coordinator.preExecute(exec, { kind: 'ask', reason: 'needs approval' }))
      .resolves.toEqual({ kind: 'allow' })
    expect(reviewed).toHaveLength(1)
  })

  it('owns late approval requests and does not fall through to the human answerer', async () => {
    const { agent, injections } = agentHarness()
    const { coordinator, reviewed } = coordinatorHarness([allowDecision, denyDecision])
    const exec = { ...execution('write', { path: '/outside/file', content: 'hello' }), agent }
    await expect(coordinator.preExecute(exec, { kind: 'ask', reason: 'policy approval' }))
      .resolves.toEqual({ kind: 'allow' })
    let delegated = 0

    await expect(coordinator.approvalRequest({
      agent,
      toolName: exec.name,
      callId: exec.callId,
      reason: 'escalate sandbox to danger-full-access',
    }, () => {
      delegated += 1
      return Promise.resolve('allowed-once')
    })).resolves.toBe('rejected')

    expect(delegated).toBe(0)
    expect(reviewed.map(subject => subject.stage)).toEqual(['pre-execute', 'approval-request'])
    expect(reviewed[1]?.approvalReason).toContain('danger-full-access')
    expect(injections).toHaveLength(1)
  })

  it('forces model review for an escalation even when the original action is deterministically safe', async () => {
    const { agent } = agentHarness()
    const { coordinator, reviewed } = coordinatorHarness([denyDecision])
    const exec = {
      ...execution('read', { file_path: '/workspace/project/README.md', limit: 80 }, '/workspace/project'),
      agent,
    }

    await expect(coordinator.preExecute(exec, { kind: 'ask', reason: 'outside default policy' }))
      .resolves.toEqual({ kind: 'allow' })
    expect(reviewed).toHaveLength(0)

    await expect(coordinator.approvalRequest({
      agent,
      toolName: exec.name,
      callId: exec.callId,
      reason: 'retry with danger-full-access',
    }, () => Promise.resolve('allowed-once'))).resolves.toBe('rejected')
    expect(reviewed).toHaveLength(1)
    expect(reviewed[0]?.approvalReason).toContain('danger-full-access')
  })

  it('returns cancellation when a live approval review is aborted', async () => {
    const { agent } = agentHarness()
    const reviewer = {
      subject(exec: ToolExecution, downstream: ReviewSubject['downstream']): ReviewSubject {
        return {
          stage: 'pre-execute',
          toolName: exec.name,
          arguments: exec.arguments,
          ...exec.agent === undefined ? {} : { agent: exec.agent },
          recentUserRequests: [],
          trustedDeveloperInstructions: [],
          trustedUserResponses: [],
          recentAssistantMessages: [],
          recentExecutionEvidence: [],
          downstream,
        }
      },
      review: (_subject: ReviewSubject, signal?: AbortSignal): Promise<ReviewDecision> => new Promise((_, reject) => {
        signal?.addEventListener('abort', () => reject(new Error('cancelled')), { once: true })
      }),
      log: () => {},
    } satisfies Pick<ApprovalReviewer, 'subject' | 'review' | 'log'>
    const coordinator = new AutoReviewCoordinator(reviewer, () => true)
    const exec = { ...execution('write', { path: '/outside/file', content: 'hello' }), agent }
    await coordinator.preExecute(exec, { kind: 'allow' })
    const controller = new AbortController()
    const outcome = coordinator.approvalRequest({
      agent,
      toolName: exec.name,
      callId: exec.callId,
      signal: controller.signal,
    }, () => Promise.resolve('allowed-once'))
    controller.abort()
    await expect(outcome).resolves.toBe('cancelled')
  })

  it('delegates missing-context requests to the original human answerer without model approval', async () => {
    const { agent, injections } = agentHarness()
    const { coordinator, reviewed } = coordinatorHarness([])
    let delegated = 0

    await expect(coordinator.approvalRequest({
      agent,
      toolName: 'background-operation',
      reason: 'needs approval',
    }, () => {
      delegated += 1
      return Promise.resolve('allowed-once')
    })).resolves.toBe('allowed-once')

    expect(delegated).toBe(1)
    expect(reviewed).toHaveLength(0)
    expect(injections).toHaveLength(0)
  })

  it('stops the turn after three consecutive explicit reviewer denials', async () => {
    const { agent, cancellations } = agentHarness()
    const { coordinator } = coordinatorHarness([denyDecision, denyDecision, denyDecision])
    for (let index = 0; index < 3; index += 1) {
      const callId = ToolCallId(`deny-${String(index)}`)
      const exec = {
        ...execution('write', { path: `file-${String(index)}.txt`, content: 'x' }),
        callId,
        rootCallId: callId,
        agent,
      }
      await expect(coordinator.preExecute(exec, { kind: 'ask', reason: 'needs approval' }))
        .resolves.toMatchObject({ kind: 'deny' })
    }
    expect(cancellations).toHaveLength(1)
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
    expect(isPermissionPresetMenu([
      '仅可查看',
      '工作区内修改',
      APPROVE_FOR_ME_LABEL,
      '完全权限',
    ])).toBe(true)
    expect(isPermissionPresetMenu([APPROVE_FOR_ME_LABEL])).toBe(false)
    expect(isPermissionPresetMenu([
      '仅可查看',
      '工作区内修改',
      '完全权限',
    ])).toBe(false)
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
    const callId = ToolCallId('foreign-session-call')
    const questionCallId = ToolCallId('user-question-call')
    const agent = {
      ...base.agent,
      session: {
        ...base.agent!.session,
        snapshotEvents: () => [
          {
            type: 'user/message',
            data: {
              content: [{ type: 'text', text: '/resume-codex 01a01e7e-9c42-7260-ab9b-41149f1e5533' }],
              source: { kind: 'user' },
            },
          },
          {
            type: 'assistant/message',
            data: {
              message: {
                content: [{ type: 'text', text: 'I will inspect the resumed workspace output.' }],
              },
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
                toolCallId: callId,
                isError: false,
                content: [{
                  type: 'text',
                  text: '{"cwd":"/Users/alice/work/project","inert":true}',
                }],
              },
            },
          },
          {
            type: 'tool/call',
            data: {
              callId: questionCallId,
              name: 'ask_user_question',
              arguments: '{"questions":[{"id":"confirm","question":"Publish the build?"}]}',
            },
          },
          {
            type: 'tool/result',
            data: {
              message: {
                source: { kind: 'tool', callId: questionCallId },
                toolCallId: questionCallId,
                isError: false,
                content: [{ type: 'text', text: '{"confirm":"Yes, publish this build."}' }],
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
    expect(subject.recentAssistantMessages).toEqual([
      'I will inspect the resumed workspace output.',
    ])
    expect(JSON.stringify(subject.trustedUserResponses[0]?.question)).toContain('Publish the build?')
    expect(JSON.stringify(subject.trustedUserResponses[0]?.response)).toContain('Yes, publish this build.')
    expect(JSON.stringify(subject.recentExecutionEvidence)).not.toContain('ask_user_question')
  })

  it('frames the latest system/message as trusted developer instructions', () => {
    const base = execution('bash', {
      command: 'find /Users/alice/work/deepseek-harness -type f | head -10',
    }, '/Users/alice/work/DSH')
    const agent = {
      ...base.agent,
      session: {
        ...base.agent!.session,
        snapshotEvents: () => [
          {
            type: 'system/message',
            data: {
              message: {
                role: 'system',
                content: [{
                  type: 'text',
                  text: 'Older checkout instructions should be ignored once a later system/message exists.',
                }],
              },
            },
          },
          {
            type: 'system/message',
            data: {
              message: {
                role: 'system',
                content: [{
                  type: 'text',
                  text: 'The DeepSeek Harness implementation checkout is at /Users/alice/work/deepseek-harness. Use this checkout to inspect or extend DSH itself.',
                }],
              },
            },
          },
        ],
        requestHeader: () => ({
          config: { provider: 'pi-test', model: 'model' },
        }),
      },
    } as ToolExecution['agent']
    const reviewer = new ApprovalReviewer({} as Context, () => ({}))
    const subject = reviewer.subject({ ...base, agent }, {
      kind: 'ask', reason: 'outside the working directory',
    })
    expect(subject.trustedDeveloperInstructions).toEqual([
      'The DeepSeek Harness implementation checkout is at /Users/alice/work/deepseek-harness. Use this checkout to inspect or extend DSH itself.',
    ])
  })

  it('parses one atomic fixed route', () => {
    expect(parseReviewerRoute(JSON.stringify(['pi-openai-codex', 'gpt-5.3-codex'])))
      .toEqual({ provider: 'pi-openai-codex', model: 'gpt-5.3-codex' })
    expect(parseReviewerRoute('{bad')).toBeUndefined()
  })

  it('accepts Codex Guardian assessments and rejects inconsistent allows', () => {
    expect(parseReviewDecision('{"outcome":"allow"}')).toEqual({
      source: 'model',
      decision: 'allow',
      riskLevel: 'low',
      userAuthorization: 'unknown',
      reason: 'Auto-review returned a low-risk allow decision.',
    })
    expect(parseReviewDecision('{"risk_level":"high","user_authorization":"medium","outcome":"allow","rationale":"narrow authorized deployment"}'))
      .toMatchObject({
        source: 'model',
        decision: 'allow',
        riskLevel: 'high',
        userAuthorization: 'medium',
        reason: 'narrow authorized deployment',
      })
    expect(parseReviewDecision('{"risk_level":"high","outcome":"deny","rationale":"authorization missing"}'))
      .toMatchObject({ decision: 'deny', riskLevel: 'high', reason: 'authorization missing' })
    expect(() => parseReviewDecision('{"decision":"ask","reason":"x"}')).toThrow()
    expect(() => parseReviewDecision('{"risk_level":"critical","user_authorization":"high","outcome":"allow"}')).toThrow()
    expect(() => parseReviewDecision('{"risk_level":"high","user_authorization":"unknown","outcome":"allow"}')).toThrow()
  })

  it('redacts credential-shaped fields recursively', () => {
    expect(redactArguments({ apiKey: 'secret', nested: { value: 'token=abc' } }))
      .toEqual({ apiKey: '[REDACTED]', nested: { value: 'token=[REDACTED]' } })
  })

  it('prefers low reasoning exactly and otherwise leaves the provider default', () => {
    const info = {
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
    }
    expect(String(preferredLowReasoningEffort(info))).toBe('low')
    expect(preferredLowReasoningEffort({
      ...info,
      reasoning: { efforts: [{ id: 'minimal' as never, name: 'Minimal' }] },
    })).toBeUndefined()
  })

  it('forks concurrent reviewer work into an ephemeral conversation', () => {
    const sessions = new ReviewSessionManager()
    const agent = execution('write', { path: 'README.md' }).agent!
    const route = { provider: 'pi-test', model: 'model' }
    const limits = { maxPairs: 4, maxChars: 20_000 }
    const first = sessions.acquire(agent, route, 'authorization-v1', limits)
    const concurrent = sessions.acquire(agent, route, 'authorization-v1', limits)

    expect(first.ephemeral).toBe(false)
    expect(concurrent.ephemeral).toBe(true)
    first.commit('{"action":"one"}', '{"outcome":"allow"}')
    first.release()

    const next = sessions.acquire(agent, route, 'authorization-v1', limits)
    expect(next.priorMessages).toHaveLength(2)
    next.release()

    const reset = sessions.acquire(agent, route, 'authorization-v2', limits)
    expect(reset.priorMessages).toHaveLength(0)
    reset.release()
  })

  it('assembles a real reviewer stream and sends low effort without tools', async () => {
    const calls: GenerateOptions[] = []
    const chunks: StreamChunk[] = [
      { type: 'text-delta', index: 0, text: '{"risk_level":"medium","user_authorization":"high","outcome":"allow","rationale":"authorized"}' },
      { type: 'finish', reason: { kind: 'stop' } },
    ]
    const ctx = {
      llm: {
        listProviders: () => [{ id: 'deepseek-official', name: 'DeepSeek API Key' }],
        listModels: async () => [{ provider: 'deepseek-official', id: 'model', name: 'Model' }],
        resolveModelInfo: async () => ({
          provider: 'deepseek-official', id: 'model', name: 'Model',
          reasoning: { efforts: [
            { id: 'high' as never, name: 'High' },
            { id: 'low' as never, name: 'Low' },
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
      reviewerRoute: JSON.stringify(['deepseek-official', 'model']),
      reasoningMode: 'low',
      timeoutMs: 1_000,
    }))
    await expect(reviewer.review({
      stage: 'pre-execute',
      toolName: 'write',
      arguments: { path: 'README.md' },
      recentUserRequests: ['update the README'],
      trustedDeveloperInstructions: [],
      trustedUserResponses: [],
      recentAssistantMessages: [],
      recentExecutionEvidence: [],
      downstream: { kind: 'allow' },
    })).resolves.toMatchObject({
      source: 'model',
      decision: 'allow',
      riskLevel: 'medium',
      userAuthorization: 'high',
      reason: 'authorized',
    })
    expect(String(calls[0]?.reasoningEffort)).toBe('low')
    expect(calls[0]?.maxTokens).toBe(256)
    expect(calls[0]).not.toHaveProperty('tools')
  })

  it('reuses a bounded reviewer conversation for sequential reviews', async () => {
    const calls: GenerateOptions[] = []
    const ctx = {
      llm: {
        listProviders: () => [{ id: 'pi-test', name: 'Test' }],
        resolveModelInfo: async () => ({ provider: 'pi-test', id: 'model', name: 'Model' }),
        stream: (options: GenerateOptions) => {
          calls.push(options)
          return (async function* (): AsyncGenerator<StreamChunk> {
            yield { type: 'text-delta', index: 0, text: '{"outcome":"allow"}' }
            yield { type: 'finish', reason: { kind: 'stop' } }
          })()
        },
      },
      logger: { info: () => {} },
    } as unknown as Context
    const reviewer = new ApprovalReviewer(ctx, () => ({
      modelMode: 'fixed',
      reviewerRoute: JSON.stringify(['pi-test', 'model']),
      timeoutMs: 1_000,
    }))
    const agent = execution('write', { path: 'README.md' }).agent!
    const subject: ReviewSubject = {
      stage: 'pre-execute',
      toolName: 'write',
      arguments: { path: 'README.md' },
      agent,
      recentUserRequests: ['update the README'],
      trustedDeveloperInstructions: [],
      trustedUserResponses: [],
      recentAssistantMessages: [],
      recentExecutionEvidence: [],
      downstream: { kind: 'ask', reason: 'approval required' },
    }

    await reviewer.review(subject)
    await reviewer.review({ ...subject, arguments: { path: 'SECURITY.md' } })

    expect(calls[0]?.messages).toHaveLength(1)
    expect(calls[1]?.messages).toHaveLength(3)
    expect(calls[1]?.messages[0]?.role).toBe('user')
    expect(calls[1]?.messages[1]?.role).toBe('assistant')
    expect(calls[1]?.messages[2]?.role).toBe('user')
  })

  it('keeps oversized reviewer context valid and within the configured character ceiling', async () => {
    const calls: GenerateOptions[] = []
    const ctx = {
      llm: {
        listProviders: () => [{ id: 'pi-test', name: 'Test' }],
        resolveModelInfo: async () => ({ provider: 'pi-test', id: 'model', name: 'Model' }),
        stream: (options: GenerateOptions) => {
          calls.push(options)
          return (async function* (): AsyncGenerator<StreamChunk> {
            yield { type: 'text-delta', index: 0, text: '{"outcome":"allow"}' }
            yield { type: 'finish', reason: { kind: 'stop' } }
          })()
        },
      },
      logger: { info: () => {} },
    } as unknown as Context
    const reviewer = new ApprovalReviewer(ctx, () => ({
      modelMode: 'fixed',
      reviewerRoute: JSON.stringify(['pi-test', 'model']),
      maxInputChars: 2_000,
      timeoutMs: 1_000,
    }))

    await reviewer.review({
      stage: 'pre-execute',
      toolName: 'write',
      arguments: { content: '\\"'.repeat(20_000) },
      recentUserRequests: ['update the generated fixture'],
      trustedDeveloperInstructions: [],
      trustedUserResponses: [],
      recentAssistantMessages: [],
      recentExecutionEvidence: [],
      downstream: { kind: 'ask', reason: 'approval required' },
    })

    const block = calls[0]?.messages.at(-1)?.content[0]
    expect(block?.type).toBe('text')
    if (block?.type !== 'text') throw new Error('review input was not text')
    expect(block.text.length).toBeLessThanOrEqual(2_000)
    expect(() => JSON.parse(block.text)).not.toThrow()
  })

  it('attributes a provider failure to the requested reviewer route', async () => {
    const ctx = {
      llm: {
        listProviders: () => [{ id: 'pi-xai', name: 'xAI Grok' }],
        resolveModelInfo: async () => ({ provider: 'pi-xai', id: 'grok-4.5', name: 'Grok 4.5' }),
        stream: () => (async function* (): AsyncGenerator<StreamChunk> {
          yield {
            type: 'finish',
            reason: {
              kind: 'error',
              failure: {
                message: "Codex error: Tool 'image_generation' is not supported with gpt-5.3-codex-spark",
                code: 'UNSUPPORTED_OPTION',
              },
            },
          }
        })(),
      },
      logger: { info: () => {} },
    } as unknown as Context
    const reviewer = new ApprovalReviewer(ctx, () => ({
      modelMode: 'fixed', reviewerRoute: JSON.stringify(['pi-xai', 'grok-4.5']), timeoutMs: 1_000,
    }))
    const decision = await reviewer.review({
      stage: 'pre-execute',
      toolName: 'bash',
      arguments: { command: 'echo hi' },
      recentUserRequests: ['say hi'],
      trustedDeveloperInstructions: [],
      trustedUserResponses: [],
      recentAssistantMessages: [],
      recentExecutionEvidence: [],
      downstream: { kind: 'allow' },
    })
    expect(decision).toMatchObject({
      source: 'failure',
      decision: 'deny',
      failureKind: 'configuration',
    })
    expect(decision.reason).toContain('请求模型：xAI Grok · grok-4.5')
    expect(decision.reason).toContain("Codex error: Tool 'image_generation'")
  })

  it('retries one transient model stream that ends before its terminal event', async () => {
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
            yield { type: 'text-delta', index: 0, text: '{"risk_level":"low","outcome":"allow","rationale":"bounded read"}' }
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
      trustedDeveloperInstructions: [],
      trustedUserResponses: [],
      recentAssistantMessages: [],
      recentExecutionEvidence: [],
      downstream: { kind: 'allow' },
    })
    expect(decision).toMatchObject({
      source: 'model',
      decision: 'allow',
      riskLevel: 'low',
      reason: 'bounded read',
    })
    expect(attempts).toBe(2)
  })

  it('retries a malformed assessment within the same review budget', async () => {
    let attempts = 0
    const ctx = {
      llm: {
        listProviders: () => [{ id: 'pi-test', name: 'Test' }],
        resolveModelInfo: async () => ({ provider: 'pi-test', id: 'model', name: 'Model' }),
        stream: () => (async function* (): AsyncGenerator<StreamChunk> {
          attempts += 1
          yield {
            type: 'text-delta',
            index: 0,
            text: attempts === 1 ? 'not json' : '{"outcome":"allow"}',
          }
          yield { type: 'finish', reason: { kind: 'stop' } }
        })(),
      },
      logger: { info: () => {} },
    } as unknown as Context
    const reviewer = new ApprovalReviewer(ctx, () => ({
      modelMode: 'fixed',
      reviewerRoute: JSON.stringify(['pi-test', 'model']),
      timeoutMs: 1_000,
      transportRetries: 2,
    }))
    const decision = await reviewer.review({
      stage: 'pre-execute',
      toolName: 'read',
      arguments: { file_path: '/workspace/README.md' },
      recentUserRequests: ['read the README'],
      trustedDeveloperInstructions: [],
      trustedUserResponses: [],
      recentAssistantMessages: [],
      recentExecutionEvidence: [],
      downstream: { kind: 'ask', reason: 'approval required' },
    })
    expect(decision).toMatchObject({ source: 'model', decision: 'allow', riskLevel: 'low' })
    expect(attempts).toBe(2)
  })

  it('shares one total deadline across reviewer retries', async () => {
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
            yield { type: 'text-delta', index: 0, text: '{"risk_level":"low","outcome":"allow","rationale":"bounded read"}' }
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
      trustedDeveloperInstructions: [],
      trustedUserResponses: [],
      recentAssistantMessages: [],
      recentExecutionEvidence: [],
      downstream: { kind: 'allow' },
    })
    expect(decision).toMatchObject({
      source: 'failure',
      decision: 'deny',
      failureKind: 'timeout',
    })
    expect(attempts).toBe(1)
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
      trustedDeveloperInstructions: [],
      trustedUserResponses: [],
      recentAssistantMessages: [],
      recentExecutionEvidence: [],
      downstream: { kind: 'allow' },
    })
    expect(decision).toMatchObject({
      source: 'failure',
      decision: 'deny',
      failureKind: 'timeout',
    })
    expect(decision.reason).toContain('Test Reviewer · model')
    expect(decision.reason).toContain('20 毫秒')
    expect(decision.reason).not.toContain('OpenAI Responses')
  })
})
