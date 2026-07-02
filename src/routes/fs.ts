import { Request, Response } from 'express'
import { listDirectory } from '../fs/browse'

// GET /fs/list?path=<dir> — powers the PWA folder picker. With no path it
// returns the roots view (drives + home); with a path it lists that directory's
// subfolders. JWT-protected at the router level.
export const makeFsListHandler = () =>
  async (req: Request, res: Response): Promise<void> => {
    const target = typeof req.query.path === 'string' ? req.query.path : undefined
    try {
      const listing = await listDirectory(target)
      res.json(listing)
    } catch (e) {
      res.status(400).json({
        error: { message: `cannot list directory: ${String(e)}`, type: 'invalid_request_error' },
      })
    }
  }
