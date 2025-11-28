import { useEffect, useState, useCallback } from 'react'
import { MasterDataService } from '../lib/mes-service'

const MD_CHANGED_EVENT = 'master-data:changed'
const MD_INVALIDATED_EVENT = 'master-data:invalidated'

export function useMasterDataCache() {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (force = false) => {
    try {
      setLoading(true)
      setError(null)
      const d = await MasterDataService.getMasterData(force)
      setData(d)
    } catch (e: any) {
      setError(e?.message || 'master data error')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load(false)
    const onChange = () => load(true)
    const onInvalidate = () => load(true)
    try {
      window.addEventListener(MD_CHANGED_EVENT, onChange)
      window.addEventListener(MD_INVALIDATED_EVENT, onInvalidate)
    } catch {}
    return () => {
      try {
        window.removeEventListener(MD_CHANGED_EVENT, onChange)
        window.removeEventListener(MD_INVALIDATED_EVENT, onInvalidate)
      } catch {}
    }
  }, [load])

  return { data, loading, error, refresh: () => load(true) }
}

