import type { MapProject } from '../types/project'

export async function loadProjectFile(path: string): Promise<MapProject> {
  const { readTextFile } = await import('@tauri-apps/plugin-fs')
  const raw = await readTextFile(path)
  return JSON.parse(raw) as MapProject
}

export async function saveProjectFile(path: string, project: MapProject): Promise<void> {
  const { writeTextFile } = await import('@tauri-apps/plugin-fs')
  await writeTextFile(path, JSON.stringify(project, null, 2))
}
