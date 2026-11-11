/* ===== Felicity: L'Oréal Clean Beauty Advisor ===== */

/* My Cloudflare Worker URL (the Worker keeps the OpenAI key secret) */
const WORKER_URL = "https://felicity-loreal-chatbot.hadi-shiban.workers.dev/";

/* DOM elements */
const chatForm = document.getElementById("chatForm");
const userInput = document.getElementById("userInput");
const chatWindow = document.getElementById("chatWindow");
const sendBtn = document.getElementById("sendBtn");
const latestQuestion = document.getElementById("latestQuestion");
const latestText = document.getElementById("latestText");
const suggestions = document.getElementById("suggestions");

/* System prompt: tells the AI who Felicity is and what she may talk about */
const systemPrompt = `You are Felicity, a warm and refined beauty advisor for L'Oréal.

YOUR FOCUS
- Help people discover L'Oréal Groupe products (makeup, skincare, haircare, fragrance, men's grooming) and build personalized routines.
- Lean toward the holistic, clean side of beauty: products with plant-derived, naturally sourced, minimally processed, or certified organic ingredients, and brands or lines known for that approach (for example Garnier Bio and Garnier's Green Beauty commitments, Sanoflore, Decléor, Youth to the People, Kiehl's, Aesop, L'Oréal Paris Botanicals, and fragrance-free or gentle formulas from La Roche-Posay and CeraVe).
- For every product you recommend, highlight 1 to 3 key ingredients and explain simply how each one supports skin or hair health (for example hydration, barrier repair, soothing, antioxidant protection) and how it fits a healthy lifestyle.
- When you know it, mention the environmental side: responsibly sourced or upcycled ingredients, biodegradable formulas, recyclable or refillable packaging, or organic certification.

HONESTY RULES
- Only recommend products you are confident exist. If you are unsure of an exact name, formula, or certification, say so and suggest checking the label or the brand's website.
- Never claim a product is 100% natural or organic unless it is certified. Be clear that "natural" does not automatically mean safer.
- Do not give medical advice. For skin conditions, allergies, pregnancy questions, or reactions, suggest a dermatologist. Recommend patch testing new products.

STYLE
- Warm, elegant, and concise. Use short paragraphs, and bullet lists for routines (Morning / Evening steps).
- Use **bold** for product names. Keep most answers under 180 words.
- Ask one follow-up question when it helps you personalize (skin type, concerns, hair type, preferences).
- Remember details the user shares, such as their name, skin type, and past questions, and use them naturally later in the conversation.

STAY ON TOPIC
- Only answer questions about L'Oréal products, ingredients, beauty routines, recommendations, and related self-care and beauty topics.
- If someone asks about anything unrelated (homework, coding, news, other topics), politely decline in one or two sentences and steer back to beauty, for example: "That's outside my expertise, but I'd love to help you find a routine that makes your skin glow. What are you looking for today?"`;

/* Conversation history (LevelUp): the whole chat is sent each time so Felicity remembers context */
const messages = [{ role: "system", content: systemPrompt }];

/* Welcome message */
addMessage(
  "ai",
  "Bonjour, I'm Felicity. I help you find L'Oréal products made with clean, thoughtfully sourced ingredients, and I'll explain what each ingredient does for your skin, hair, and the planet. What can I help you with today?"
);

/* Make text safe to put on the page (stops HTML from being injected) */
function escapeHTML(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/* Turn simple markdown from the AI (bold, bullet lists, numbered lists) into HTML */
function formatReply(text) {
  const lines = escapeHTML(text).split("\n");
  let html = "";
  let listType = null; // "ul", "ol", or null

  lines.forEach((rawLine) => {
    const line = rawLine.trim();
    const bullet = line.match(/^[-*•]\s+(.*)/);
    const numbered = line.match(/^\d+[.)]\s+(.*)/);
    const type = bullet ? "ul" : numbered ? "ol" : null;

    // Close a list when the list type changes
    if (listType && listType !== type) {
      html += `</${listType}>`;
      listType = null;
    }

    if (type) {
      if (!listType) {
        html += `<${type}>`;
        listType = type;
      }
      html += `<li>${(bullet || numbered)[1]}</li>`;
    } else if (line) {
      html += `<p>${line}</p>`;
    }
  });

  if (listType) html += `</${listType}>`;

  // **bold**, *italic*, and ### headings become styled text
  return html
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+?)\*/g, "<em>$1</em>")
    .replace(/<p>#{1,6}\s*(.+?)<\/p>/g, "<p><strong>$1</strong></p>");
}

/* Add a message bubble to the chat window (LevelUp: chat conversation UI) */
function addMessage(role, text) {
  const bubble = document.createElement("div");
  bubble.className = `msg ${role}`;
  const name = role === "user" ? "You" : "Felicity";
  const body = role === "user" ? `<p>${escapeHTML(text)}</p>` : formatReply(text);
  bubble.innerHTML = `<span class="who">${name}</span>${body}`;
  chatWindow.appendChild(bubble);
  // User messages scroll to the bottom; Felicity's replies scroll to their first line
  chatWindow.scrollTop =
    role === "user" ? chatWindow.scrollHeight : bubble.offsetTop - 8;
  return bubble;
}

/* Show the "Felicity is typing" dots while waiting */
function showTyping() {
  const bubble = document.createElement("div");
  bubble.className = "msg ai";
  bubble.innerHTML = `<span class="who">Felicity</span><div class="typing" aria-label="Felicity is typing"><span></span><span></span><span></span></div>`;
  chatWindow.appendChild(bubble);
  chatWindow.scrollTop = chatWindow.scrollHeight;
  return bubble;
}

/* Send a question to Felicity and show her reply */
async function sendMessage(question) {
  // LevelUp: show the latest question above the response (resets each time)
  latestText.textContent = question;
  latestQuestion.hidden = false;

  // Show the user's bubble and save it in the history
  addMessage("user", question);
  messages.push({ role: "user", content: question });

  // Hide the starter suggestions after the first question
  suggestions.hidden = true;

  // Lock the form while waiting
  sendBtn.disabled = true;
  userInput.value = "";
  const typing = showTyping();

  try {
    // POST the full conversation to the Cloudflare Worker
    const response = await fetch(WORKER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: messages }),
    });

    const data = await response.json();

    // If OpenAI sent back an error, show it in a friendly way
    if (!response.ok || !data.choices) {
      throw new Error(data.error?.message || "No reply received");
    }

    // Read the reply, show it, and save it in the history
    const reply = data.choices[0].message.content;
    typing.remove();
    addMessage("ai", reply);
    messages.push({ role: "assistant", content: reply });
  } catch (error) {
    console.error("Chat error:", error);
    typing.remove();
    const errBubble = addMessage(
      "ai",
      "I'm sorry, I couldn't connect just now. Please try again in a moment."
    );
    errBubble.classList.add("error");
    // Remove the unanswered question so the history stays clean
    messages.pop();
  } finally {
    sendBtn.disabled = false;
    userInput.focus();
  }
}

/* Handle form submit */
chatForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const question = userInput.value.trim();
  if (!question || sendBtn.disabled) return;
  sendMessage(question);
});

/* Suggestion buttons send their text as a question */
suggestions.querySelectorAll(".chip").forEach((chip) => {
  chip.addEventListener("click", () => {
    if (!sendBtn.disabled) sendMessage(chip.textContent.trim());
  });
});
