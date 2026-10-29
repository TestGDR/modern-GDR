"use client";

import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import TextAlign from "@tiptap/extension-text-align";
import { Color, FontFamily, FontSize, TextStyle } from "@tiptap/extension-text-style";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

// Editor di testo della guida (dal Westeros: RichEditor.tsx), con due modalità:
// visuale (TipTap) e HTML. Restituisce sempre HTML.

// Cosa sa rappresentare l'editor visuale: il resto andrebbe perso
const VISUAL_TAGS = new Set([
  "p", "br", "strong", "b", "em", "i", "u", "s", "strike", "del", "code", "pre",
  "h1", "h2", "h3", "h4", "h5", "h6", "ul", "ol", "li", "blockquote", "hr", "a", "img", "span",
]);
const VISUAL_ATTRS: Record<string, string[]> = {
  a: ["href", "target", "rel"],
  img: ["src", "alt", "title", "width", "height"],
  ol: ["start", "type"],
};
const VISUAL_STYLES: Record<string, string[]> = { span: ["color", "font-size", "font-family"], img: ["width", "height"] };
const ALIGN_TAGS = new Set(["p", "h1", "h2", "h3", "h4", "h5", "h6"]);

/** true se passando all'editor visuale una parte del codice andrebbe persa */
export function visualEditorWouldLose(html: string) {
  for (const [, rawTag, attrs] of html.matchAll(/<([a-z][a-z0-9]*)\b([^>]*)>/gi)) {
    const tag = rawTag.toLowerCase();
    if (!VISUAL_TAGS.has(tag)) return true;
    const attrRe = /([^\s=/]+)(?:\s*=\s*("[^"]*"|'[^']*'|[^\s>]+))?/g;
    for (const [, rawName, rawValue = ""] of attrs.matchAll(attrRe)) {
      const name = rawName.toLowerCase();
      if (name === "style") {
        const allowed = [...(VISUAL_STYLES[tag] ?? []), ...(ALIGN_TAGS.has(tag) ? ["text-align"] : [])];
        const props = rawValue
          .replace(/^["']|["']$/g, "")
          .split(";")
          .map((r) => r.split(":")[0].trim().toLowerCase())
          .filter(Boolean);
        if (props.some((prop) => !allowed.includes(prop))) return true;
      } else if (!(VISUAL_ATTRS[tag] ?? []).includes(name)) return true;
    }
  }
  return false;
}

const LOSE_WARNING =
  "Questo codice contiene elementi che l'editor visuale non sa mostrare (ad esempio div, tabelle, classi o stili particolari).\n\nPassando all'editor andrebbero persi. Vuoi continuare lo stesso?";

const fieldCls = "rounded-lg border border-input bg-night/40 px-2 text-xs outline-none focus-visible:border-ring";

export function RichEditor({ value, onChange }: { value: string; onChange: (html: string) => void }) {
  const [mode, setMode] = useState<"visuale" | "html">(() => (visualEditorWouldLose(value) ? "html" : "visuale"));

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ link: { openOnClick: false } }),
      TextAlign.configure({ types: ["heading", "paragraph"], alignments: ["left", "center", "right", "justify"] }),
      TextStyle,
      Color,
      FontSize,
      FontFamily,
      Image.configure({ resize: { enabled: true, minWidth: 60, minHeight: 40, alwaysPreserveAspectRatio: true } }),
    ],
    content: value,
    immediatelyRender: false,
    shouldRerenderOnTransaction: true,
    editorProps: {
      // testo incollato da altre pagine: resta l'allineamento, via colori e caratteri d'origine
      transformPastedHTML: (html) =>
        html.replace(/style="([^"]*)"/gi, (_, css: string) => {
          const kept = css
            .split(";")
            .filter((rule) => /^\s*text-align\s*:/i.test(rule))
            .join(";");
          return kept ? `style="${kept}"` : "";
        }),
      attributes: { class: "guide-content min-h-80 p-4 outline-none" },
    },
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
  });

  function switchTo(next: "visuale" | "html") {
    if (next === mode) return;
    if (next === "visuale" && editor) {
      if (visualEditorWouldLose(value) && !window.confirm(LOSE_WARNING)) return;
      editor.commands.setContent(value, { emitUpdate: false });
    }
    setMode(next);
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-night/30">
      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-1 rounded-t-2xl border-b border-white/10 bg-dusk/95 p-1.5 backdrop-blur">
        {mode === "visuale" && editor && <Toolbar editor={editor} />}
        <div className="ml-auto flex gap-1 text-xs">
          {(["visuale", "html"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => switchTo(m)}
              className={cn("rounded-md px-2 py-1 tracking-wider uppercase", mode === m ? "bg-flamingo/30 text-white" : "text-muted-foreground hover:text-foreground")}
            >
              {m === "visuale" ? "Editor" : "HTML"}
            </button>
          ))}
        </div>
      </div>
      {mode === "visuale" ? (
        <EditorContent editor={editor} />
      ) : (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          spellCheck={false}
          className="block min-h-80 w-full resize-y bg-transparent p-4 font-mono text-xs leading-relaxed outline-none"
          aria-label="Codice HTML"
        />
      )}
    </div>
  );
}

