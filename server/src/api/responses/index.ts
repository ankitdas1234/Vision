export function ok<T>(result: T) { return { success: true, result }; }
export function fail(code: string, message: string) { return { success: false, error: { code, message } }; }
