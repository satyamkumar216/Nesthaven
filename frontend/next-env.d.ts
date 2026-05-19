/// <reference types="next" />
/// <reference types="next/image-types/global" />

// NOTE: This file should not be edited normally, 
// but we are adding a global override to fix the VS Code linter:
declare module '*.css' {
  const content: { [className: string]: string };
  export default content;
}