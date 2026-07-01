/**
 * Render Model Builder — Contract Layer (Step 3.4)
 *
 * Transforms raw file/DTO objects + layout config into a RenderModel.
 * The RenderModel is the ONLY accepted input for printRenderer.js.
 *
 * Data flow:
 *   InvoiceDTO (file object + loaded binary)
 *       ↓
 *   buildRenderModel(dto, layoutConfig)
 *       ↓
 *   RenderModel (immutable, self-contained)
 *       ↓
 *   printRenderer.renderPrintContent(renderModel)
 *
 * ❌ This module MUST NOT:
 *   - Access hook state
 *   - Call IPC
 *   - Render anything
 *   - Submit print jobs
 *
 * ✅ This module ONLY:
 *   - Validates input completeness
 *   - Builds a normalized RenderModel
 */

import { validateRenderModel } from './renderModelValidator'

// ═══════════════════════════════════════════════════════════
// RenderModel Type Contract
// ═══════════════════════════════════════════════════════════
/**
 * @typedef {Object} RenderModel
 *
 * @property {Array<RenderSlot>} slots    - Ordered render slots
 * @property {Object}            layout   - Layout configuration
 * @property {string}            layout.paperSize   - Paper size key ('A4', 'A5', etc.)
 * @property {boolean}           layout.landscape    - Orientation flag
 * @property {Object}            layout.rotations    - Rotation map { [key]: degrees }
 * @property {number}            layout.slotCount    - Number of slots on paper
 * @property {string}            layout.strategy     - Layout strategy ('vertical', 'grid')
 *
 * @typedef {Object} RenderSlot
 * @property {string}          key          - Unique file key
 * @property {string}          name         - Display name
 * @property {string}          fileFormat   - Format: 'pdf' | 'ofd' | 'image'
 * @property {Uint8Array|null} pdfData      - PDF binary (for PDF files)
 * @property {string|null}     imageUrl     - Blob URL for image/ofd rendering
 */

// ═══════════════════════════════════════════════════════════
// buildRenderModel — Pure builder
// ═══════════════════════════════════════════════════════════
/**
 * Build a RenderModel from loaded file data + layout config.
 *
 * Pure function: same input → same output.
 * No side effects.
 *
 * @param {Object} dto - Data Transfer Object
 * @param {Array}  dto.items - Loaded items: [{ key, name, fileFormat, pdfData?, imageUrl? }]
 * @param {Object} layoutConfig - Layout parameters
 * @param {string} layoutConfig.paperSize
 * @param {boolean} layoutConfig.landscape
 * @param {Object} layoutConfig.rotations
 * @param {number} layoutConfig.slotCount
 * @param {string} [layoutConfig.strategy='vertical']
 * @returns {RenderModel} Frozen RenderModel
 */
export function buildRenderModel(dto, layoutConfig) {
  // ── Validate DTO ──
  if (!dto || !Array.isArray(dto.items) || dto.items.length === 0) {
    console.error('[buildRenderModel] Invalid DTO: items array is required and must be non-empty')
    return null
  }

  // ── Validate layout ──
  if (!layoutConfig || !layoutConfig.paperSize) {
    console.error('[buildRenderModel] Invalid layoutConfig: paperSize is required')
    return null
  }

  // ── Normalize slots ──
  const slots = dto.items.map(item => ({
    key: item.key || 'unknown',
    name: item.name || 'unnamed',
    fileFormat: item.fileFormat || 'pdf',
    pdfData: item.pdfData || null,
    imageUrl: item.imageUrl || null,
  }))

  // ── Build frozen model ──
  const model = Object.freeze({
    slots: Object.freeze(slots),
    layout: Object.freeze({
      paperSize: layoutConfig.paperSize,
      landscape: Boolean(layoutConfig.landscape),
      rotations: Object.freeze(layoutConfig.rotations || {}),
      slotCount: Number(layoutConfig.slotCount) || 1,
      strategy: layoutConfig.strategy || 'vertical',
    }),
  })

  // ── Internal validation (defense-in-depth) ──
  const result = validateRenderModel(model)
  if (!result.valid) {
    console.error('[buildRenderModel] Built model failed validation:', result.errors)
    return null
  }

  return model
}
