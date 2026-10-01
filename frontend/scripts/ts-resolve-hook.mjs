/**
 * Crochet de résolution pour les scripts qui importent le code source
 * TypeScript du projet.
 *
 * Node 22.18+ sait **retirer les types**, mais pas **résoudre** un import
 * relatif sans extension (`import { x } from './routing'`) : c'est une
 * convention de bundler, pas d'ESM. Les scripts de contrôle qui importent
 * `src/` butaient donc dessus, et — plus grave — leur message d'esquive
 * accusait à tort la version de Node.
 *
 * Ce crochet n'ajoute qu'une chose : pour un specifier RELATIF sans extension
 * qui ne résout pas, essayer `.ts` puis `.tsx`. Rien d'autre n'est touché, en
 * particulier pas les paquets de `node_modules`.
 */
import { existsSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import path from 'node:path'

export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context)
  } catch (error) {
    if (!specifier.startsWith('.') || path.extname(specifier)) throw error

    const from = context.parentURL ? path.dirname(fileURLToPath(context.parentURL)) : process.cwd()
    for (const candidate of [`${specifier}.ts`, `${specifier}.tsx`, `${specifier}/index.ts`]) {
      const absolute = path.resolve(from, candidate)
      if (existsSync(absolute)) {
        return { url: pathToFileURL(absolute).href, shortCircuit: true }
      }
    }
    throw error
  }
}
