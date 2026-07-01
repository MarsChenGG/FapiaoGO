import { useState, useCallback, useEffect, useRef } from 'react'
import { applySort } from '../utils'

export function useSort(setFiles) {
  const [sortBy, setSortBy] = useState(() => {
    try { return localStorage.getItem('invoiceSortBy') || 'fileName' }
    catch { return 'fileName' }
  })
  const [sortOrder, setSortOrder] = useState(() => {
    try { return localStorage.getItem('invoiceSortOrder') || 'asc' }
    catch { return 'asc' }
  })

  const sortByRef = useRef(sortBy)
  const sortOrderRef = useRef(sortOrder)

  useEffect(() => { sortByRef.current = sortBy }, [sortBy])
  useEffect(() => { sortOrderRef.current = sortOrder }, [sortOrder])

  const toggleSort = useCallback((field) => {
    if (sortBy === field) {
      const newOrder = sortOrder === 'asc' ? 'desc' : 'asc'
      setSortOrder(newOrder)
      try { localStorage.setItem('invoiceSortOrder', newOrder) } catch {}
    } else {
      setSortBy(field)
      setSortOrder('asc')
      try {
        localStorage.setItem('invoiceSortBy', field)
        localStorage.setItem('invoiceSortOrder', 'asc')
      } catch {}
    }
  }, [sortBy, sortOrder])

  useEffect(() => {
    setFiles(current => {
      if (current.length <= 1) return current
      return applySort(current, sortBy, sortOrder)
    })
  }, [sortBy, sortOrder, setFiles])

  return {
    sortBy, sortOrder,
    toggleSort,
    sortByRef, sortOrderRef,
  }
}
