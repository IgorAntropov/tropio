import {
  expect,
  it,
} from 'vitest';
import {
  equipmentFolderPath,
  equipmentFolders,
} from '../src/features/trip-draft-dialog/equipment-library';
import type { EquipmentLibraryItem } from '../src/shared/api';

it('keeps identically named subgroups within their parent and lists a folder once', () => {
  const kitchen = { id: crypto.randomUUID(), label: 'Кухня' };
  const camp = { id: crypto.randomUUID(), label: 'Лагерь' };
  const kitchenKit = { id: crypto.randomUUID(), label: 'Запас' };
  const campKit = { id: crypto.randomUUID(), label: 'Запас' };
  const personal = { scope: 'personal', category: 'other' } as const;
  const items: EquipmentLibraryItem[] = [
    {
      id: crypto.randomUUID(),
      ...personal,
      label: 'Кружка',
      group: kitchen,
      subgroup: kitchenKit,
    },
    {
      id: crypto.randomUUID(),
      ...personal,
      label: 'Миска',
      group: kitchen,
    },
    {
      id: crypto.randomUUID(),
      ...personal,
      label: 'Шнур',
      group: camp,
      subgroup: campKit,
    },
    { id: crypto.randomUUID(), ...personal, label: 'Блокнот' },
    {
      id: crypto.randomUUID(),
      scope: 'system',
      category: 'camp',
      label: 'Палатка',
    },
  ];
  expect(equipmentFolders(items)).toEqual([kitchen, camp]);
  expect(equipmentFolders(items, kitchen.id)).toEqual([kitchenKit]);
  expect(equipmentFolders(items, camp.id)).toEqual([campKit]);
  expect(items.map(equipmentFolderPath)).toEqual(['Кухня / Запас', 'Кухня', 'Лагерь / Запас', '', '']);
});
