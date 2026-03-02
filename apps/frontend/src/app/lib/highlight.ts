import Prism from "prismjs";
import "prismjs/components/prism-javascript";

export function highlightCode(code: string) {
  return Prism.highlight(code, Prism.languages.javascript, "javascript");
}
