import { useEffect, useRef, useState } from 'react'
import { projectFrame, updateCommand } from './device-projection.mjs'
import { deviceId } from './scene.mjs'

export const api = process.env.NEXT_PUBLIC_EVALUATION_API || 'http://127.0.0.1:8160'
const commands = `${api}/api/devices/${deviceId}/commands`
const socketUrl = new URL('/api/ws', api)
socketUrl.protocol = socketUrl.protocol === 'https:' ? 'wss:' : 'ws:'

export function useLamp() {
  const [projection, setProjection] = useState({ state: null, streamRevision: -1 })
  const [command, setCommand] = useState(null)
  const [link, setLink] = useState('connecting')
  const [paused, setPaused] = useState(false)
  const [error, setError] = useState('')
  const inFlight = useRef(null)

  function receiveCommand(incoming) {
    if (inFlight.current?.requestId === incoming.requestId && incoming.status !== 'pending') {
      inFlight.current = null
    }
    setCommand((current) => updateCommand(current, incoming))
  }

  useEffect(() => {
    if (paused) {
      setLink('paused')
      return
    }

    let disposed = false
    let socket
    let reconnect
    async function recover(requestId) {
      try {
        const response = await fetch(`${commands}/${encodeURIComponent(requestId)}`, { cache: 'no-store' })
        if (!response.ok) throw new Error(`Command lookup HTTP ${response.status}`)
        const recovered = await response.json()
        if (!disposed) receiveCommand(recovered)
      } catch (failure) {
        if (!disposed) setError(failure.message)
      }
    }

    function connect() {
      setLink('connecting')
      socket = new WebSocket(socketUrl)
      socket.onmessage = ({ data }) => {
        if (disposed) return
        const frame = JSON.parse(data)
        setProjection((current) => projectFrame(current, frame))
        if (frame.command) receiveCommand(frame.command)
        if (frame.type === 'snapshot') {
          setLink('connected')
          const pending = inFlight.current
          if (pending?.accepted) void recover(pending.requestId)
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

  async function requestPower(value) {
    if (inFlight.current) return
    const requestId = crypto.randomUUID()
    inFlight.current = { requestId, accepted: false }
    setCommand({ requestId, status: 'pending' })
    setError('')
    try {
      const response = await fetch(commands, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId, capability: 'power', value }),
      })
      if (!response.ok) throw new Error(`Power request HTTP ${response.status}`)
      receiveCommand(await response.json())
      if (inFlight.current?.requestId === requestId) {
        inFlight.current.accepted = true
        // A reconnect snapshot may have arrived while the HTTP request was in flight.
        // This lookup closes that race without replaying the command.
        const lookup = await fetch(`${commands}/${requestId}`, { cache: 'no-store' })
        if (lookup.ok) receiveCommand(await lookup.json())
      }
    } catch (failure) {
      setError(failure.message)
      if (inFlight.current?.requestId === requestId && !inFlight.current.accepted) {
        inFlight.current = null
        setCommand(null)
      }
    }
  }

  return { state: projection.state, command, requestPower, paused, setPaused, link, error }
}