function Toolbar({ editor }: { editor: Editor }) {
  const chain = () => editor.chain().focus();
  const btn = (label: ReactNode, title: string, active: boolean, action: () => void) => (
    <button
      key={title}
      type="button"
      title={title}
      aria-label={title}
      onMouseDown={(e) => e.preventDefault()} // non perdere la selezione nel testo
      onClick={action}
      className={cn("h-8 min-w-8 rounded-md px-1.5 text-sm transition", active ? "bg-flamingo/25 text-flamingo" : "text-muted-foreground hover:bg-white/10 hover:text-foreground")}
    >
      {label}
    </button>
  );
  const sep = <span className="mx-1 h-5 w-px bg-white/15" />;

  function link() {
    const previous = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt("Indirizzo del link (vuoto per toglierlo)", previous ?? "https://");
    if (url === null) return;
    if (url.trim() === "" || url === "https://") chain().extendMarkRange("link").unsetLink().run();
    else chain().extendMarkRange("link").setLink({ href: url.trim() }).run();
  }

  return (
    <>
      {btn(<b>G</b>, "Grassetto", editor.isActive("bold"), () => chain().toggleBold().run())}
      {btn(<i>C</i>, "Corsivo", editor.isActive("italic"), () => chain().toggleItalic().run())}
      {btn(<u>S</u>, "Sottolineato", editor.isActive("underline"), () => chain().toggleUnderline().run())}
      {btn(<s>B</s>, "Barrato", editor.isActive("strike"), () => chain().toggleStrike().run())}
      <ColorPicker editor={editor} />
      <FontFamilySelect editor={editor} />
      <FontSizeSelect editor={editor} />
      {sep}
      {btn("T1", "Titolo", editor.isActive("heading", { level: 2 }), () => chain().toggleHeading({ level: 2 }).run())}
      {btn("T2", "Sottotitolo", editor.isActive("heading", { level: 3 }), () => chain().toggleHeading({ level: 3 }).run())}
      {sep}
      {btn(<AlignIcon kind="left" />, "Allinea a sinistra", editor.isActive({ textAlign: "left" }), () => chain().setTextAlign("left").run())}
      {btn(<AlignIcon kind="center" />, "Centra", editor.isActive({ textAlign: "center" }), () => chain().setTextAlign("center").run())}
      {btn(<AlignIcon kind="right" />, "Allinea a destra", editor.isActive({ textAlign: "right" }), () => chain().setTextAlign("right").run())}
      {btn(<AlignIcon kind="justify" />, "Giustifica", editor.isActive({ textAlign: "justify" }), () => chain().setTextAlign("justify").run())}
      {sep}
      {btn("•", "Elenco puntato", editor.isActive("bulletList"), () => chain().toggleBulletList().run())}
      {btn("1.", "Elenco numerato", editor.isActive("orderedList"), () => chain().toggleOrderedList().run())}
      {btn("❝", "Riquadro esempio / citazione", editor.isActive("blockquote"), () => chain().toggleBlockquote().run())}
      {btn("🔗", "Link", editor.isActive("link"), link)}
      <ImageButton editor={editor} />
      {btn("―", "Linea separatrice", false, () => chain().setHorizontalRule().run())}
      {sep}
      {btn("↶", "Annulla", false, () => chain().undo().run())}
      {btn("↷", "Ripeti", false, () => chain().redo().run())}
    </>
  );
}

