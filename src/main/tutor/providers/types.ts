/** Ein Gesprächsbeitrag in provider-neutraler Form – jeder Adapter übersetzt das in sein eigenes Wire-Format. */
export interface ChatTurn {
  role: 'user' | 'assistant'
  text: string
}

export interface SendParams {
  model: string
  systemPrompt: string
  history: ChatTurn[]
  maxTokens: number
  /** Nur von Anthropic und OpenAI (Reasoning-Modelle) ausgewertet; Google hat kein Äquivalent. */
  effort: 'low' | 'high'
  onDelta: (text: string) => void
}

export interface LlmProvider {
  configure(apiKey: string): void
  clearClient(): void
  isConfigured(): boolean
  send(params: SendParams): Promise<string>
  describeError(err: unknown): string
}
