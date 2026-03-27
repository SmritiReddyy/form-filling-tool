import { useEffect, useRef, useState } from "react";
import type { Field } from "../api";
import * as pdfjsLib from "pdfjs-dist";

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).toString();

interface Props {
  pdfUrl: string;
  fields: Field[];
  currentField: string;
  answers: Record<string, string>;
  pageHeight: number;
}

export default function PdfViewer({ pdfUrl, fields, currentField, answers, pageHeight }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const renderTaskRef = useRef<any>(null);
  const [pdfPage, setPdfPage] = useState<any>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    let cancelled = false;
    pdfjsLib.getDocument(pdfUrl).promise.then(pdf => {
      if (cancelled) return;
      pdf.getPage(1).then(page => {
        if (cancelled) return;
        setPdfPage(page);
      });
    });
    return () => { cancelled = true; };
  }, [pdfUrl]);

  useEffect(() => {
    if (!pdfPage || !canvasRef.current || !containerRef.current) return;

    if (renderTaskRef.current) {
      renderTaskRef.current.cancel();
      renderTaskRef.current = null;
    }

    const containerWidth = containerRef.current.clientWidth;
    const viewport = pdfPage.getViewport({ scale: 1 });
    const s = containerWidth / viewport.width;
    setScale(s);

    const scaledViewport = pdfPage.getViewport({ scale: s });
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = scaledViewport.width;
    canvas.height = scaledViewport.height;

    const task = pdfPage.render({ canvasContext: ctx, viewport: scaledViewport });
    renderTaskRef.current = task;

    task.promise.catch((err: any) => {
      if (err?.name !== "RenderingCancelledException") {
        console.error("PDF render error:", err);
      }
    });
  }, [pdfPage]);

  useEffect(() => {
    if (!overlayRef.current || !pdfPage || !containerRef.current) return;

    const containerWidth = containerRef.current.clientWidth;
    const viewport = pdfPage.getViewport({ scale: 1 });
    const s = containerWidth / viewport.width;

    const canvas = overlayRef.current;
    canvas.width = containerWidth;
    canvas.height = viewport.height * s;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    fields.forEach(field => {
      if (!field.rect) return;
      const [x0, y0, x1, y1] = field.rect;
      const sx = x0 * s;
      const sy = y0 * s;
      const sw = (x1 - x0) * s;
      const sh = (y1 - y0) * s;
      const isCurrent = field.name === currentField;
      const isFilled = field.name in answers;

      if (isCurrent) {
        ctx.strokeStyle = "#3b82f6";
        ctx.lineWidth = 2;
        ctx.strokeRect(sx, sy, sw, sh);
        ctx.fillStyle = "rgba(59, 130, 246, 0.08)";
        ctx.fillRect(sx, sy, sw, sh);
      }

      if (isFilled) {
        ctx.fillStyle = "rgba(240, 253, 244, 0.85)";
        ctx.fillRect(sx, sy, sw, sh);
        ctx.fillStyle = "#166534";
        ctx.font = `${Math.max(9, sh * 0.45)}px sans-serif`;
        ctx.textBaseline = "middle";
        const text = answers[field.name];
        const maxWidth = sw - 8;
        ctx.fillText(text, sx + 4, sy + sh / 2, maxWidth);
      }
    });
  }, [fields, currentField, answers, pdfPage, scale]);

  return (
    <div ref={containerRef} className="relative w-full">
      <canvas ref={canvasRef} className="w-full" />
      <canvas
        ref={overlayRef}
        className="absolute top-0 left-0 w-full pointer-events-none"
      />
    </div>
  );
}