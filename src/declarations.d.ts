/**
 * TypeScript declarations for non-standard imports
 */

// Import .txt files as raw strings
declare module '*.txt' {
  const content: string;
  export default content;
}
