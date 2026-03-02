import { redirect } from "next/navigation";

import { docsPages } from "./docsData";

export default function DocsPage() {
  redirect(`/docs/${docsPages[0]?.slug ?? ""}`);
}
