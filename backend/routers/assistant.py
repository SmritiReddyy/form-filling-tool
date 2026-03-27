import uuid
import json
import os
from fastapi import APIRouter, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel
from services.field_extractor import extract_fields, extract_text, FieldSchema
from services.gemini_client import chat_turn
from fastapi.responses import FileResponse
from services.pdf_filler import fill_pdf_flat

router = APIRouter()

AVAILABLE_FORMS = {
    "petition_209a": {
        "name": "Petition Pursuant to G.L. c. 209A § 11 — Domesticated Animals",
        "pdf_path": "forms/petition-209a-s11-relative-to-domesticated-animals.pdf"
    },
    "notice_of_appearance": {
        "name": "Notice of Appearance",
        "pdf_path": "forms/notice_of_appearance.pdf"
    }
}

sessions: dict = {}

class SessionRequest(BaseModel):
    form_id: str

class MessageRequest(BaseModel):
    session_id: str
    current_field: str
    message: str
    language: str = "en"
    history: list[dict] = []

class ExportRequest(BaseModel):
    session_id: str
    answers: dict[str, str]

@router.post("/session")
def create_session(req: SessionRequest):
    if req.form_id not in AVAILABLE_FORMS:
        raise HTTPException(status_code=404, detail="Form not found")

    form_info = AVAILABLE_FORMS[req.form_id]
    pdf_path = form_info["pdf_path"]

    fields = extract_fields(pdf_path, form_id=req.form_id)
    form_text = extract_text(pdf_path)

    session_id = str(uuid.uuid4())
    sessions[session_id] = {
        "form_id": req.form_id,
        "form_text": form_text,
        "fields": fields,
        "answers": {}
    }

    return {
        "session_id": session_id,
        "form_name": form_info["name"],
        "fields": [
            {
                "name": f.name,
                "label": f.label,
                "type": f.type,
                "required": f.required,
                "rect": getattr(f, 'rect', None)
            }
            for f in fields
        ]
    }

@router.post("/assistant/message")
def send_message(req: MessageRequest):
    session = sessions.get(req.session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    fields = session["fields"]
    field_map = {f.name: f for f in fields}

    if req.current_field not in field_map:
        raise HTTPException(status_code=400, detail="Unknown field")

    current_field = field_map[req.current_field]

    reply, field_updates = chat_turn(
        form_text=session["form_text"],
        fields=fields,
        current_field=current_field,
        history=req.history,
        user_message=req.message,
        language=req.language,
        answers=session["answers"]
    )

    if field_updates:
        for key, value in field_updates.items():
            if key in field_map:
                session["answers"][key] = value

    all_required = [f for f in fields if f.required]
    filled_required = [f for f in all_required if f.name in session["answers"]]
    next_field = None
    for f in fields:
        if f.name not in session["answers"]:
            next_field = f.name
            break

    return {
        "reply": reply,
        "field_updates": field_updates,
        "next_field": next_field,
        "progress": {
            "filled": len(session["answers"]),
            "total": len(fields),
            "required_filled": len(filled_required),
            "required_total": len(all_required)
        }
    }

@router.post("/assistant/export")
def export_form(req: ExportRequest):
    session = sessions.get(req.session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    form_info = AVAILABLE_FORMS[session["form_id"]]
    pdf_bytes = fill_pdf_flat(
        pdf_path=form_info["pdf_path"],
        form_id=session["form_id"],
        answers=req.answers
    )

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f"attachment; filename={session['form_id']}_filled.pdf"
        }
    )
    
@router.get("/forms/{form_id}/pdf")
def get_pdf(form_id: str):
    if form_id not in AVAILABLE_FORMS:
        raise HTTPException(status_code=404, detail="Form not found")
    pdf_path = AVAILABLE_FORMS[form_id]["pdf_path"]
    return FileResponse(pdf_path, media_type="application/pdf")

@router.get("/forms")
def list_forms():
    return [
        {"form_id": k, "name": v["name"]}
        for k, v in AVAILABLE_FORMS.items()
    ]