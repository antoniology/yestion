// Prompt text is kept in plain markdown files (readable, editable, no escaping)
// and inlined into the main bundle at build time.
declare module '*?raw' {
  const content: string
  export default content
}
