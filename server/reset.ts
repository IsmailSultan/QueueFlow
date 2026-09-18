import fs from 'node:fs/promises'
import { config } from './config.js'
import { queue } from './queue.js'

await queue.obliterate({ force: true })

await Promise.all(
  [config.uploadsDir, config.processedDir].map(async (directory) => {
    await fs.rm(directory, { recursive: true, force: true })
    await fs.mkdir(directory, { recursive: true })
  }),
)

await queue.close()
console.log('QueueFlow job history and local image storage have been reset.')
process.exit(0)
