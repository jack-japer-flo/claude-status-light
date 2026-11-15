import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Light } from '../types'

const IDLE: Light = { kind: 'idle', reason: 'Idle' }
const light = atom({ plugin: 'status-light', key: 'light' } as const, IDLE)

// Tools whose whole run is the model waiting on the person.
const ASKING_TOOLS: Record<string, string> = {
  AskUserQuestion: 'Waiting on your answer',
  ExitPlanMode: 'Waiting on plan approval',
}

const LOOK = {
  working: { color: 'success', label: 'Working' },
  waiting: { color: 'warning', label: 'Needs you' },
  idle: { color: 'error', label: 'Idle' },
} as const

// What the main loop is doing, kept in the module; the atom is what draws.
let isRunning = false
let blockedBy: string | undefined // an error the turn ended on
const waits = new Map<string, string>() // open waits on the person, by key
let nextWaitId = 0

async function publish($: EngineInterface): Promise<void> {
  const open = [...waits.values()]
  const next: Light =
    open.length > 0
      ? { kind: 'waiting', reason: open[open.length - 1]! }
      : blockedBy !== undefined
        ? { kind: 'waiting', reason: blockedBy }
        : isRunning
          ? { kind: 'working', reason: 'Thinking or running tools' }
          : IDLE
  const now = await read($, light)
  if (now.kind !== next.kind || now.reason !== next.reason) {
    await update($, light, () => next)
  }
}

function clearPermission(): boolean {
  return waits.delete('permission')
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const result = await next(e)
    isRunning = false
    blockedBy = undefined
    waits.clear()
    await publish($)
    return result
  })

  on('prompt.submit', async ($, e, next) => {
    isRunning = true
    blockedBy = undefined
    waits.clear()
    await publish($)
    return next(e)
  })

  on('turn.start', async ($, e, next) => {
    if (e.agentId === undefined) {
      isRunning = true
      blockedBy = undefined
      await publish($)
    }
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined) {
      isRunning = false
      waits.clear()
      if (e.reason === 'error') {
        blockedBy = 'Stopped on an error'
      } else if (e.reason === 'refusal') {
        blockedBy = 'Stopped: request refused'
      }
      await publish($)
    }
    return next(e)
  })

  on('classic.StopFailure', async ($, e, next) => {
    isRunning = false
    blockedBy = 'Stopped on an error'
    await publish($)
    return next(e)
  })

  // Permission prompts: on while the dialog is up, off once the tool runs or is refused.
  on('classic.PermissionRequest', async ($, e, next) => {
    waits.set('permission', `Permission needed: ${e.tool_name}`)
    await publish($)
    return next(e)
  })

  on('classic.Notification', async ($, e, next) => {
    if (e.notification_type === 'permission_prompt' && !waits.has('permission')) {
      waits.set('permission', 'Permission needed')
      await publish($)
    }
    return next(e)
  })

  on('classic.PermissionDenied', async ($, e, next) => {
    clearPermission()
    await publish($)
    return next(e)
  })

  on('classic.PostToolUse', async ($, e, next) => {
    if (clearPermission()) await publish($)
    return next(e)
  })

  on('classic.PostToolUseFailure', async ($, e, next) => {
    if (clearPermission()) await publish($)
    return next(e)
  })

  // Questions and plan approval: yellow for the whole call.
  on('tool.call', async ($, e, next) => {
    const reason = ASKING_TOOLS[e.tool]
    if (reason === undefined || e.agentId !== undefined) {
      return next(e)
    }
    const key = `ask:${nextWaitId++}`
    waits.set(key, reason)
    await publish($)
    try {
      return await next(e)
    } finally {
      waits.delete(key)
      clearPermission()
      await publish($)
    }
  })

  // An MCP server asking the person for input.
  on('classic.Elicitation', async ($, e, next) => {
    waits.set('elicitation', 'Waiting on your input')
    await publish($)
    return next(e)
  })

  on('classic.ElicitationResult', async ($, e, next) => {
    waits.delete('elicitation')
    await publish($)
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) {
      return next(e)
    }
    const now = await read($, light)
    const look = LOOK[now.kind]
    const { Box, Text } = $.ui.resolve(e)

    return (
      <Box>
        <Text color={look.color} bold>
          ●{' '}
        </Text>
        <Text bold>{look.label}</Text>
        {now.kind === 'waiting' ? <Text dimColor> · {now.reason}</Text> : null}
      </Box>
    )
  })
}
