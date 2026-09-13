import OpenAI from 'openai'
import type { ChatTurn, LlmProvider, SendParams } from './types'

export class OpenAIProvider implements LlmProvider {
  private client: OpenAI | null = null

  configure(apiKey: string): void {
    this.client = new OpenAI({ apiKey })
  }

  clearClient(): void {
    this.client = null
  }

  isConfigured(): boolean {
    return this.client !== null
  }

  async send(params: SendParams): Promise<string> {
    if (!this.client) throw new Error('Kein Client')
    const stream = await this.client.responses.create({
      model: params.model,
      instructions: params.systemPrompt,
      input: toResponsesInput(params.history),
      max_output_tokens: params.maxTokens,
      // Wird von Nicht-Reasoning-Modellen ignoriert; auf Reasoning-Modellen
      // (z. B. GPT-5-Familie) steuert es die Denktiefe wie Anthropics effort.
      reasoning: { effort: params.effort },
      stream: true
    })

    let finalText: string | null = null
    for await (const event of stream) {
      if (event.type === 'response.output_text.delta') {
        params.onDelta(event.delta)
      } else if (event.type === 'response.completed') {
        finalText = event.response.output_text
      } else if (event.type === 'response.failed' || event.type === 'response.incomplete') {
        const message = event.response.error?.message ?? 'Antwort unvollständig oder fehlgeschlagen.'
        throw new Error(message)
      }
    }
    if (finalText === null) throw new Error('Keine Antwort erhalten.')
    return finalText
  }

  describeError(err: unknown): string {
    if (err instanceof OpenAI.AuthenticationError) {
      return 'API-Key ungültig – bitte in den Einstellungen prüfen.'
    }
    if (err instanceof OpenAI.RateLimitError) {
      return 'Rate-Limit erreicht – bitte einen Moment warten.'
    }
    if (err instanceof OpenAI.APIConnectionError) {
      return 'Keine Verbindung zur OpenAI-API (offline?).'
    }
    if (err instanceof OpenAI.APIError) {
      return `API-Fehler ${err.status}: ${err.message}`
    }
    return err instanceof Error ? err.message : String(err)
  }
}

function toResponsesInput(history: ChatTurn[]): Array<{ role: 'user' | 'assistant'; content: string }> {
  return history.map((turn) => ({ role: turn.role, content: turn.text }))
}
