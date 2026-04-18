import os
import io
import json
import base64
from flask import Flask, render_template, request, jsonify
from transformers import pipeline, set_seed
from huggingface_hub import InferenceClient
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)

# Local GPT-2 for text — reliable, offline, matches project spec
print("Loading GPT-2, please wait...")
generator = pipeline("text-generation", model="gpt2")
print("GPT-2 ready.")

# HF Inference API only for image generation
hf_token = os.getenv("HF_TOKEN")
hf_client = InferenceClient(token=hf_token) if hf_token else None

IMAGE_MODEL   = "black-forest-labs/FLUX.1-schnell"
FEEDBACK_FILE = "feedback.json"


def load_feedback():
    if os.path.exists(FEEDBACK_FILE):
        with open(FEEDBACK_FILE, "r") as f:
            return json.load(f)
    return {}


def save_feedback(data):
    with open(FEEDBACK_FILE, "w") as f:
        json.dump(data, f, indent=2)


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/generate-text", methods=["POST"])
def generate_text():
    prompt = request.json.get("prompt", "").strip()
    if not prompt:
        return jsonify({"error": "Prompt cannot be empty."}), 400

    # Different seeds + temperatures give genuinely varied outputs
    configs = [
        {"seed": 42,  "temperature": 0.7, "top_p": 0.9},
        {"seed": 123, "temperature": 1.0, "top_p": 0.95},
        {"seed": 777, "temperature": 1.2, "top_p": 1.0},
    ]

    responses = []
    for i, cfg in enumerate(configs):
        set_seed(cfg["seed"])
        result = generator(
            prompt,
            max_new_tokens=100,
            do_sample=True,
            temperature=cfg["temperature"],
            top_p=cfg["top_p"],
            repetition_penalty=1.3,
            pad_token_id=50256,
        )
        text = result[0]["generated_text"].strip()
        responses.append({"id": i, "text": text})

    return jsonify({"responses": responses})


@app.route("/rate", methods=["POST"])
def rate():
    data        = request.json
    prompt      = data.get("prompt")
    response_id = str(data.get("response_id"))
    rating      = data.get("rating")
    text        = data.get("text", "")

    feedback = load_feedback()

    if prompt not in feedback:
        feedback[prompt] = {}

    if response_id not in feedback[prompt]:
        feedback[prompt][response_id] = {"text": text, "ratings": [], "avg": 0}

    feedback[prompt][response_id]["text"] = text
    feedback[prompt][response_id]["ratings"].append(int(rating))

    ratings = feedback[prompt][response_id]["ratings"]
    avg     = round(sum(ratings) / len(ratings), 2)
    feedback[prompt][response_id]["avg"] = avg

    save_feedback(feedback)
    return jsonify({"success": True, "avg": avg})


@app.route("/rankings", methods=["POST"])
def rankings():
    prompt   = request.json.get("prompt")
    feedback = load_feedback()
    store    = feedback.get(prompt, {})

    ranked = []
    for response_id, entry in store.items():
        ranked.append({"id": int(response_id), "avg": entry["avg"]})

    ranked.sort(key=lambda x: x["avg"], reverse=True)
    return jsonify({"rankings": ranked})


@app.route("/generate-image", methods=["POST"])
def generate_image():
    if not hf_client:
        return jsonify({"error": "HF_TOKEN not set. Add it to your .env file."}), 500

    prompt = request.json.get("prompt", "").strip()
    if not prompt:
        return jsonify({"error": "Prompt cannot be empty."}), 400

    try:
        image = hf_client.text_to_image(prompt, model=IMAGE_MODEL)
        buf   = io.BytesIO()
        image.save(buf, format="PNG")
        img_b64 = base64.b64encode(buf.getvalue()).decode()
        return jsonify({"image": f"data:image/png;base64,{img_b64}"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


if __name__ == "__main__":
    app.run(debug=True)
