/**
 * Print Rendering Layer — Pure rendering functions (Step 3.3 + 3.4)
 *
 * Domain: Canvas generation + PNG buffer production
 *
 * Input contract: RenderModel (from renderModelBuilder.js)
 *   - This module NEVER accesses InvoiceDTO or raw file objects
 *   - This module ONLY operates on RenderModel
 *
 * ❌ This module MUST NOT:
 *   - Access hook state (files, settings, fileRotations)
 *   - Access InvoiceDTO or raw file objects
 *   - Call IPC directly
 *   - Submit print jobs
 *   - Make routing decisions (V2 vs legacy)
 *
 * ✅ This module ONLY:
 *   - Receives RenderModel (immutable, validated)
 *   - Maps slots → renderable items
 *   - Renders to Canvas via renderers.js
 *   - Converts Canvas → PNG Uint8Array
 *
 * Orchestrator: usePrint.js → executePrint()
 */

import { PREVIEW_DPI } from '../config'

// ═══════════════════════════════════════════════════════════
// Lazy-loaded render module (same pattern as usePrint.js)
// ═══════════════════════════════════════════════════════════
let _printRenderers = null
async function getPrintRenderers() {
  if (!_printRenderers) {
    _printRenderers = await import('../renderers')
  }
  return _printRenderers
}

// ═══════════════════════════════════════════════════════════
// Canvas → Uint8Array (PNG format)
// ═══════════════════════════════════════════════════════════
async function canvasToUint8Array(canvas) {
  if (!canvas) return null
  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png', 1.0))
  if (!blob || blob.size === 0) return null
  const buffer = await blob.arrayBuffer()
  return new Uint8Array(buffer)
}

// ═══════════════════════════════════════════════════════════
// Slot → Renderable item mapping (internal adapter)
// ═══════════════════════════════════════════════════════════
/**
 * Map RenderModel slots to the item format expected by
 * renderMultipleItemsToCanvas (legacy interface adapter).
 *
 * slot.pdfData   → item._pdfData
 * slot.imageUrl  → item._previewImageUrl
 *
 * This is the ONLY place where slot-to-item translation happens.
 */
function slotsToRenderItems(slots) {
  return slots.map(slot => {
    const item = {
      key: slot.key,
      name: slot.name,
      fileFormat: slot.fileFormat,
    }
    if (slot.pdfData) {
      item._pdfData = slot.pdfData
    }
    if (slot.imageUrl) {
      item._previewImageUrl = slot.imageUrl
    }
    return item
  })
}

// ═══════════════════════════════════════════════════════════
// renderPrintContent — Pure rendering function
// ═══════════════════════════════════════════════════════════
/**
 * Render a RenderModel to a PNG buffer.
 *
 * Pure function: same RenderModel → same PNG.
 * No side effects, no hook state, no IPC.
 *
 * @param {RenderModel} model - Immutable RenderModel from buildRenderModel()
 * @returns {Promise<Uint8Array|null>} PNG buffer, or null on failure
 */
export async function renderPrintContent(model) {
  // ── Dev-time contract assertion (safety net, NOT validation) ──
  if (import.meta.env.DEV) {
    if (!model?.slots || !model?.layout) {
      throw new Error(
        '[RenderModel CONTRACT VIOLATION] renderPrintContent received non-RenderModel input. ' +
        'Expected { slots: [], layout: {} }. ' +
        'This is an architectural violation — do not bypass buildRenderModel().'
      )
    }
  }

  if (!model || !model.slots || !model.layout) {
    console.error('[renderPrintContent] Invalid RenderModel: must have slots and layout')
    return null
  }

  const { slots, layout } = model
  const items = slotsToRenderItems(slots)

  const { renderMultipleItemsToCanvas } = await getPrintRenderers()

  const canvas = await renderMultipleItemsToCanvas(
    items,
    layout.paperSize,
    PREVIEW_DPI,
    layout.landscape,
    layout.rotations,
    layout.slotCount,
    true,   // isPrint
    false,  // showSafeMargin
    { strategy: layout.strategy || 'vertical' }
  )

  if (!canvas) {
    console.error('[renderPrintContent] renderMultipleItemsToCanvas returned null')
    return null
  }

  const pngBuffer = await canvasToUint8Array(canvas)
  if (!pngBuffer) {
    console.error('[renderPrintContent] canvasToUint8Array returned null')
    return null
  }

  return pngBuffer
}
