declare module "prismjs" {
  const Prism: {
    highlight: (code: string, grammar: unknown, language: string) => string;
    languages: Record<string, unknown>;
  };
  export default Prism;
}

declare module "prismjs/components/prism-javascript";