function AlignIcon({ kind }: { kind: "left" | "center" | "right" | "justify" }) {
  const lines: Record<typeof kind, [number, number][]> = {
    left: [[3, 21], [3, 15], [3, 21], [3, 13]],
    center: [[3, 21], [6, 18], [3, 21], [7, 17]],
    right: [[3, 21], [9, 21], [3, 21], [11, 21]],
    justify: [[3, 21], [3, 21], [3, 21], [3, 21]],
  };
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden className="mx-auto">
      {lines[kind].map(([x1, x2], i) => (
        <path key={i} d={`M${x1} ${5 + i * 5}H${x2}`} />
      ))}
    </svg>
  );
}

/* ------------------------------ Colore ------------------------------ */

// Tavolozza del sito (i toni pastello del tramonto) più colore libero
const PALETTE = [
  { label: "Rosa flamingo", value: "#ec8cb8" },
  { label: "Pesca", value: "#f2b39c" },
  { label: "Sabbia", value: "#f3d5b3" },
  { label: "Lavanda", value: "#b8a8e4" },
  { label: "Orchidea", value: "#c391cc" },
  { label: "Menta", value: "#93d4cf" },
  { label: "Viola", value: "#7563b6" },
  { label: "Bianco", value: "#f6eef6" },
];

function ColorPicker({ editor }: { editor: Editor }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  const current = (editor.getAttributes("textStyle").color as string | undefined) ?? null;

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const apply = (color: string | null) => {
    if (color) editor.chain().focus().setColor(color).run();
    else editor.chain().focus().unsetColor().run();
    setOpen(false);
  };

  return (
    <span ref={ref} className="relative">
      <button
        type="button"
        title="Colore del testo"
        aria-label="Colore del testo"
        aria-expanded={open}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setOpen((v) => !v)}
        className="flex h-8 min-w-8 flex-col items-center justify-center rounded-md px-1.5 text-sm text-muted-foreground hover:bg-white/10 hover:text-foreground"
      >
        <span className="leading-none font-bold">A</span>
        <span className="mt-0.5 h-1 w-4 rounded-sm" style={{ background: current ?? "var(--foreground)" }} />
      </button>
      {open && (
        <span className="absolute top-9 left-0 z-50 w-48 rounded-xl border border-white/15 bg-dusk p-2 shadow-xl">
          <span className="grid grid-cols-4 gap-1.5">
            {PALETTE.map((c) => (
              <button
                key={c.value}
                type="button"
                title={c.label}
                aria-label={c.label}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => apply(c.value)}
                className={cn("h-8 w-8 rounded-md border-2", current === c.value ? "border-white" : "border-transparent hover:border-white/50")}
                style={{ background: c.value }}
              />
            ))}
          </span>
          <span className="mt-2 flex items-center justify-between gap-2 text-xs text-muted-foreground">
            <label className="flex cursor-pointer items-center gap-1.5">
              <input
                type="color"
                value={current && /^#[0-9a-f]{6}$/i.test(current) ? current : "#ec8cb8"}
                onChange={(e) => editor.chain().focus().setColor(e.target.value).run()}
                className="h-6 w-8 cursor-pointer rounded border border-white/15 bg-transparent"
              />
              Altro
            </label>
            <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => apply(null)} className="hover:text-flamingo">
              Togli colore
            </button>
          </span>
        </span>
      )}
    </span>
  );
}

/* ------------------------------ Carattere e grandezza ------------------------------ */

const SIZES = [
  { label: "Piccolo", value: "13px" },
  { label: "Normale", value: "" },
  { label: "Medio", value: "18px" },
  { label: "Grande", value: "22px" },
  { label: "Molto grande", value: "28px" },
  { label: "Enorme", value: "36px" },
];

