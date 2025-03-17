/// <reference types="vite/client" />

declare namespace NodeJS {
  // Using a non-empty interface definition
  interface Timeout {
    _timeoutId: number;
  }
}
