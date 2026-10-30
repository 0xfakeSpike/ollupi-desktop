// A scripted OpenAI-compatible chat completions server, so a real ollupi
// backend can be driven without a model (record-session.mjs, manual UI
// testing). The last user message picks the reply: "run ..." asks for an
// escalated run_command (needs approval), "ask" calls request_user_input,
// "plan" calls update_plan, "schedule" creates a scheduled task, "delegate"
// starts a subagent, "mcp" calls the mock MCP server's echo tool
// (mock-mcp.mjs), "search memory" calls memory_search, "write notes" calls
// write_file (notes.md), "fetch page" calls web_fetch (example.com); anything
// else streams markdown. After a tool result it streams a short summary.
//
//   PORT=18080 node scripts/mock-model.mjs
import http from 'node:http'

const PORT = Number(process.env.PORT || 18080)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let n = 0

http
  .createServer(async (req, res) => {
    if (req.url.endsWith('/models')) {
      res.end(JSON.stringify({ object: 'list', data: [{ id: 'mock-model', object: 'model' }] }))
      return
    }
    let body = ''
    for await (const c of req) body += c
    const p = JSON.parse(body)
    const tools = (p.tools || []).map((t) => t.function?.name)
    const last = p.messages.at(-1)
    const lastUser = [...p.messages].reverse().find((m) => m.role === 'user')
    // What the person wrote: the text parts of a message with attachments,
    // without the send time ollupi puts before it.
    const content = lastUser?.content
    const words = typeof content === 'string' ? content : Array.isArray(content) ? content.filter((c) => c.type === 'text').map((c) => c.text).join('\n') : ''
    const userText = words.replace(/^\[sent [^\]]*\]\s*/, '')

    res.writeHead(200, { 'content-type': 'text/event-stream' })
    const id = `chatcmpl-${++n}`
    const send = (delta, finish = null) =>
      res.write(
        `data: ${JSON.stringify({ id, object: 'chat.completion.chunk', created: 0, model: p.model, choices: [{ index: 0, delta, finish_reason: finish }] })}\n\n`,
      )
    const stream = async (field, text) => {
      for (const piece of text.match(/.{1,6}/gs) || []) {
        send({ [field]: piece })
        await sleep(25)
      }
    }
    // Several calls in one answer, as a model looking around makes them.
    const calls = async (list) => {
      const tool_calls = list.map(([name, args], index) => ({
        index,
        id: `call_${n}_${index}`,
        type: 'function',
        function: { name: tools.find((t) => t === name || t?.endsWith(name)) || name, arguments: JSON.stringify(args) },
      }))
      send({ tool_calls })
      send({}, 'tool_calls')
    }
    const call = (name, args) => calls([[name, args]])

    send({ role: 'assistant', content: '' })
    if (last.role === 'tool') {
      await stream('reasoning_content', 'The tool returned; summarize for the user.')
      await stream(
        'content',
        'Done. Here is what I found:\n\n| Item | Value |\n|---|---|\n| status | ok |\n| tool output | received |\n\n```bash\necho done\n```\n\nAnything else?',
      )
      send({}, 'stop')
    } else if (/^run/i.test(userText)) {
      await stream('reasoning_content', 'The user wants a command run outside the sandbox.')
      await stream('content', 'Running it.')
      // Output with nothing machine-specific in it, since recordings are committed.
      await call('run_command', {
        program: 'echo',
        args: ['hello from the command'],
        sandbox_permissions: 'require_escalated',
        justification: 'Demonstrate a command that needs approval',
      })
    } else if (/ask/i.test(userText)) {
      await call('request_user_input', {
        questions: [
          {
            id: 'lang',
            header: 'Language',
            question: 'Which language should the script use?',
            options: [
              { label: 'Go', description: 'Matches the backend' },
              { label: 'TypeScript', description: 'Matches the UI' },
            ],
          },
        ],
      })
    } else if (/schedule/i.test(userText)) {
      await stream('content', 'Setting that up.')
      await call('create_scheduled_job', { name: 'morning-brief', spec: '0 9 * * *', prompt: 'Give me the morning brief.' })
    } else if (/delegate/i.test(userText)) {
      await stream('content', 'Handing this to a subagent.')
      await call('Agent', { description: 'Check the weather', prompt: 'Report the weather in one sentence.' })
    } else if (/^write notes/i.test(userText)) {
      await stream('content', 'Writing the notes.')
      await call('write_file', { path: 'notes.md', content: '# Notes\n\n- first\n- second\n' })
    } else if (/^read readme/i.test(userText)) {
      await call('read_file', { path: 'README.md' })
    } else if (/^look around/i.test(userText)) {
      await stream('content', 'Looking around the project.')
      await calls([
        ['glob', { pattern: '**/*.md' }],
        ['grep', { pattern: 'demo', context: 1 }],
        ['read_file', { path: 'README.md', limit: 20 }],
      ])
    } else if (/^fetch page/i.test(userText)) {
      await stream('content', 'Reading the page.')
      await call('web_fetch', { url: 'https://example.com/' })
    } else if (/search memory/i.test(userText)) {
      await stream('content', 'Searching memory.')
      await call('memory_search', { query: 'indentation' })
    } else if (/mcp/i.test(userText)) {
      await stream('content', 'Asking the MCP server.')
      await call('mock__echo', { text: 'hello from the MCP server' })
    } else if (/plan/i.test(userText)) {
      await call('update_plan', {
        explanation: 'Breaking the work down.',
        plan: [
          { step: 'Read the gateway protocol', status: 'completed' },
          { step: 'Design the package layout', status: 'in_progress' },
          { step: 'Write the renderer', status: 'pending' },
        ],
      })
    } else {
      await stream('reasoning_content', 'Simple question; answer directly with some markdown.')
      await stream(
        'content',
        `## Hello from the mock model\n\nYou said: **${userText.slice(0, 80)}**\n\n- streaming works\n- markdown renders\n- \`inline code\` too\n\n\`\`\`ts\nconst answer = 42\n\`\`\``,
      )
      send({}, 'stop')
    }
    res.write(`data: ${JSON.stringify({ id, object: 'chat.completion.chunk', created: 0, model: p.model, choices: [], usage: { prompt_tokens: 1234, completion_tokens: 56, total_tokens: 1290 } })}\n\n`)
    res.write('data: [DONE]\n\n')
    res.end()
  })
  .listen(PORT, () => console.log('mock llm on', PORT))
