/** A model's own name, without the provider in front ("deepseek/deepseek-flash"
 * → "deepseek-flash"): the first layer names the model only (DESIGN.md 2.3). */
export function modelName(connection: string): string {
  const slash = connection.indexOf('/')
  return slash < 0 ? connection : connection.slice(slash + 1)
}
