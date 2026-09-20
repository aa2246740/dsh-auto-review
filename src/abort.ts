/** Race even non-cooperative providers/answerers; a late result can never become a grant. */
export function abortable<T>(signal: AbortSignal | undefined, operation: () => Promise<T>): Promise<T> {
  if (signal?.aborted === true) return Promise.reject(signal.reason ?? new Error('cancelled'))
  if (signal === undefined) return Promise.resolve().then(operation)
  return new Promise<T>((resolve, reject) => {
    const onAbort = (): void => {
      signal.removeEventListener('abort', onAbort)
      reject(signal.reason ?? new Error('cancelled'))
    }
    signal.addEventListener('abort', onAbort, { once: true })
    void Promise.resolve().then(() => {
      if (signal.aborted) throw signal.reason ?? new Error('cancelled')
      return operation()
    }).then(value => {
      signal.removeEventListener('abort', onAbort)
      if (signal.aborted) reject(signal.reason ?? new Error('cancelled'))
      else resolve(value)
    }, error => {
      signal.removeEventListener('abort', onAbort)
      reject(error)
    })
  })
}
