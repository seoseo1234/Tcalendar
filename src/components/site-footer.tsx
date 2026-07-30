"use client";

import { ExternalLink, FileText, ShieldCheck } from "lucide-react";
import { Fragment, useState, type ReactNode } from "react";
import { Modal } from "./modal";

type LegalDocument = "terms" | "privacy" | null;

export function SiteFooter({ terms, privacy }: { terms: string; privacy: string }) {
  const [openDocument, setOpenDocument] = useState<LegalDocument>(null);

  return (
    <>
      <footer className="site-footer">
        <div className="site-footer-inner">
          <p>© 2026 seostudio. All rights reserved.</p>
          <nav aria-label="법적 고지">
            <button type="button" onClick={() => setOpenDocument("terms")}>이용약관</button>
            <i aria-hidden="true" />
            <button type="button" onClick={() => setOpenDocument("privacy")}>개인정보처리방침</button>
          </nav>
          <p className="privacy-manager"><ShieldCheck />개인정보 보호책임자: 윤서희 교사 (서울잠동초등학교)<span>|</span>문의: 02-419-5464</p>
        </div>
      </footer>

      <Modal
        title={openDocument === "terms" ? "T-Calendar 이용약관" : "T-Calendar 개인정보처리방침"}
        open={Boolean(openDocument)}
        onClose={() => setOpenDocument(null)}
        wide
      >
        <div className="legal-modal-body">
          <div className="legal-document-heading">
            {openDocument === "terms" ? <FileText /> : <ShieldCheck />}
            <div>
              <strong>{openDocument === "terms" ? "이용약관" : "개인정보처리방침"}</strong>
              <small>시행일: 2026년 7월 30일</small>
            </div>
          </div>
          <article className="legal-document">
            <MarkdownDocument
              content={openDocument === "terms" ? terms : privacy}
              onOpenPrivacy={() => setOpenDocument("privacy")}
            />
          </article>
          <div className="legal-modal-actions">
            <button type="button" onClick={() => setOpenDocument(null)}>확인</button>
          </div>
        </div>
      </Modal>
    </>
  );
}

function MarkdownDocument({ content, onOpenPrivacy }: { content: string; onOpenPrivacy: () => void }) {
  const lines = content.replace(/\r/g, "").split("\n");
  const blocks: ReactNode[] = [];

  for (let index = 0; index < lines.length;) {
    const line = lines[index].trim();
    if (!line) {
      index += 1;
      continue;
    }

    const heading = /^(#{1,3})\s+(.+)$/.exec(line);
    if (heading) {
      const level = heading[1].length;
      const children = renderInline(heading[2], onOpenPrivacy);
      blocks.push(level === 1 ? <h1 key={index}>{children}</h1> : level === 2 ? <h2 key={index}>{children}</h2> : <h3 key={index}>{children}</h3>);
      index += 1;
      continue;
    }

    if (line.startsWith("|") && index + 1 < lines.length && /^\s*\|?[\s:|-]+\|/.test(lines[index + 1])) {
      const rows: string[][] = [];
      const headers = splitTableRow(line);
      index += 2;
      while (index < lines.length && lines[index].trim().startsWith("|")) {
        rows.push(splitTableRow(lines[index]));
        index += 1;
      }
      blocks.push(
        <div className="legal-table-wrap" key={`table-${index}`}>
          <table>
            <thead><tr>{headers.map((cell, cellIndex) => <th key={cellIndex}>{renderInline(cell, onOpenPrivacy)}</th>)}</tr></thead>
            <tbody>{rows.map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, cellIndex) => <td key={cellIndex}>{renderInline(cell, onOpenPrivacy)}</td>)}</tr>)}</tbody>
          </table>
        </div>,
      );
      continue;
    }

    const listMatch = /^(\d+\.|-)\s+(.+)$/.exec(line);
    if (listMatch) {
      const ordered = listMatch[1] !== "-";
      const items: ReactNode[] = [];
      while (index < lines.length) {
        const item = /^(\d+\.|-)\s+(.+)$/.exec(lines[index].trim());
        if (!item || (item[1] !== "-") !== ordered) break;
        items.push(<li key={index}>{renderInline(item[2], onOpenPrivacy)}</li>);
        index += 1;
      }
      blocks.push(ordered ? <ol key={`list-${index}`}>{items}</ol> : <ul key={`list-${index}`}>{items}</ul>);
      continue;
    }

    const paragraph: string[] = [line];
    index += 1;
    while (index < lines.length) {
      const next = lines[index].trim();
      if (!next || /^#{1,3}\s/.test(next) || /^(\d+\.|-)\s+/.test(next) || next.startsWith("|")) break;
      paragraph.push(next);
      index += 1;
    }
    blocks.push(<p key={`paragraph-${index}`}>{renderInline(paragraph.join(" "), onOpenPrivacy)}</p>);
  }

  return <>{blocks}</>;
}

function splitTableRow(line: string) {
  return line.replace(/^\||\|$/g, "").split("|").map((cell) => cell.trim());
}

function renderInline(text: string, onOpenPrivacy: () => void) {
  const tokens = text.split(/(\[[^\]]+\]\([^)]+\)|`[^`]+`|\*\*[^*]+\*\*)/g).filter(Boolean);
  return tokens.map((token, index) => {
    const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(token);
    if (link) {
      if (link[2].includes("개인정보처리방침.md")) {
        return <button className="legal-inline-button" type="button" onClick={onOpenPrivacy} key={index}>{link[1]}</button>;
      }
      return <a href={link[2]} target="_blank" rel="noreferrer" key={index}>{link[1]}<ExternalLink /></a>;
    }
    if (token.startsWith("`") && token.endsWith("`")) return <code key={index}>{token.slice(1, -1)}</code>;
    if (token.startsWith("**") && token.endsWith("**")) return <strong key={index}>{token.slice(2, -2)}</strong>;
    return <Fragment key={index}>{token}</Fragment>;
  });
}
