// Checks the release notes (utils/releaseNotes.ts): the newest release has the version of package.json, versions are
// unique and descending, dates are valid and in order, every item has both languages.
//   npm run check:release      (exit code 1 when a check fails; -v lists every check)
import { readFileSync } from 'node:fs'
import { RELEASE_NOTES } from '../utils/releaseNotes'

let failures = 0
const check = (name: string, ok: boolean, detail = '') => {
  if (!ok) failures++
  if (!ok || process.argv.includes('-v')) console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -> ' + detail : ''}`)
}
const version = (JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string }).version
const parts = (value: string) => value.split('.').map(Number)
const newer = (a: string, b: string) => {
  const [x, y] = [parts(a), parts(b)]
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i]! > y[i]!
  return false
}

check('newest release = package.json version', RELEASE_NOTES[0]?.version === version, `${RELEASE_NOTES[0]?.version} vs ${version}`)
RELEASE_NOTES.forEach((release, index) => {
  check(`${release.version}: version x.y.z`, /^\d+\.\d+\.\d+$/.test(release.version))
  check(`${release.version}: date`, /^\d{4}-\d{2}-\d{2}$/.test(release.date) && !Number.isNaN(Date.parse(release.date)))
  check(`${release.version}: title in both languages`, !!release.title.cs.trim() && !!release.title.en.trim())
  check(`${release.version}: has items`, release.items.length > 0)
  release.items.forEach((item, i) => check(`${release.version} item ${i + 1}: both languages`, !!item.cs.trim() && !!item.en.trim()))
  const older = RELEASE_NOTES[index + 1]
  if (older) {
    check(`${release.version} newer than ${older.version}`, newer(release.version, older.version))
    check(`${release.version} date not before ${older.version}`, release.date >= older.date)
  }
})
console.log(failures ? `${failures} check(s) failed` : `release notes OK (${RELEASE_NOTES.length} releases, latest ${version})`)
process.exit(failures ? 1 : 0)
