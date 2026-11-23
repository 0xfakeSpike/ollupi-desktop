/** A model's own name, without the provider in front ("deepseek/deepseek-flash"
 * → "deepseek-flash"): the first layer names the model only (DESIGN.md 2.3). */
export function modelName(connection: string): string {
  const slash = connection.indexOf('/')
  return slash < 0 ? connection : connection.slice(slash + 1)
}

/** The provider in front of a connection ("deepseek/deepseek-flash" →
 * "deepseek"), the empty string when it has none. */
export function providerOf(connection: string): string {
  const slash = connection.indexOf('/')
  return slash < 0 ? '' : connection.slice(0, slash)
}
