// Cloudflare Worker: passes chat messages to OpenAI and keeps the API key secret.
// The key is stored in Cloudflare as a secret named OPENAI_API_KEY (never in this file).

export default {
  async fetch(request, env) {
    // CORS headers let the GitHub Pages site call this Worker from the browser
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Content-Type": "application/json",
    };

    // Handle CORS preflight requests
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    // Only accept POST requests with a messages array
    if (request.method !== "POST") {
      return new Response(JSON.stringify({ error: "Use POST" }), {
        status: 405,
        headers: corsHeaders,
      });
    }

    let userInput;
    try {
      userInput = await request.json();
    } catch (err) {
      return new Response(JSON.stringify({ error: "Invalid JSON" }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    if (!Array.isArray(userInput.messages)) {
      return new Response(JSON.stringify({ error: "Missing messages array" }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    // Keep the system prompt plus the most recent 20 messages to limit cost
    const messages = userInput.messages;
    const trimmed =
      messages.length > 21
        ? [messages[0], ...messages.slice(-20)]
        : messages;

    const requestBody = {
      model: "gpt-4.1",
      messages: trimmed,
      max_completion_tokens: 600,
      temperature: 0.7,
    };

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    const data = await response.json();

    return new Response(JSON.stringify(data), {
      status: response.status,
      headers: corsHeaders,
    });
  },
};
