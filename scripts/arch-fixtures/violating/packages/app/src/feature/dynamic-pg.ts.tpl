export async function loadPool(): Promise<unknown> {
  return import('pg');
}
