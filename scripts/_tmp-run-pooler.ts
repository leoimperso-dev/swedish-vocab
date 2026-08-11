// Runs another script with DATABASE_URL switched to the IPv4 pooler.
// Usage: tsx scripts/_tmp-run-pooler.ts <script.ts> [args...]
import './_tmp-env-pooler'
import path from 'path'
import { pathToFileURL } from 'url'

const [, , target, ...rest] = process.argv
process.argv = [process.argv[0], path.resolve(target), ...rest]
import(pathToFileURL(path.resolve(target)).href)
