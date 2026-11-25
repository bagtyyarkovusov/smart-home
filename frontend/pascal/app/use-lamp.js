import { useEffect, useRef, useState } from 'react'
import { projectFrame, updateCommand } from './device-projection.mjs'
import { deviceId } from './scene.mjs'

export const api = process.env.NEXT_PUBLIC_SMART_HOME_API || 'http://127.0.0.1:8160'
const commands = `${api}/api/devices/${deviceId}/commands`
const socketUrl = new URL('/api/ws', api)
socketUrl.protocol = socketUrl.protocol === 'https:' ? 'wss:' : 'ws:'

export function useLamp() {
  const projection = useRef({ state: null, streamRevision: -1 })
  const [state, setState] = useState(null)
  const [command, setCommand] = useState(null)
  const [link, setLink] = useState('connecting')
  const [paused, setPaused] = useState(false)
  const [error, setError] = useState('')
  const [lookupError, setLookupError] = useState('')
  const inFlight = useRef(null)

  function receiveCommand(incoming) {
    if (inFlight.current?.requestId === incoming.requestId && incoming.status !== 'pending') {
      inFlight.current = null
      setError('')
      setLookupError('')
    }
    setCommand((current) => updateCommand(current, incoming))
  }

  async function recover(pending) {
    if (!pending || inFlight.current !== pending) return
    if (!pending.accepted) {
      await submit(pending)
      return
    }
    try {
      const response = await fetch(`${commands}/${encodeURIComponent(pending.requestId)}`, {
        cache: 'no-store', signal: AbortSignal.timeout(5000),
      })
      if (!response.ok) throw new Error(`Command lookup HTTP ${response.status}`)
      const recovered = await response.json()
      if (inFlight.current !== pending) return
      setLookupError('')
      receiveCommand(recovered)
    } catch {
      if (inFlight.current === pending) {
        setLookupError('Could not check command status. Try checking again.')
      }
    }
  }

  useEffect(() => {
    if (paused) {
      setLink('paused')
      return
    }

    let disposed = false
    let socket
    let reconnect
    function connect() {
      setLink('connecting')
      socket = new WebSocket(socketUrl)
      socket.onmessage = ({ data }) => {
        if (disposed) return
        const frame = JSON.parse(data)
        const next = projectFrame(projection.current, frame)
        if (next === projection.current) return
        projection.current = next
        setState(next.state)
        if (frame.command) receiveCommand(frame.command)
        if (frame.type === 'snapshot') {
          setLink('connected')
          void recover(inFlight.current)
        }
      }
      socket.onclose = () => {
        if (disposed) return
        setLink('disconnected')
        reconnect = setTimeout(connect, 700)
      }
    }

    connect()
    return () => {
      disposed = true
      clearTimeout(reconnect)
      socket.close()
    }
  }, [paused])

  function requestPower(value) {
    if (inFlight.current) return
    const requestId = crypto.randomUUID()
    const pending = { requestId, value, accepted: false, submitting: false }
    inFlight.current = pending
    setCommand({ requestId, status: 'pending' })
    setError('')
    setLookupError('')
    void submit(pending)
  }

  async function submit(pending) {
    if (pending.submitting) return
    pending.submitting = true
    const { requestId, value } = pending
    try {
      const response = await fetch(commands, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId, capability: 'power', value }),
        signal: AbortSignal.timeout(5000),
      })
      if (inFlight.current !== pending) return
      if (response.status >= 400 && response.status < 500) {
        inFlight.current = null
        setCommand(null)
        setError(`Power request HTTP ${response.status}`)
        return
      }
      if (!response.ok) throw new Error(`Power request HTTP ${response.status}`)
      setError('')
      receiveCommand(await response.json())
      if (inFlight.current === pending) {
        pending.accepted = true
        // A reconnect snapshot may have arrived while the HTTP request was in flight.
        void recover(pending)
      }
    } catch {
      if (inFlight.current === pending) {
        setError('Could not confirm command acceptance. Check command status to retry.')
      }
    } finally {
      pending.submitting = false
    }
  }

  return {
    state, command, requestPower, paused, setPaused, link,
    error: lookupError || error,
    checkCommandStatus: () => recover(inFlight.current),
  }
}
