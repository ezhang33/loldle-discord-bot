// Minimal OpenAI-compatible chat-completions client (works with the Relace
// gateway, Groq, Gemini's OpenAI endpoint, OpenRouter, ...). No SDK: one fetch.

const TIMEOUT_MS = 90_000;

class ChatProviderError extends Error {
    constructor(message, { status, rateLimited = false } = {}) {
        super(message);
        this.status = status;
        this.rateLimited = rateLimited;
    }
}

async function complete(chat, messages) {
    const body = {
        model: chat.model,
        messages,
        max_tokens: 600,
        temperature: 0.8,
    };
    if (chat.reasoningEffort) body.reasoning_effort = chat.reasoningEffort;

    const response = await fetch(chat.apiUrl, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${chat.apiKey}` },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!response.ok) {
        const text = (await response.text().catch(() => "")).slice(0, 500);
        throw new ChatProviderError(`${response.status} from ${chat.apiUrl}: ${text}`, {
            status: response.status,
            rateLimited: response.status === 429,
        });
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    if (typeof content !== "string") throw new ChatProviderError("response had no text content");
    return {
        text: stripThinking(content),
        usage: data.usage || null,
    };
}

// Some models leak their reasoning into the text as <think>…</think>.
function stripThinking(text) {
    return text.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
}

module.exports = { complete, stripThinking, ChatProviderError };
