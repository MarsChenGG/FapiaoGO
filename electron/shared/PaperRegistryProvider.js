/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║  PaperRegistryProvider — Runtime Paper Registry                 ║
 * ║                                                                  ║
 * ║  Single runtime source for all paper data (system + user).        ║
 * ║  All consumers must read through this provider.                   ║
 * ║                                                                  ║
 * ║  Usage:                                                           ║
 * ║    await PaperRegistryProvider.initialize()                       ║
 * ║    const papers = PaperRegistryProvider.getEffectiveRegistry()    ║
 * ║    const map = PaperRegistryProvider.getEffectivePaperMap()       ║
 * ║    const labels = PaperRegistryProvider.getEffectiveLabelMap()   ║
 * ╚══════════════════════════════════════════════════════════════════╝
 */

'use strict'

const { buildEffectiveRegistry, SYSTEM_PAPERS } = require('./paper-registry')
const UserPaperStore = require('./UserPaperStore')

// ─── Cache ───────────────────────────────────────────────────────

let _cachedEffective = null
let _cachedSizeMap = null
let _cachedLabelMap = null
let _initialized = false

// ─── Internal ────────────────────────────────────────────────────

function rebuildCache() {
  // Load fresh user papers from store
  // Note: UserPaperStore.load() reads from disk. For startup, we already loaded.
  // For runtime refresh, we reload.
  throw new Error('Use initialize() or refresh() to rebuild cache')
}

function buildMaps(effectivePapers) {
  const sizeMap = {}
  const labelMap = {}
  for (const p of effectivePapers) {
    sizeMap[p.id] = { widthMM: p.widthMM, heightMM: p.heightMM }
    labelMap[p.id] = p.label
  }
  return { sizeMap, labelMap }
}

// ─── Provider API ───────────────────────────────────────────────

const PaperRegistryProvider = {
  /**
   * Current cache state.
   */
  get initialized() { return _initialized },

  /**
   * Number of system papers.
   */
  get systemCount() { return SYSTEM_PAPERS.length },

  /**
   * Number of user papers.
   */
  get userCount() {
    if (!_cachedEffective) return 0
    return _cachedEffective.filter(p => p.source === 'user').length
  },

  /**
   * Total effective papers (system + user).
   */
  get effectiveCount() {
    return _cachedEffective ? _cachedEffective.length : 0
  },

  /**
   * Initialize the provider at app startup.
   * Loads user papers from disk, builds effective registry.
   *
   * Should be called once during app bootstrap, before any consumer reads papers.
   */
  async initialize() {
    console.log('[PAPER_REGISTRY] Initializing...')
    const userPapers = await UserPaperStore.load()
    _cachedEffective = buildEffectiveRegistry(userPapers)
    const maps = buildMaps(_cachedEffective)
    _cachedSizeMap = maps.sizeMap
    _cachedLabelMap = maps.labelMap
    _initialized = true
    console.log(`[PAPER_REGISTRY] system=${SYSTEM_PAPERS.length}, user=${userPapers.length}, effective=${_cachedEffective.length}`)
  },

  /**
   * Refresh the effective registry from disk.
   * Called after user creates/updates/deletes a paper.
   */
  async refresh() {
    console.log('[PAPER_REGISTRY] Refreshing...')
    const userPapers = await UserPaperStore.load()
    _cachedEffective = buildEffectiveRegistry(userPapers)
    const maps = buildMaps(_cachedEffective)
    _cachedSizeMap = maps.sizeMap
    _cachedLabelMap = maps.labelMap
    console.log(`[PAPER_REGISTRY] Refreshed: effective=${_cachedEffective.length}`)
  },

  /**
   * Get the effective registry array (system + user papers merged).
   * @returns {Array} Paper[]
   */
  getEffectiveRegistry() {
    if (!_cachedEffective) {
      // Fallback: return system-only if not initialized
      console.warn('[PAPER_REGISTRY] Not initialized, returning system-only papers')
      return [...SYSTEM_PAPERS]
    }
    return [..._cachedEffective]
  },

  /**
   * Get the effective paper size map: { id → { widthMM, heightMM } }
   * @returns {object}
   */
  getEffectivePaperMap() {
    if (!_cachedSizeMap) {
      // Fallback
      const map = {}
      for (const p of SYSTEM_PAPERS) {
        map[p.id] = { widthMM: p.widthMM, heightMM: p.heightMM }
      }
      return map
    }
    return { ..._cachedSizeMap }
  },

  /**
   * Get the effective label map: { id → label }
   * @returns {object}
   */
  getEffectiveLabelMap() {
    if (!_cachedLabelMap) {
      const map = {}
      for (const p of SYSTEM_PAPERS) {
        map[p.id] = p.label
      }
      return map
    }
    return { ..._cachedLabelMap }
  },

  /**
   * Get a specific paper by id from the effective registry.
   * @param {string} id
   * @returns {object|undefined}
   */
  getPaperById(id) {
    const registry = this.getEffectiveRegistry()
    return registry.find(p => p.id === id)
  },

  /**
   * Resolve paper dimensions from settings object.
   *
   * Unified resolution point for both Preview and Print paths.
   * No other function in the system should duplicate this branching logic.
   *
   * @param {object} settings - { paperSize, customPaper? }
   * @returns {{ widthMM: number, heightMM: number, source: 'registry' | 'custom' }}
   */
  resolvePaperDimensionsFromSettings(settings) {
    const paperSize = settings?.paperSize || 'A4'

    // Runtime custom paper: use settings.customPaper dimensions
    if (paperSize === 'Custom' && settings?.customPaper) {
      const w = settings.customPaper.widthMM
      const h = settings.customPaper.heightMM
      if (typeof w === 'number' && typeof h === 'number' && !isNaN(w) && !isNaN(h)) {
        console.log(`[CUSTOM_PAPER] width=${w}mm, height=${h}mm`)
        return { widthMM: w, heightMM: h, source: 'custom' }
      }
    }

    // Standard paper: use effective registry
    const map = this.getEffectivePaperMap()
    const dims = map[paperSize]
    if (dims) {
      return { widthMM: dims.widthMM, heightMM: dims.heightMM, source: 'registry' }
    }

    // Unknown → A4 fallback
    console.warn(`[PAPER_REGISTRY] Unknown paper "${paperSize}", falling back to A4`)
    return { widthMM: 210, heightMM: 297, source: 'registry' }
  },

  /**
   * Resolve paper dimensions to CSS strings.
   * Convenience wrapper around resolvePaperDimensionsFromSettings.
   *
   * @param {object} settings - { paperSize, customPaper? }
   * @returns {{ width: string, height: string }}
   */
  resolvePaperDimensions(settings) {
    const { widthMM, heightMM } = this.resolvePaperDimensionsFromSettings(settings)
    return {
      width: `${widthMM}mm`,
      height: `${heightMM}mm`,
    }
  },

  /**
   * UserPaperStore reference for create/update/delete operations.
   * Direct access, always refresh() after mutations.
   */
  store: UserPaperStore,
}

module.exports = { PaperRegistryProvider }
