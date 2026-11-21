import type {
  editorApi,
  EquipmentLibraryItem,
} from '@fsd/shared/api';
import { hasInvalidText } from '../../shared/ui/form';

export type PersonalEquipmentInput = Parameters<typeof editorApi.createEquipment>[0];
export type EquipmentFolder = NonNullable<EquipmentLibraryItem['group']>;
export type FolderChoice = NonNullable<PersonalEquipmentInput['group']>;

export function equipmentNameKey(label: string) {
  return label.trim().normalize().toLocaleLowerCase('ru');
}

export function validEquipmentName(label: string) {
  return !!label.trim() && [...label.trim()].length <= 120 && !hasInvalidText(label);
}

export function equipmentFolders(items: readonly EquipmentLibraryItem[], groupId?: string) {
  const folders = new Map<string, EquipmentFolder>();
  for (const item of items) {
    if (item.scope === 'personal' && (!groupId || item.group?.id === groupId)) {
      const folder = groupId ? item.subgroup : item.group;
      if (folder) {
        folders.set(folder.id, folder);
      }
    }
  }
  return [...folders.values()].sort((a, b) => a.label.localeCompare(b.label, 'ru'));
}

export function equipmentFolderPath(item: EquipmentLibraryItem) {
  return [item.group?.label, item.subgroup?.label].filter(Boolean).join(' / ');
}
