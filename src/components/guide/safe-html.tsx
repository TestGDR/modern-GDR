"use client";

import DOMPurify from "dompurify";
import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

// Testo scritto con l'editor (HTML), ripulito con DOMPurify prima di mostrarlo.
// I testi vecchi senza HTML si mostrano come testo semplice, con gli a capo.

/** true se il testo è HTML dell'editor (inizia con un tag) */
export function isHtml(text: string) {
  return /^\s*<[a-z]/i.test(text);
}

/** Testo semplice → HTML dell'editor (paragrafi), per modificarlo con l'editor */
export function plainToHtml(text: string) {
  if (isHtml(text)) return text;
  const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return text
    .split(/\n{2,}/)
    .map((p) => `<p>${escape(p).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

export function SafeHtml({ html, className }: { html: string; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.innerHTML = DOMPurify.sanitize(html);
  }, [html]);
  if (!isHtml(html)) return <p className={cn("break-words whitespace-pre-line", className)}>{html}</p>;
  return <div ref={ref} className={cn("guide-content break-words", className)} />;
}
