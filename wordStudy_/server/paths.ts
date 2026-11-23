// PUBLIC_ORIGIN은 경로가 없는 출처, APP_BASE_PATH는 앱 경로로 구분한다.
export const basePath = (process.env.APP_BASE_PATH ?? '').replace(/\/$/, '');
if (basePath && !/^\/[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*$/.test(basePath)) {
  throw new Error('APP_BASE_PATH는 /enWordStudy 같은 경로여야 합니다.');
}
export const publicOrigin = new URL(process.env.PUBLIC_ORIGIN ?? 'http://localhost:43871').origin;
export const route = (path: string) => `${basePath}${path}`;
