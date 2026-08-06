export function createSerialQueue(): <T>(work: () => Promise<T>) => Promise<T> {
  let chain: Promise<unknown> = Promise.resolve()

  return (work) => {
    const next = chain.then(work, work)
    chain = next.catch(() => {})
    return next
  }
}