// Caratteri del sito e alcuni classici presenti su tutti i computer
const FONTS = [
  { label: "Carattere", value: "" },
  { label: "Bebas (titoli)", value: "var(--font-bebas), sans-serif" },
  { label: "Geist (testo)", value: "var(--font-geist-sans), sans-serif" },
  { label: "Pacifico (corsivo)", value: "var(--font-pacifico), cursive" },
  { label: "Georgia", value: "Georgia, serif" },
  { label: "Times", value: "'Times New Roman', serif" },
  { label: "Verdana", value: "Verdana, sans-serif" },
  { label: "Arial", value: "Arial, sans-serif" },
  { label: "Macchina da scrivere", value: "'Courier New', monospace" },
];

function FontFamilySelect({ editor }: { editor: Editor }) {
  const current = (editor.getAttributes("textStyle").fontFamily as string | undefined) ?? "";
  return (
    <select
      value={FONTS.some((f) => f.value === current) ? current : ""}
      onChange={(e) => {
        const font = e.target.value;
        if (font) editor.chain().focus().setFontFamily(font).run();
        else editor.chain().focus().unsetFontFamily().run();
      }}
      title="Carattere del testo"
      aria-label="Carattere del testo"
      className={cn(fieldCls, "h-8 max-w-36")}
    >
      {FONTS.map((f) => (
        <option key={f.label} value={f.value} className="bg-night">
          {f.label}
        </option>
      ))}
    </select>
  );
}

function FontSizeSelect({ editor }: { editor: Editor }) {
  const current = (editor.getAttributes("textStyle").fontSize as string | undefined) ?? "";
  return (
    <select
      value={SIZES.some((s) => s.value === current) ? current : ""}
      onChange={(e) => {
        const size = e.target.value;
        if (size) editor.chain().focus().setFontSize(size).run();
        else editor.chain().focus().unsetFontSize().run();
      }}
      title="Dimensione del testo"
      aria-label="Dimensione del testo"
      className={cn(fieldCls, "h-8")}
    >
      {SIZES.map((s) => (
        <option key={s.label} value={s.value} className="bg-night">
          {s.label}
        </option>
      ))}
    </select>
  );
}

/* ------------------------------ Immagine (da un link https) ------------------------------ */

function ImageButton({ editor }: { editor: Editor }) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [alt, setAlt] = useState("");
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  function insert() {
    setError(null);
    const src = url.trim();
    if (!src.toLowerCase().startsWith("https://")) return setError("Incolla un indirizzo che inizia con https://");
    editor.chain().focus().setImage({ src, alt: alt.trim() || undefined }).run();
    setOpen(false);
    setUrl("");
    setAlt("");
  }

  const input = "h-8 w-full rounded-lg border border-input bg-night/40 px-2 text-xs outline-none focus-visible:border-ring";
  return (
    <span ref={ref} className="relative">
      <button
        type="button"
        title="Inserisci immagine"
        aria-label="Inserisci immagine"
        aria-expanded={open}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setOpen((v) => !v)}
        className="h-8 min-w-8 rounded-md px-1.5 text-sm text-muted-foreground transition hover:bg-white/10 hover:text-foreground"
      >
        🖼
      </button>
      {open && (
        <div className="absolute top-9 left-0 z-50 w-72 space-y-2 rounded-xl border border-white/15 bg-dusk p-3 text-xs shadow-xl">
          <label className="block">
            <span className="mb-1 block tracking-wider text-lavender uppercase">Indirizzo web dell&apos;immagine</span>
            <input value={url} onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), insert())} placeholder="https://…" className={input} />
          </label>
          <label className="block">
            <span className="mb-1 block tracking-wider text-lavender uppercase">Descrizione (facoltativa)</span>
            <input value={alt} onChange={(e) => setAlt(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), insert())} maxLength={150} className={input} />
          </label>
          {error && <p className="text-destructive">{error}</p>}
          <button type="button" onClick={insert} disabled={!url.trim()} className="h-8 w-full rounded-full bg-flamingo font-medium text-night disabled:opacity-50">
            Inserisci
          </button>
          <p className="text-[0.65rem] leading-snug text-muted-foreground">Dopo l&apos;inserimento trascina l&apos;angolo dell&apos;immagine per ridimensionarla.</p>
        </div>
      )}
    </span>
  );
}
