export function uiBase(): string {
  return (process.env.UI_BASE_URL || 'http://localhost:3000').replace(/\/+$/, '');
}
