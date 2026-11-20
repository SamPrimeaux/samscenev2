// The studio is mounted at "/" in local dev and under a prefix (e.g. "/samscene/") when published.
// Everything that points at the server or at static media goes through u() so both work.
const BASE = (((import.meta as unknown as { env?: { BASE_URL?: string } }).env?.BASE_URL) ?? '/').replace(/\/$/, '');
export const u = (path: string): string => BASE + path;
