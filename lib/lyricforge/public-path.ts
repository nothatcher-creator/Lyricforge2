export const APP_BASE_PATH = "/Lyricforge2";

export function publicPath(path: string, pathname?: string): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  if (normalized === APP_BASE_PATH || normalized.startsWith(`${APP_BASE_PATH}/`)) return normalized;
  const currentPath = pathname ?? (typeof window !== "undefined" ? window.location.pathname : APP_BASE_PATH);
  return currentPath === APP_BASE_PATH || currentPath.startsWith(`${APP_BASE_PATH}/`)
    ? `${APP_BASE_PATH}${normalized}`
    : normalized;
}
