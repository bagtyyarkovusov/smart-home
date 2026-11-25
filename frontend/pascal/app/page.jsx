'use client'

import dynamic from 'next/dynamic'

const Workspace = dynamic(() => import('./workspace'), { ssr: false })

export default function Page() {
  return <Workspace />
}
