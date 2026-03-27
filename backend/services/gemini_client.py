import os
import re
import json
from google import genai
from dotenv import load_dotenv
from services.field_extractor import FieldSchema

load_dotenv()

client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))
MODEL = "gemini-2.5-flash"

def build_system_prompt(
    form_text: str,
    fields: list[FieldSchema],
    current_field: FieldSchema,
    language: str,
    answers: dict
) -> str:
    filled = [f"{f.label}: {answers[f.name]}" for f in fields if f.name in answers]
    remaining = [f for f in fields if f.name not in answers]

    field_list = "\n".join(
        f"- {f.name}: {f.label} ({'required' if f.required else 'optional'})"
        for f in fields
    )
    filled_summary = "\n".join(filled) if filled else "None yet"

    lang_instruction = {
        "es": "You must respond entirely in Spanish.",
        "pt": "You must respond entirely in Portuguese.",
        "en": "You must respond in English."
    }.get(language, "You must respond in English.")

    return f"""You are a court form assistant helping a user fill out a Massachusetts court form.

CRITICAL RULES:
1. You ONLY help the user fill out this specific form. Nothing else.
2. Do NOT give legal advice, opinions, or predictions about their case.
3. Ask about exactly ONE field per response.
4. After the user answers, confirm the value clearly, then move to the next field.
5. {lang_instruction}
6. When you have confirmed an answer, you MUST end your response with this exact format on its own line:
   FIELD_UPDATE: {{"field_name": "value"}}

FORM CONTENT:
{form_text[:2000]}

ALL FIELDS IN THIS FORM:
{field_list}

FIELDS ALREADY FILLED:
{filled_summary}

CURRENT FIELD TO ASK ABOUT:
Name: {current_field.name}
Label: {current_field.label}
Type: {current_field.type}
Official instructions: {current_field.instructions}

Your job right now: Ask the user about the current field using the official instructions as guidance.
If the user has just answered the current field, confirm it and include FIELD_UPDATE.
"""

def chat_turn(
    form_text: str,
    fields: list[FieldSchema],
    current_field: FieldSchema,
    history: list[dict],
    user_message: str,
    language: str,
    answers: dict
) -> tuple[str, dict | None]:

    system_prompt = build_system_prompt(
        form_text, fields, current_field, language, answers
    )

    contents = []
    for turn in history:
        contents.append({
            "role": turn["role"],
            "parts": [{"text": turn["content"]}]
        })
    contents.append({
        "role": "user",
        "parts": [{"text": user_message}]
    })

    response = client.models.generate_content(
        model=MODEL,
        contents=contents,
        config={
            "system_instruction": system_prompt,
            "max_output_tokens": 600,
            "temperature": 0.3
        }
    )

    reply = response.text.strip()

    field_updates = None
    match = re.search(r'FIELD_UPDATE:\s*(\{.*?\})', reply, re.DOTALL)
    if match:
        try:
            raw = json.loads(match.group(1))
            # normalize both formats:
            # {"division": "District Court"}  ← ideal
            # {"field_name": "division", "value": "District Court"}  ← what Gemini sometimes returns
            if "field_name" in raw and "value" in raw:
                field_updates = {raw["field_name"]: raw["value"]}
            else:
                field_updates = raw
        except json.JSONDecodeError:
            field_updates = None
        reply = reply[:match.start()].strip()
        
    return reply, field_updates