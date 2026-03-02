export type MarkdownBlock =
  | { type: "heading"; level: 2 | 3; text: string; id: string }
  | { type: "paragraph"; text: string }
  | { type: "list"; items: string[] }
  | { type: "code"; language: string; code: string }
  | { type: "callout"; text: string };

export type MarkdownSection = {
  id: string;
  level: 2 | 3;
  title: string;
  blocks: MarkdownBlock[];
};

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export function parseMarkdown(markdown: string) {
  const lines = markdown.split("\n");
  const blocks: MarkdownBlock[] = [];
  let i = 0;
  const idCounts = new Map<string, number>();

  const isHeading = (line: string) => /^#{2,3}\s+/.test(line);
  const isListItem = (line: string) => /^[-*]\s+/.test(line);
  const isCallout = (line: string) => /^>\s+/.test(line);
  const isCodeFence = (line: string) => line.trim().startsWith("```");
  const getUniqueId = (baseId: string) => {
    const nextCount = (idCounts.get(baseId) ?? 0) + 1;
    idCounts.set(baseId, nextCount);
    return nextCount === 1 ? baseId : `${baseId}-${nextCount}`;
  };

  while (i < lines.length) {
    const line = lines[i];
    if (!line || !line.trim()) {
      i += 1;
      continue;
    }

    if (isCodeFence(line)) {
      const language = line.trim().slice(3).trim() || "javascript";
      i += 1;
      const codeLines: string[] = [];
      while (i < lines.length && !isCodeFence(lines[i])) {
        codeLines.push(lines[i]);
        i += 1;
      }
      i += 1;
      blocks.push({
        type: "code",
        language,
        code: codeLines.join("\n"),
      });
      continue;
    }

    if (isHeading(line)) {
      const match = line.match(/^(#{2,3})\s+(.*)$/);
      if (match) {
        const level = match[1].length === 2 ? 2 : 3;
        const text = match[2].trim();
        const baseId = slugify(text);
        const uniqueId = getUniqueId(baseId);
        blocks.push({
          type: "heading",
          level,
          text,
          id: uniqueId,
        });
      }
      i += 1;
      continue;
    }

    if (isCallout(line)) {
      const calloutLines: string[] = [];
      while (i < lines.length && isCallout(lines[i])) {
        calloutLines.push(lines[i].replace(/^>\s+/, ""));
        i += 1;
      }
      blocks.push({
        type: "callout",
        text: calloutLines.join(" ").trim(),
      });
      continue;
    }

    if (isListItem(line)) {
      const items: string[] = [];
      while (i < lines.length && isListItem(lines[i])) {
        items.push(lines[i].replace(/^[-*]\s+/, "").trim());
        i += 1;
      }
      blocks.push({ type: "list", items });
      continue;
    }

    const paragraphLines: string[] = [];
    while (
      i < lines.length &&
      lines[i] &&
      lines[i].trim() &&
      !isHeading(lines[i]) &&
      !isListItem(lines[i]) &&
      !isCallout(lines[i]) &&
      !isCodeFence(lines[i])
    ) {
      paragraphLines.push(lines[i].trim());
      i += 1;
    }
    blocks.push({ type: "paragraph", text: paragraphLines.join(" ") });
  }

  const sections: MarkdownSection[] = [];
  let current: MarkdownSection | null = null;

  blocks.forEach((block) => {
    if (block.type === "heading") {
      current = {
        id: block.id,
        level: block.level,
        title: block.text,
        blocks: [],
      };
      sections.push(current);
      return;
    }
    if (!current) {
      const baseId = "overview";
      const uniqueId = getUniqueId(baseId);
      current = {
        id: uniqueId,
        level: 2,
        title: "Overview",
        blocks: [],
      };
      sections.push(current);
    }
    current.blocks.push(block);
  });

  const tocItems = sections.map((section) => ({
    label: section.title,
    href: `#${section.id}`,
  }));

  return {
    sections,
    tocItems,
  };
}
