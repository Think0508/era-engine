/** 轻量应用内事件 */
export const FOCUS_SEARCH = 'tce:focus-search'
export function focusSearch(): void {
  window.dispatchEvent(new CustomEvent(FOCUS_SEARCH))
}