import { Fragment } from "react";

/** Tiny, safe markdown subset (headings, lists, paragraphs, **bold**, `code`). No raw HTML is ever rendered. */
function inline(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return parts.map((p, i) =>
    p.startsWith("**") && p.endsWith("**") ? <strong key={i}>{p.slice(2, -2)}</strong> :
    p.startsWith("`") && p.endsWith("`") ? <code key={i}>{p.slice(1, -1)}</code> : <Fragment key={i}>{p}</Fragment>);
}

export function Markdown({ source }: { source: string }) {
  const blocks = source.replace(/\r/g, "").split(/\n{2,}/);
  return (
    <div className="prose-lesson">
      {blocks.map((b, i) => {
        const lines = b.split("\n");
        if (/^#{1,3}\s/.test(b)) return <h2 key={i}>{inline(b.replace(/^#{1,3}\s/, ""))}</h2>;
        if (lines.every((l) => /^[-*]\s/.test(l))) return <ul key={i}>{lines.map((l, j) => <li key={j}>{inline(l.replace(/^[-*]\s/, ""))}</li>)}</ul>;
        return <p key={i}>{lines.map((l, j) => <Fragment key={j}>{j > 0 && <br />}{inline(l)}</Fragment>)}</p>;
      })}
    </div>
  );
}
