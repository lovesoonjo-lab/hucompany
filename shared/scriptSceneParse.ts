/**
 * Parse structured scene blocks from a shopping-shorts style script.
 * Used by the client UI and by video generation on the server so behaviour stays in sync.
 */

export interface ParsedSceneFields {
  audio: string;
  subtitle: string;
  imagePrompt: string;
  videoAction: string;
}

function splitSceneBlocks(script: string): { index: number; text: string }[] {
  if (!script) return [];
  const lines = script.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");

  const blocks: { index: number; lines: string[] }[] = [];
  let current: { index: number; lines: string[] } | null = null;

  for (const line of lines) {
    const headerMatch = line.match(/(?:scene|장면)\s*(\d+)/i);
    if (headerMatch) {
      if (current) blocks.push(current);
      current = { index: parseInt(headerMatch[1], 10), lines: [line] };
    } else if (current) {
      current.lines.push(line);
    }
  }
  if (current) blocks.push(current);

  return blocks.map(b => ({ index: b.index, text: b.lines.join("\n") }));
}

export function parseSceneFields(script: string, sceneIndex: number): ParsedSceneFields {
  const empty: ParsedSceneFields = { audio: "", subtitle: "", imagePrompt: "", videoAction: "" };
  if (!script) return empty;

  const blocks = splitSceneBlocks(script);
  const block = blocks.find(b => b.index === sceneIndex);
  if (!block) return empty;

  const getField = (keyPattern: RegExp): string => {
    for (const line of block.text.split("\n")) {
      const m = line.match(keyPattern);
      if (m) {
        return m[1].replace(/^[\s"'""\u201c\u201d]+|[\s"'""\u201c\u201d]+$/g, "").trim();
      }
    }
    return "";
  };

  return {
    audio: getField(/오디오\s*[:：]\s*(.+)$/i),
    subtitle: getField(/자막\s*[:：]\s*(.+)$/i),
    imagePrompt: getField(/[Ii]mage\s*[Pp]rompt\s*[:：]\s*(.+)$/i),
    videoAction: getField(/[Vv]ideo\s*[Aa]ction\s*[:：]\s*(.+)$/i),
  };
}

/** Removes lines that look like a Video Action label line from a stored image prompt. */
export function stripVideoActionLines(text: string): string {
  if (!text) return "";
  return text
    .split("\n")
    .filter(line => !/[Vv]ideo\s*[Aa]ction\s*[:：]/i.test(line))
    .join("\n")
    .trim();
}
