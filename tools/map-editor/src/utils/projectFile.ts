import { readTextFile, writeTextFile } from '@tauri-apps/plugin-fs'
import type { MapProject } from '../types/project'

export async function loadProjectFile(path: string): Promise<MapProject> {
  const raw = await readTextFile(path)
  return JSON.parse(raw) as MapProject
}

export async function saveProjectFile(path: string, project: MapProject): Promise<void> {
  await writeTextFile(path, JSON.stringify(project, null, 2))
}
