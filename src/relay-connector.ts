/**
 * Outbound WSS connector to the untrusted relay (docs/tunnel-protocol.md §1,
 * relay/PROTOCOL.md). Joins `<relayUrl>/r/<room>?role=host` and retries with
 * exponential backoff (500 ms → ×2 → 10 s cap, reset on each connect) while
 * shouldRetry() holds — the caller wires that to the offer window extended by
 * live resume tokens (README §M3 interpretations).
 *
 * Socket ownership: a connected socket is handed to the session layer via
 * onSocket. {@link RelayConnector.close} stops retries and closes the current
 * socket so revoke, endpoint migration, and plugin reload can vacate the room.
 */
import WebSocket from 'ws'

/** Connector construction options. */
export interface RelayConnectorOptions {
  /** Relay WSS base URL (no room suffix). */
  relayUrl: string
  /** Room id from the relay-mode offer. */
  room: string
  /** Retry predicate, consulted after every disconnect. */
  shouldRetry: () => boolean
  /** Called once per established socket. close() still terminates this socket. */
  onSocket: (ws: WebSocket) => void
  /** Optional status logger. */
  logger?: (msg: string) => void
}

/** A running connector. */
export interface RelayConnector {
  /** @returns whether the connector is still live (not closed). */
  readonly active: boolean
  /** Stop retrying and close the current host-role socket, including after handoff. */
  close(): void
}

const BACKOFF_MIN_MS = 500
const BACKOFF_MAX_MS = 10_000

/**
 * Create and immediately start a connector.
 * @param options - see {@link RelayConnectorOptions}.
 * @returns the connector handle.
 */
export function createRelayConnector(options: RelayConnectorOptions): RelayConnector {
  const url = options.relayUrl.replace(/\/+$/, '') + '/r/' + options.room + '?role=host'
  let closed = false
  let attempts = 0
  let current: WebSocket | null = null
  let timer: ReturnType<typeof setTimeout> | null = null
  let pingTimer: ReturnType<typeof setInterval> | null = null

  const log = (msg: string): void => options.logger?.(msg)

  const stopPing = (): void => {
    if (pingTimer === null) return
    clearInterval(pingTimer)
    pingTimer = null
  }

  const connect = (): void => {
    if (closed) return
    const ws = new WebSocket(url)
    current = ws
    ws.on('open', () => {
      attempts = 0
      log('relay connector: connected to room ' + options.room.slice(0, 8) + '…')
      stopPing()
      pingTimer = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) ws.ping()
      }, 25_000)
      pingTimer.unref()
      options.onSocket(ws)
    })
    ws.on('error', () => {}) // a close event always follows; retry logic lives there
    ws.on('close', (code: number) => {
      stopPing()
      if (current === ws) current = null
      if (closed) return
      if (!options.shouldRetry()) {
        closed = true
        log('relay connector: pairing window ended, stopping')
        return
      }
      const delay = Math.min(BACKOFF_MAX_MS, BACKOFF_MIN_MS * 2 ** attempts++)
      log('relay connector: disconnected (' + code + '), retry in ' + delay + 'ms')
      timer = setTimeout(connect, delay)
      timer.unref()
    })
  }
  connect()

  return {
    get active() {
      return !closed
    },
    close() {
      closed = true
      if (timer !== null) clearTimeout(timer)
      stopPing()
      if (current !== null) current.close()
      current = null
    },
  }
}
