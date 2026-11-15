import { expect, test } from 'claude-code/testing'

const BAND = {
  plugin: 'status-light',
  component: 'AbovePrompt',
  props: { hasSurvey: false, isCollapsed: false, isWorking: false, maxRows: 10, bodyColumns: 80, scroll: { offset: 0, bodyRows: 10 }, view: {} },
} as const

async function label($: any, surface: 'terminal' | 'desktop') {
  const ui = await $.ui.mount({ ...BAND, surface })
  const texts = (await ui.findAll({ type: 'Text' })).map((t: any) => t.text).join('')
  await ui.unmount()
  return texts
}

test('red, green, yellow, green, red across a turn', async ($, on) => {
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('turn.complete', (_, e) => ({ text: e.answer }))
  on('tool.call', () => ({ result: {} }))
  on('classic.PermissionRequest', () => ({}))
  on('classic.PostToolUse', () => ({}))
  on('prompt.submit', (_, e) => ({ text: e.text }) as any)

  for (const surface of ['terminal', 'desktop'] as const) {
    await $.prompt.submit({ text: 'reset' } as any).catch(() => {})
    await $.turn.complete({ turnId: 't0', answer: '', durationMs: 1, isAborted: false, reason: 'answer' })
    expect(await label($, surface)).toContain('Idle')

    await $.turn.start({ text: 'hi', turnId: 't1' })
    expect(await label($, surface)).toContain('Working')

    await $.classic.PermissionRequest({ tool_name: 'Bash', tool_input: {} })
    expect(await label($, surface)).toContain('Permission needed: Bash')

    await $.classic.PostToolUse({ tool_name: 'Bash', tool_input: {}, tool_response: {}, tool_use_id: 'x' })
    expect(await label($, surface)).toContain('Working')

    await $.turn.complete({ turnId: 't1', answer: 'ok', durationMs: 1, isAborted: false, reason: 'answer' })
    expect(await label($, surface)).toContain('Idle')

    await $.turn.start({ text: '', turnId: 't2' })
    await $.turn.complete({ turnId: 't2', answer: '', durationMs: 1, isAborted: false, reason: 'error' })
    expect(await label($, surface)).toContain('Stopped on an error')
  }
})

test('a question holds yellow while it is open', async ($, on) => {
  let seen = ''
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('tool.call', async () => {
    seen = await label($, 'desktop')
    return { result: {} }
  })
  await $.turn.start({ text: 'hi', turnId: 't1' })
  await $.tool.call({ tool: 'AskUserQuestion', questions: [] } as any)
  expect(seen).toContain('Waiting on your answer')
  expect(await label($, 'desktop')).toContain('Working')
})
