import io
import json
import os
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import letter
from PyPDF2 import PdfReader, PdfWriter

def fill_pdf_flat(pdf_path: str, form_id: str, answers: dict[str, str]) -> bytes:
    json_path = os.path.join("corpus", "instructions", f"{form_id}.json")
    with open(json_path, "r") as f:
        form_def = json.load(f)

    page_height = form_def.get("page_height", 792)
    fields = {f["name"]: f for f in form_def["fields"]}

    packet = io.BytesIO()
    c = canvas.Canvas(packet, pagesize=letter)
    c.setFont("Helvetica", 9)
    c.setFillColorRGB(0, 0, 0)

    for field_name, value in answers.items():
        if field_name not in fields:
            continue
        rect = fields[field_name].get("rect")
        if not rect:
            continue

        x0, y0, x1, y1 = rect
        # convert from pdfplumber coords (top=0) to reportlab coords (bottom=0)
        rl_y = page_height - y1
        field_width = x1 - x0
        field_height = y1 - y0
        text_y = rl_y + (field_height * 0.3)

        c.setFillColorRGB(0.92, 0.97, 0.92)
        c.rect(x0, rl_y, field_width, field_height, fill=1, stroke=0)

        c.setFillColorRGB(0, 0.35, 0)
        max_chars = int(field_width / 5.5)
        display = value[:max_chars] + ("…" if len(value) > max_chars else "")
        c.drawString(x0 + 3, text_y, display)

    c.save()
    packet.seek(0)

    original = PdfReader(pdf_path)
    overlay = PdfReader(packet)
    writer = PdfWriter()

    original_page = original.pages[0]
    original_page.merge_page(overlay.pages[0])
    writer.add_page(original_page)

    output = io.BytesIO()
    writer.write(output)
    return output.getvalue()