import { atom } from 'nanostores';

export const projectStore = atom<string | null>(null);

export function setProjectId(projectId: string) {
  projectStore.set(projectId);
}

export function getProjectId(): string | null {
  return projectStore.get();
}
