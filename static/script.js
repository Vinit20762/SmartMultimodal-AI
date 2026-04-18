let currentPrompt = "";
let currentResponses = [];

function showError(elementId, message) {
  const el = document.getElementById(elementId);
  el.textContent = message;
  el.classList.remove("hidden");
}

function clearError(elementId) {
  const el = document.getElementById(elementId);
  el.textContent = "";
  el.classList.add("hidden");
}

function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function generateText() {
  const prompt = document.getElementById("prompt-input").value.trim();
  clearError("prompt-error");

  if (!prompt) {
    showError("prompt-error", "Please enter a prompt before generating.");
    return;
  }

  currentPrompt = prompt;
  currentResponses = [];

  const btn = document.getElementById("btn-generate-text");
  btn.disabled = true;
  btn.textContent = "Generating...";

  // Reset downstream sections
  document.getElementById("section-text").classList.add("hidden");
  document.getElementById("section-rankings").classList.add("hidden");
  document.getElementById("section-image").classList.add("hidden");

  try {
    const res = await fetch("/generate-text", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt }),
    });

    const data = await res.json();

    if (data.error) {
      showError("prompt-error", data.error);
      return;
    }

    currentResponses = data.responses;
    renderResponses(data.responses);
    document.getElementById("section-text").classList.remove("hidden");
  } catch (err) {
    showError("prompt-error", "Something went wrong. Make sure the server is running.");
  } finally {
    btn.disabled = false;
    btn.textContent = "Generate Text";
  }
}

function renderResponses(responses) {
  const container = document.getElementById("responses-container");
  container.innerHTML = "";

  responses.forEach((r, i) => {
    const card = document.createElement("div");
    card.className = "response-card";

    // Stars in reversed DOM order (5 → 1) so CSS row-reverse shows 1 → 5 visually
    const stars = [5, 4, 3, 2, 1]
      .map(
        (n) => `
          <input type="radio" name="rating-${i}" id="star-${i}-${n}" value="${n}" />
          <label for="star-${i}-${n}" title="${n} star${n !== 1 ? "s" : ""}">&#9733;</label>
        `
      )
      .join("");

    card.innerHTML = `
      <div class="response-label">Response ${i + 1}</div>
      <div class="response-text">${escapeHtml(r.text)}</div>
      <div class="star-rating" id="stars-${i}">${stars}</div>
    `;

    container.appendChild(card);
  });
}

async function submitRatings() {
  // Validate that all responses are rated
  for (let i = 0; i < currentResponses.length; i++) {
    const selected = document.querySelector(`input[name="rating-${i}"]:checked`);
    if (!selected) {
      alert(`Please rate Response ${i + 1} before submitting.`);
      return;
    }
  }

  const btn = document.getElementById("btn-submit-ratings");
  btn.disabled = true;
  btn.textContent = "Submitting...";

  try {
    for (let i = 0; i < currentResponses.length; i++) {
      const rating = document.querySelector(`input[name="rating-${i}"]:checked`).value;
      await fetch("/rate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: currentPrompt,
          response_id: i,
          rating: parseInt(rating),
          text: currentResponses[i].text,
        }),
      });
    }

    const res = await fetch("/rankings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: currentPrompt }),
    });

    const data = await res.json();
    renderRankings(data.rankings);
    document.getElementById("section-rankings").classList.remove("hidden");
    document.getElementById("section-rankings").scrollIntoView({ behavior: "smooth" });
  } catch (err) {
    alert("Error submitting ratings. Please try again.");
  } finally {
    btn.disabled = false;
    btn.textContent = "Submit Ratings & Rank";
  }
}

function renderRankings(rankings) {
  const container = document.getElementById("rankings-container");
  container.innerHTML = "";

  rankings.forEach((r, pos) => {
    const response = currentResponses[r.id];
    const preview = response.text.length > 130
      ? response.text.slice(0, 130) + "..."
      : response.text;

    const item = document.createElement("div");
    item.className = "rank-item";
    item.innerHTML = `
      <div class="rank-num">#${pos + 1}</div>
      <div class="rank-text"><span class="rank-label">Response ${r.id + 1}:</span> ${escapeHtml(preview)}</div>
      <div class="rank-score">&#9733; ${r.avg.toFixed(1)}</div>
    `;
    container.appendChild(item);
  });
}

async function generateImage() {
  const section = document.getElementById("section-image");
  const loading = document.getElementById("image-loading");
  const container = document.getElementById("image-container");
  const errorEl = document.getElementById("image-error");

  section.classList.remove("hidden");
  loading.classList.remove("hidden");
  container.innerHTML = "";
  errorEl.classList.add("hidden");

  document.getElementById("image-prompt-display").textContent =
    `Prompt: "${currentPrompt}"`;

  section.scrollIntoView({ behavior: "smooth" });

  try {
    const res = await fetch("/generate-image", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: currentPrompt }),
    });

    const data = await res.json();

    if (data.error) {
      showError("image-error", data.error);
      return;
    }

    const img = document.createElement("img");
    img.src = data.image;
    img.alt = currentPrompt;
    container.appendChild(img);
  } catch (err) {
    showError("image-error", "Failed to generate image. Check your HF_TOKEN in .env.");
  } finally {
    loading.classList.add("hidden");
  }
}
