import type { ReactNode } from "react";
import { iconKind } from "./file-kind";

export function FolderIcon({ open }: { open: boolean }) {
  return (
    <svg className={open ? "ftype folder open" : "ftype folder"} viewBox="0 0 16 16" aria-hidden="true">
      {open ? (
        <path fill="currentColor" d="M1.4 6.1h13.2v6.4c0 .6-.5 1-1 1H2.4c-.6 0-1-.4-1-1V6.1zM1.4 4.6h4.3l1.1 1.3H1.4V4.6z" />
      ) : (
        <path fill="currentColor" d="M1.5 3.3h4.6l1.2 1.4h7.2c.5 0 .9.4.9.9v7.1c0 .5-.4.9-.9.9H2.4c-.5 0-.9-.4-.9-.9V3.3z" />
      )}
    </svg>
  );
}

export function FileIcon({ name }: { name: string }) {
  const kind = iconKind(name);
  return (
    <svg className={`ftype ${kind}`} viewBox="0 0 16 16" aria-hidden="true">
      {glyph(kind)}
    </svg>
  );
}

function glyph(kind: string): ReactNode {
  switch (kind) {
    case "typescript":
      return tile("TS");
    case "tsx":
      return tile("TS");
    case "javascript":
      return tile("JS");
    case "jsx":
      return tile("JS");
    case "json":
      return tile("{}");
    case "markdown":
      return tile("M");
    case "css":
      return tile("#");
    case "html":
      return tile("<>");
    case "python":
      return tile("PY");
    case "shell":
      return tile(">_");
    case "yaml":
      return tile("Y");
    case "go":
      return tile("GO");
    case "rust":
      return tile("RS");
    case "image":
      return image();
    default:
      return documentShape();
  }
}

function tile(letters: string): ReactNode {
  return (
    <>
      <rect x="1" y="1" width="14" height="14" rx="2" fill="currentColor" />
      <text
        x="8"
        y="11.3"
        textAnchor="middle"
        fontSize={letters.length > 2 ? 5 : 6.4}
        fontFamily="ui-sans-serif, system-ui, sans-serif"
        fontWeight="700"
        className="mark"
      >
        {letters}
      </text>
    </>
  );
}

function documentShape(): ReactNode {
  return (
    <path
      fill="none"
      stroke="currentColor"
      strokeWidth="1.2"
      d="M3.3 1.6h5.7L12.7 5.2V14H3.3V1.6zM8.9 1.8v3.5h3.6"
    />
  );
}

function image(): ReactNode {
  return (
    <>
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
        d="M2.2 2.4h11.6v11.2H2.2z"
      />
      <circle cx="5.4" cy="5.6" r="1.1" fill="currentColor" />
      <path fill="currentColor" d="M3.2 12.2l3.1-3.2 1.8 1.7 2.2-2.4 2.5 3.9H3.2z" />
    </>
  );
}
