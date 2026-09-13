import { ApiError, GoogleGenAI } from '@google/genai'
import type { ChatTurn, LlmProvider, SendParams } from './types'

export class GoogleProvider implements LlmProvider {
  private client: GoogleGenAI | null = null

  configure(apiKey: string): void {
    this.client = new GoogleGenAI({ apiKey })
  }

  clearClient(): void {
    this.client = null
  }

  isConfigured(): boolean {
    return this.client !== null
  }

  async send(params: SendParams): Promise<string> {
    if (!this.client) throw new Error('Kein Client')
    const stream = await this.client.models.generateContentStream({
      model: params.model,
      contents: toGoogleContents(params.history),
      config: {
        systemInstruction: params.systemPrompt,
        maxOutputTokens: params.maxTokens
      }
    })

    let text = ''
    let blockReason: string | undefined
    for await (const chunk of stream) {
      if (chunk.promptFeedback?.blockReason) {
        blockReason = chunk.promptFeedback.blockReason
      }
      const delta = chunk.text
      if (delta) {
        text += delta
        params.onDelta(delta)
      }
      const finishReason = chunk.candidates?.[0]?.finishReason
      if (finishReason === 'SAFETY' || finishReason === 'PROHIBITED_CONTENT') {
        blockReason = finishReason
      }
    }
    if (blockReason) {
      throw new Error(`Der Tutor hat diese Anfrage abgelehnt (${blockReason}).`)
    }
    return text
  }

  describeError(err: unknown): string {
    if (err instanceof ApiError) {
      // Google meldet einen ungültigen Key als HTTP 400 (nicht 401/403!) mit
      // "API_KEY_INVALID" im (teils doppelt als JSON-String verschachtelten) Body.
      if (err.status === 401 || err.status === 403 || /api_key_invalid|api key not valid/i.test(err.message)) {
        return 'API-Key ungültig – bitte in den Einstellungen prüfen.'
      }
      if (err.status === 429) {
        return 'Rate-Limit erreicht – bitte einen Moment warten.'
      }
      return `API-Fehler ${err.status}: ${extractGoogleMessage(err.message)}`
    }
    return err instanceof Error ? err.message : String(err)
  }
}

function toGoogleContents(history: ChatTurn[]): Array<{ role: 'user' | 'model'; parts: [{ text: string }] }> {
  return history.map((turn) => ({
    role: turn.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: turn.text }]
  }))
}

/**
 * `ApiError.message` ist der rohe HTTP-Body, bei dem Google die eigentliche
 * Meldung mehrfach als JSON-String ineinander verschachtelt – hier bis zu
 * dreimal auspacken, um die menschenlesbare Meldung freizulegen statt der
 * ganzen Rohausgabe.
 */
function extractGoogleMessage(raw: string): string {
  let current: unknown = raw
  for (let i = 0; i < 3 && typeof current === 'string'; i++) {
    try {
      const parsed = JSON.parse(current) as { error?: { message?: unknown } }
      if (typeof parsed?.error?.message !== 'string') break
      current = parsed.error.message
    } catch {
      break
    }
  }
  return typeof current === 'string' ? current : raw
}
