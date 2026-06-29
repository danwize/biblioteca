const endpoint = import.meta.env.VITE_GRAPHQL_URL ?? '/graphql'

export async function graphqlRequest<TData>(query: string, variables?: Record<string, unknown>): Promise<TData> {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables })
  })

  if (!response.ok) {
    throw new Error(`GraphQL request failed with ${response.status}`)
  }

  const payload = await response.json()
  if (payload.errors?.length) {
    throw new Error(payload.errors.map((error: { message: string }) => error.message).join('\n'))
  }

  return payload.data
}
