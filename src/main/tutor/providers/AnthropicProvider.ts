import Anthropic from '@anthropic-ai/sdk'
import type { ChatTurn, LlmProvider, SendParams } from './types'

export class AnthropicProvider implements LlmProvider {
  private client: Anthropic | null = null

  configure(apiKey: string): void {
    this.client = new Anthropic({ apiKey })
  }

  /** Dev-Komfort: Umgebungsvariable nutzen, wenn kein Key gespeichert ist. */
  configureFromEnv(): void {
    if (!this.client && (process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN)) {
      this.client = new Anthropic()
    }
  }

  clearClient(): void {
    this.client = null
  }

  isConfigured(): boolean {
    return this.client !== null
  }

  async send(params: SendParams): Promise<string> {
    try {
      return await this.runStream(params, true)
    } catch (err) {
      // Server-side-Fallbacks sind beta: bei einer 400 dazu einmal ohne erneut versuchen
      if (err instanceof Anthropic.BadRequestError) {
        return await this.runStream(params, false)
      }
      throw err
    }
  }

  private async runStream(params: SendParams, withFallbacks: boolean): Promise<string> {
    if (!this.client) throw new Error('Kein Client')
    const requestParams: Record<string, unknown> = {
      model: params.model,
      max_tokens: params.maxTokens,
      output_config: { effort: params.effort },
      system: [{ type: 'text', text: params.systemPrompt, cache_control: { type: 'ephemeral' } }],
      messages: toAnthropicMessages(params.history)
    }
    if (withFallbacks) {
      // Empfehlung für Opus-5/Fable-Code: Refusal-Fallbacks standardmäßig aktivieren
      requestParams.betas = ['server-side-fallback-2026-07-01']
      requestParams.fallbacks = 'default'
    }

    if (withFallbacks) {
      const stream = this.client.beta.messages.stream(requestParams as never)
      stream.on('text', (delta: string) => params.onDelta(delta))
      return extractText(await stream.finalMessage())
    }
    const stream = this.client.messages.stream(requestParams as never)
    stream.on('text', (delta: string) => params.onDelta(delta))
    return extractText(await stream.finalMessage())
  }

  describeError(err: unknown): string {
    if (err instanceof Anthropic.AuthenticationError) {
      return 'API-Key ungültig – bitte in den Einstellungen prüfen.'
    }
    if (err instanceof Anthropic.RateLimitError) {
      return 'Rate-Limit erreicht – bitte einen Moment warten.'
    }
    if (err instanceof Anthropic.APIConnectionError) {
      return 'Keine Verbindung zur Anthropic-API (offline?).'
    }
    if (err instanceof Anthropic.APIError) {
      return `API-Fehler ${err.status}: ${err.message}`
    }
    return err instanceof Error ? err.message : String(err)
  }
}

function toAnthropicMessages(history: ChatTurn[]): Anthropic.MessageParam[] {
  return history.map((turn) => ({ role: turn.role, content: turn.text }))
}

function extractText(final: {
  stop_reason: string | null
  content: Array<{ type: string; text?: string }>
}): string {
  if (final.stop_reason === 'refusal') {
    throw new Error('Der Tutor hat diese Anfrage abgelehnt (Sicherheitsfilter).')
  }
  let text = ''
  for (const block of final.content) {
    if (block.type === 'text' && block.text) text += block.text
  }
  return text
}
