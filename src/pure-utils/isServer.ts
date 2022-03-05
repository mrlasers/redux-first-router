// @flow

declare global {
  interface Window {
    SSRtest: boolean;
  }
}

export default (): boolean => typeof window === "undefined" || !!window.SSRtest;
