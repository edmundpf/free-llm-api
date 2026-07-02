import { Request, Response } from 'express'
import { ContextStore } from '../context/store'

// GET /config/context  -> current context folder + enabled flag
// POST /config/context -> set the folder / toggle enabled
// Lets the PWA choose which repo folder on the gateway machine receives the
// transcript. JWT-protected at the router level.
export const makeGetContextHandler = (store: ContextStore) =>
  (_req: Request, res: Response): void => {
    res.json(store.getState())
  }

export const makeSetContextHandler = (store: ContextStore) =>
  async (req: Request, res: Response): Promise<void> => {
    const body = (req.body || {}) as { folder?: unknown; enabled?: unknown }
    const patch: { folder?: string | null; enabled?: boolean } = {}
    if (body.folder === null) patch.folder = null
    else if (typeof body.folder === 'string') patch.folder = body.folder
    if (typeof body.enabled === 'boolean') patch.enabled = body.enabled

    try {
      const state = await store.setState(patch)
      res.json(state)
    } catch (e) {
      res.status(400).json({
        error: { message: String(e instanceof Error ? e.message : e), type: 'invalid_request_error' },
      })
    }
  }
